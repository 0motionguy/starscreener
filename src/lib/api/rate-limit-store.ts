// StarScreener — Rate-limit KV store abstraction.
//
// Two implementations:
//   - MemoryRateLimitStore   — per-process Map. Fine for dev + single-instance
//                              Node. On Vercel serverless this resets per warm
//                              Lambda, so a determined attacker cycling through
//                              cold starts can exceed the advertised limit.
//   - UpstashRateLimitStore  — @upstash/redis over REST. Shared across every
//                              Lambda on a Vercel deployment. Uses INCR +
//                              EXPIRE ... NX so TTL is set exactly once per
//                              window, and PTTL to report time remaining.
//
// `createStore()` picks Upstash when both REST env vars are set, otherwise
// falls back to memory. In production (NODE_ENV === "production") the
// fallback emits a one-shot console.warn so the operator sees the downgrade
// in logs — but the process never throws at boot just because Upstash is
// missing. That keeps dev / preview deploys unblocked.
//
// The Upstash store also wraps every call in a try/catch that falls back to
// memory on transport errors. Rationale: if Redis is unreachable mid-request
// we'd rather admit one extra request than 500 the whole route. The memory
// fallback is per-instance, so cross-Lambda guarantees degrade but nothing
// breaks. Each Upstash failure logs once per cold start to avoid log spam.

import { RateLimitRecoverableError } from "@/lib/errors";

export interface RateLimitIncrementResult {
  /** New count for `key` after this increment. */
  count: number;
  /** Ms remaining until the window expires. `ttlSec * 1000` on first call. */
  ttlRemainingMs: number;
}

export interface RateLimitStore {
  /**
   * Increment `key`. On the first increment (when the key does not yet
   * exist) also set a TTL of `ttlSec` seconds. Subsequent increments MUST
   * NOT extend the TTL — sliding windows are a separate concern.
   */
  incrementWithTtl(
    key: string,
    ttlSec: number,
  ): Promise<RateLimitIncrementResult>;
  /** Test/admin helper — clear a specific key. */
  reset(key: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Memory implementation
// ---------------------------------------------------------------------------

interface MemoryBucket {
  count: number;
  /** Absolute epoch ms when this bucket expires. */
  expiresAtMs: number;
}

export class MemoryRateLimitStore implements RateLimitStore {
  private readonly buckets = new Map<string, MemoryBucket>();
  private readonly now: () => number;

  constructor(nowFn: () => number = () => Date.now()) {
    this.now = nowFn;
  }

  async incrementWithTtl(
    key: string,
    ttlSec: number,
  ): Promise<RateLimitIncrementResult> {
    const nowMs = this.now();
    const existing = this.buckets.get(key);
    if (!existing || existing.expiresAtMs <= nowMs) {
      const expiresAtMs = nowMs + ttlSec * 1000;
      this.buckets.set(key, { count: 1, expiresAtMs });
      return { count: 1, ttlRemainingMs: ttlSec * 1000 };
    }
    existing.count += 1;
    return {
      count: existing.count,
      ttlRemainingMs: Math.max(0, existing.expiresAtMs - nowMs),
    };
  }

  async reset(key: string): Promise<void> {
    this.buckets.delete(key);
  }
}

// ---------------------------------------------------------------------------
// Upstash implementation
// ---------------------------------------------------------------------------

/**
 * Minimal subset of the @upstash/redis client surface we actually use.
 * Having our own interface lets tests inject a fake without pulling the SDK
 * into the test bundle.
 */
export interface UpstashPipelineLike {
  incr(key: string): UpstashPipelineLike;
  expire(key: string, seconds: number, option: "NX"): UpstashPipelineLike;
  pttl(key: string): UpstashPipelineLike;
  exec(): Promise<unknown[]>;
}

export interface UpstashRedisLike {
  pipeline(): UpstashPipelineLike;
  del(key: string): Promise<number>;
}

export class UpstashRateLimitStore implements RateLimitStore {
  private readonly redis: UpstashRedisLike;
  private readonly onError: (err: unknown) => void;
  private readonly memoryFallback: MemoryRateLimitStore;
  private loggedFallback = false;

  constructor(
    redis: UpstashRedisLike,
    opts: {
      onError?: (err: unknown) => void;
      nowFn?: () => number;
    } = {},
  ) {
    this.redis = redis;
    this.onError =
      opts.onError ??
      ((err: unknown) => {
        // One-shot warn so we don't spam logs under a persistent outage.
        if (!this.loggedFallback) {
          this.loggedFallback = true;
          console.warn(
            "[rate-limit] Upstash unreachable, falling back to memory store",
            err,
          );
        }
      });
    this.memoryFallback = new MemoryRateLimitStore(opts.nowFn);
  }

  async incrementWithTtl(
    key: string,
    ttlSec: number,
  ): Promise<RateLimitIncrementResult> {
    try {
      const pipeline = this.redis.pipeline();
      pipeline.incr(key);
      pipeline.expire(key, ttlSec, "NX");
      pipeline.pttl(key);
      const results = await pipeline.exec();

      // Pipeline returns [incrResult, expireResult, pttlResult]. The exact
      // shape depends on the client version: modern @upstash/redis returns
      // `[count, expireResult, pttl]` directly. We normalise defensively.
      const count = coerceNumber(results[0]);
      const pttl = coerceNumber(results[2]);

      if (count === null) {
        throw new RateLimitRecoverableError(
          "Upstash pipeline returned non-numeric INCR result",
          {
            operation: "incrementWithTtl",
            result: results[0],
          },
        );
      }

      // pttl == -1 → key exists with no TTL (shouldn't happen because we
      // just set EXPIRE NX, but defend against it). pttl == -2 → key
      // doesn't exist (also shouldn't happen after INCR). In either case
      // fall back to the full window.
      const ttlRemainingMs =
        pttl !== null && pttl > 0 ? pttl : ttlSec * 1000;

      return { count, ttlRemainingMs };
    } catch (err) {
      this.onError(err);
      return this.memoryFallback.incrementWithTtl(key, ttlSec);
    }
  }

  async reset(key: string): Promise<void> {
    try {
      await this.redis.del(key);
    } catch (err) {
      this.onError(err);
    }
    await this.memoryFallback.reset(key);
  }
}

function coerceNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Loose env record so tests can pass plain objects without conjuring a
 * full NodeJS.ProcessEnv (which declares NODE_ENV as required).
 */
export type EnvLike = Record<string, string | undefined>;

export interface CreateStoreOptions {
  /** Override env for tests. Defaults to `process.env`. */
  env?: EnvLike;
  /**
   * Factory for the Upstash client. Defaults to a lazy import of
   * `@upstash/redis`. Tests can inject a fake via this hook.
   */
  upstashFactory?: (url: string, token: string) => UpstashRedisLike;
  /**
   * Logger called when production falls back to memory. Defaults to
   * console.warn. Exposed for tests.
   */
  onFallback?: (reason: "env-missing" | "import-failed", err?: unknown) => void;
}

let warnedAboutMemoryFallback = false;

export function createStore(options: CreateStoreOptions = {}): RateLimitStore {
  const env = options.env ?? process.env;
  const url = env.UPSTASH_REDIS_REST_URL?.trim();
  const token = env.UPSTASH_REDIS_REST_TOKEN?.trim();

  const onFallback =
    options.onFallback ??
    ((reason, err) => {
      if (env.NODE_ENV !== "production") return;
      if (warnedAboutMemoryFallback) return;
      warnedAboutMemoryFallback = true;
      if (reason === "env-missing") {
        console.warn(
          "[rate-limit] UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN " +
            "not set in production — falling back to per-instance memory " +
            "limiter. Cross-Lambda guarantees are disabled.",
        );
      } else {
        console.warn(
          "[rate-limit] Failed to load @upstash/redis, falling back to " +
            "memory limiter:",
          err,
        );
      }
    });

  if (!url || !token) {
    onFallback("env-missing");
    return new MemoryRateLimitStore();
  }

  const factory = options.upstashFactory ?? defaultUpstashFactory;

  try {
    const client = factory(url, token);
    return new UpstashRateLimitStore(client);
  } catch (err) {
    onFallback("import-failed", err);
    return new MemoryRateLimitStore();
  }
}

function defaultUpstashFactory(url: string, token: string): UpstashRedisLike {
  // Require at call time so the SDK is only loaded when we're actually
  // going to use it. Keeps dev cold starts cheap and sidesteps bundling
  // it into tests that don't need it.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require("@upstash/redis") as {
    Redis: new (config: { url: string; token: string }) => UpstashRedisLike;
  };
  return new mod.Redis({ url, token });
}

// ---------------------------------------------------------------------------
// Test helpers (not exported via any barrel)
// ---------------------------------------------------------------------------

/** Test-only — reset the one-shot fallback warning flag. */
export function _resetFallbackWarningForTests(): void {
  warnedAboutMemoryFallback = false;
}
