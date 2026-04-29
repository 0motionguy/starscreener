// StarScreener — durable data-store abstraction for collector outputs.
//
// PROBLEM
//   30 JSON files in data/ feed the UI. Today they are bundled into the
//   Vercel deploy and a fresh write requires a `git push` to main, which
//   triggers a full prod redeploy. ~17 deploys/day from data churn alone.
//
// SOLUTION
//   This module abstracts read/write of those payloads behind a Redis-first
//   store with file + memory fallback. Collectors write to Redis (no commit),
//   readers fetch from Redis (fresh on every warm Lambda), and the bundled
//   JSON files become a cold-start seed + DR snapshot.
//
// DESIGN GUARANTEES
//   1. read() NEVER throws and NEVER returns null when ANY tier has data.
//      Always returns { data, source, ageMs, fresh } so the UI can degrade
//      gracefully.
//   2. write() best-effort: Redis primary; on Redis failure caller decides
//      whether to retry or proceed (we surface the error). File snapshot is
//      written only when the caller opts in (`mirrorToFile: true`) — this is
//      mostly for collector scripts that want a local artifact.
//   3. Memory cache holds the last-known-good value per key, per process.
//      On a Redis brownout this is the third-tier fallback so the page
//      keeps rendering whatever it last saw.
//   4. No throw-on-boot: missing UPSTASH env vars degrade silently to
//      file+memory only. A single warn is emitted in production.
//
// MODELED AFTER
//   src/lib/api/rate-limit-store.ts — same Upstash-with-memory-fallback
//   pattern, same factory shape, same one-shot warn discipline.

import { dirname, resolve } from "path";

// Lazy-load `fs` to keep this module safe to import (transitively) from
// client components. Webpack bundling for the client side replaces `fs`
// with `false` in next.config; if we used a static top-level import it
// errored "Module not found: Can't resolve 'fs'" during the client build.
// Function-scoped require resolves the binding on the server only and
// stays opaque to webpack's module-graph analysis. Reader libs that wire
// in refreshXxxFromStore() never call into the filesystem tier from the
// client — they only call it from server components / route handlers —
// so this trade is safe.
type FsModule = typeof import("fs");
let _fs: FsModule | null = null;
function fs(): FsModule {
  if (_fs) return _fs;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  _fs = require("fs") as FsModule;
  return _fs;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DataSource = "redis" | "file" | "memory" | "missing";

export interface DataReadResult<T> {
  /** The payload, or null if every tier missed. */
  data: T | null;
  /** Which tier served this read. */
  source: DataSource;
  /** ms since the value was last written (Redis truth, when available). */
  ageMs: number;
  /** False when served from a stale tier (file/memory) due to Redis miss. */
  fresh: boolean;
  /** Set when source==="redis" and fetch succeeded. ISO string. */
  writtenAt?: string;
}

export interface DataWriteOptions {
  /** Also write the JSON to disk under data/<key>.json. Used by collectors. */
  mirrorToFile?: boolean;
  /** Override the per-key TTL. Default: no TTL (Redis keeps until overwritten). */
  ttlSeconds?: number;
}

export interface DataStore {
  read<T>(key: string): Promise<DataReadResult<T>>;
  write<T>(key: string, value: T, opts?: DataWriteOptions): Promise<void>;
  /** Last-write timestamp from Redis without fetching the payload. */
  writtenAt(key: string): Promise<string | null>;
  /** Test/admin — drop a key from every tier. */
  reset(key: string): Promise<void>;
  /**
   * Raw Redis client for non-payload primitives (e.g. SETNX-based
   * idempotency locks for Stripe events). Returns `null` when Redis is
   * disabled — callers must handle the no-Redis fallback themselves.
   */
  redisClient(): RedisClientLike | null;
}

// ---------------------------------------------------------------------------
// Key namespace
// ---------------------------------------------------------------------------

// Bumped if the on-disk shape changes incompatibly. Old keys stay readable
// during a migration window because the writer can dual-write v1 and v2.
const NAMESPACE = "ss:data:v1";
const META_NAMESPACE = "ss:meta:v1";

function payloadKey(key: string): string {
  return `${NAMESPACE}:${key}`;
}

function metaKey(key: string): string {
  return `${META_NAMESPACE}:${key}`;
}

function fileFallbackPath(key: string, dataDir: string): string {
  // key is the bare slug (e.g. "trending"); the on-disk file is data/<slug>.json.
  return resolve(dataDir, `${key}.json`);
}

// ---------------------------------------------------------------------------
// Memory cache (last-known-good per process)
// ---------------------------------------------------------------------------

interface MemoryEntry<T = unknown> {
  data: T;
  writtenAt: string;
  cachedAtMs: number;
}

/**
 * Process-level last-known-good cache for the data-store reads.
 *
 * **PUBLIC-DATA INVARIANT (LIB-16):** every payload routed through this
 * cache MUST be globally public — trending repos, news scans, leaderboards,
 * etc. The cache key is bare slug (no tenant prefix), and the in-memory
 * Map is shared across all requests in the same Node process. The moment
 * a tenant-scoped or user-private payload lands in this layer it leaks
 * across requests.
 *
 * If you need to cache scoped data, namespace the key (e.g.
 * `user:<id>:<slug>`) AND clear on auth boundaries. Don't reuse this
 * primitive directly.
 */
class MemoryCache {
  private readonly entries = new Map<string, MemoryEntry>();

  get<T>(key: string): MemoryEntry<T> | null {
    return (this.entries.get(key) as MemoryEntry<T> | undefined) ?? null;
  }

  set<T>(key: string, data: T, writtenAt: string): void {
    this.entries.set(key, { data, writtenAt, cachedAtMs: Date.now() });
  }

  delete(key: string): void {
    this.entries.delete(key);
  }
}

// ---------------------------------------------------------------------------
// Redis client interface (mockable for tests, no SDK dep at type level)
//
// Same shape as before so the tests + factory plumbing didn't have to
// change when we swapped backends from Upstash REST to Railway-native
// Redis (ioredis). The defaultIoRedisFactory() below adapts ioredis's
// positional set("key", "val", "EX", ttl) syntax back to the
// `{ ex: number }` opts shape this interface uses.
// ---------------------------------------------------------------------------

export interface RedisClientLike {
  get(key: string): Promise<unknown>;
  set(
    key: string,
    value: string,
    opts?: { ex?: number; nx?: boolean },
  ): Promise<unknown>;
  del(...keys: string[]): Promise<number>;
}

// Backwards-compat alias for tests + external callers that still import
// the old name. Will be removed after the test suite is updated.
export type UpstashClientLike = RedisClientLike;

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export type EnvLike = Record<string, string | undefined>;

export interface CreateDataStoreOptions {
  env?: EnvLike;
  /**
   * Override the Redis client factory. Tests inject a fake here. The
   * second argument is undefined for ioredis (URL-only) and the auth
   * token for Upstash REST. Either signature is accepted.
   */
  redisFactory?: (url: string, token?: string) => RedisClientLike;
  /** Backwards-compat alias for tests written against the old name. */
  upstashFactory?: (url: string, token?: string) => RedisClientLike;
  /** Root for file fallback / mirror writes. Defaults to <cwd>/data. */
  dataDir?: string;
  /**
   * If true, file mirror writes are skipped even when the caller asks. Set
   * by the workflow once we want to fully cut the file dependency.
   */
  disableFileMirror?: boolean;
  onFallback?: (
    reason: "env-missing" | "redis-error" | "import-failed",
    err?: unknown,
  ) => void;
}

class DefaultDataStore implements DataStore {
  private readonly redis: RedisClientLike | null;
  private readonly memory = new MemoryCache();
  private readonly dataDir: string;
  private readonly disableFileMirror: boolean;
  private readonly onError: (err: unknown, op: "read" | "write") => void;
  private warnedRedisError = false;

  constructor(opts: {
    redis: RedisClientLike | null;
    dataDir: string;
    disableFileMirror: boolean;
    onError?: (err: unknown, op: "read" | "write") => void;
  }) {
    this.redis = opts.redis;
    this.dataDir = opts.dataDir;
    this.disableFileMirror = opts.disableFileMirror;
    this.onError =
      opts.onError ??
      ((err) => {
        if (!this.warnedRedisError) {
          this.warnedRedisError = true;
          console.warn("[data-store] Redis error, degrading to file/memory:", err);
        }
      });
  }

  async read<T>(key: string): Promise<DataReadResult<T>> {
    // ---- Tier 1: Redis -------------------------------------------------------
    if (this.redis) {
      try {
        const [rawPayload, rawMeta] = await Promise.all([
          this.redis.get(payloadKey(key)),
          this.redis.get(metaKey(key)),
        ]);
        if (rawPayload !== null && rawPayload !== undefined) {
          const data = parsePayload<T>(rawPayload);
          if (data !== null) {
            const writtenAt = parseWrittenAt(rawMeta);
            const ageMs = writtenAt
              ? Math.max(0, Date.now() - new Date(writtenAt).getTime())
              : 0;
            // Update memory cache as last-known-good for any future Redis brownout.
            this.memory.set(key, data, writtenAt ?? new Date().toISOString());
            return {
              data,
              source: "redis",
              ageMs,
              fresh: true,
              writtenAt: writtenAt ?? undefined,
            };
          }
        }
      } catch (err) {
        this.onError(err, "read");
      }
    }

    // ---- Tier 2: File --------------------------------------------------------
    const filePath = fileFallbackPath(key, this.dataDir);
    try {
      const raw = fs().readFileSync(filePath, "utf8");
      const data = JSON.parse(raw) as T;
      const stat = safeStat(filePath);
      const writtenAt = stat ? new Date(stat.mtimeMs).toISOString() : undefined;
      const ageMs = stat ? Math.max(0, Date.now() - stat.mtimeMs) : 0;
      // Promote to memory so subsequent reads stay fast even if file IO is slow.
      this.memory.set(key, data, writtenAt ?? new Date().toISOString());
      return {
        data,
        source: "file",
        ageMs,
        fresh: false,
        writtenAt,
      };
    } catch {
      // File miss is normal once we cut the file path entirely. Fall through.
    }

    // ---- Tier 3: Memory (last-known-good) ------------------------------------
    const cached = this.memory.get<T>(key);
    if (cached) {
      const writtenAtMs = new Date(cached.writtenAt).getTime();
      const ageMs = Math.max(0, Date.now() - writtenAtMs);
      return {
        data: cached.data,
        source: "memory",
        ageMs,
        fresh: false,
        writtenAt: cached.writtenAt,
      };
    }

    // ---- Total miss ----------------------------------------------------------
    return { data: null, source: "missing", ageMs: 0, fresh: false };
  }

  async write<T>(key: string, value: T, opts: DataWriteOptions = {}): Promise<void> {
    const writtenAt = new Date().toISOString();
    const payload = JSON.stringify(value);

    // Always update the memory cache so subsequent reads in the same process
    // can hit it even if Redis is unreachable mid-write.
    this.memory.set(key, value, writtenAt);

    // Best-effort Redis write. We surface the error so the caller (collector
    // script) can decide whether to retry — collectors run in CI and a hard
    // fail gives the operator a red workflow rather than silent stale data.
    if (this.redis) {
      try {
        const setOpts: { ex?: number } | undefined =
          opts.ttlSeconds && opts.ttlSeconds > 0
            ? { ex: opts.ttlSeconds }
            : undefined;
        await Promise.all([
          this.redis.set(payloadKey(key), payload, setOpts),
          this.redis.set(metaKey(key), writtenAt, setOpts),
        ]);
      } catch (err) {
        this.onError(err, "write");
        throw err;
      }
    } else if (!opts.mirrorToFile) {
      // No Redis AND no file mirror: caller would have no durable path.
      // Surface this so the operator notices in CI.
      throw new Error(
        `[data-store] write("${key}") has no destination — Redis not configured and mirrorToFile=false.`,
      );
    }

    if (opts.mirrorToFile && !this.disableFileMirror) {
      const filePath = fileFallbackPath(key, this.dataDir);
      try {
        fs().mkdirSync(dirname(filePath), { recursive: true });
        fs().writeFileSync(filePath, payload, "utf8");
      } catch (err) {
        // File mirror failure is non-fatal (Redis is the truth). Warn only.
        console.warn(`[data-store] File mirror write failed for "${key}":`, err);
      }
    }
  }

  async writtenAt(key: string): Promise<string | null> {
    if (this.redis) {
      try {
        const raw = await this.redis.get(metaKey(key));
        const writtenAt = parseWrittenAt(raw);
        if (writtenAt) return writtenAt;
      } catch (err) {
        this.onError(err, "read");
      }
    }
    const stat = safeStat(fileFallbackPath(key, this.dataDir));
    if (stat) return new Date(stat.mtimeMs).toISOString();
    const cached = this.memory.get(key);
    return cached?.writtenAt ?? null;
  }

  async reset(key: string): Promise<void> {
    this.memory.delete(key);
    if (this.redis) {
      try {
        await this.redis.del(payloadKey(key), metaKey(key));
      } catch (err) {
        this.onError(err, "write");
      }
    }
  }

  redisClient(): RedisClientLike | null {
    return this.redis;
  }
}

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

/**
 * Upstash REST returns either a raw JSON-decoded value or a string depending
 * on whether the underlying value was JSON-stringified at write time. We
 * always write JSON.stringify(...), so the read side may get either:
 *   - the parsed object (if Upstash auto-decoded)
 *   - the literal string (we then JSON.parse)
 * Be tolerant of both shapes to avoid breakage on client-version drift.
 */
function parsePayload<T>(raw: unknown): T | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }
  if (typeof raw === "object") {
    return raw as T;
  }
  return null;
}

function parseWrittenAt(raw: unknown): string | null {
  if (typeof raw === "string" && raw.length > 0) return raw;
  if (raw && typeof raw === "object") {
    // Some Upstash clients auto-parse JSON-looking strings into objects.
    // We always store ISO strings, so an object here is unexpected; ignore.
    return null;
  }
  return null;
}

function safeStat(path: string): { mtimeMs: number } | null {
  try {
    const s = fs().statSync(path);
    return { mtimeMs: s.mtimeMs };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

let warnedAboutFileFallback = false;

export function createDataStore(
  options: CreateDataStoreOptions = {},
): DataStore {
  const env = options.env ?? process.env;
  // Two env var conventions supported (in order of preference):
  //   REDIS_URL                   — Railway / standard ioredis (TCP)
  //   UPSTASH_REDIS_REST_URL      — legacy, kept for fallback compatibility
  // Token is only used for Upstash REST; ioredis encodes auth in the URL.
  const url =
    env.REDIS_URL?.trim() || env.UPSTASH_REDIS_REST_URL?.trim() || "";
  const token = env.UPSTASH_REDIS_REST_TOKEN?.trim();
  const dataDir =
    options.dataDir ?? resolve(process.cwd(), "data");
  const disableFileMirror = options.disableFileMirror === true;

  const onFallback =
    options.onFallback ??
    ((reason, err) => {
      if (env.NODE_ENV !== "production") return;
      if (warnedAboutFileFallback) return;
      warnedAboutFileFallback = true;
      if (reason === "env-missing") {
        console.warn(
          "[data-store] REDIS_URL not set in production — degrading to " +
            "file+memory only. Reads serve the bundled JSON snapshot; " +
            "writes have no durable target. Set REDIS_URL (Railway-style) " +
            "to activate the Redis tier.",
        );
      } else if (reason === "import-failed") {
        console.warn("[data-store] Failed to load Redis client:", err);
      }
    });

  if (!url) {
    onFallback("env-missing");
    return new DefaultDataStore({
      redis: null,
      dataDir,
      disableFileMirror,
    });
  }

  const factory =
    options.redisFactory ?? options.upstashFactory ?? defaultRedisFactory;
  try {
    const redis = factory(url, token);
    return new DefaultDataStore({
      redis,
      dataDir,
      disableFileMirror,
    });
  } catch (err) {
    onFallback("import-failed", err);
    return new DefaultDataStore({
      redis: null,
      dataDir,
      disableFileMirror,
    });
  }
}

/**
 * Default Redis client factory. Picks the backend based on the URL scheme:
 *   redis://  or rediss://  → ioredis (TCP, Railway / self-hosted)
 *   https://                → Upstash REST (legacy)
 *
 * Lazy-required so neither SDK is loaded until the first call. Keeps dev
 * cold starts and unit-test bundles cheap, and the unused client never
 * gets dragged into the webpack graph.
 */
function defaultRedisFactory(url: string, token?: string): RedisClientLike {
  if (url.startsWith("https://") || url.startsWith("http://")) {
    if (!token) {
      throw new Error(
        "[data-store] Upstash REST URL requires UPSTASH_REDIS_REST_TOKEN. " +
          "If using Railway Redis, set REDIS_URL to the redis:// or rediss:// URL instead.",
      );
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("@upstash/redis") as {
      Redis: new (config: { url: string; token: string }) => RedisClientLike;
    };
    return new mod.Redis({ url, token });
  }

  // ioredis path (Railway native Redis or any self-hosted Redis 5+).
  // Lazy require so the SDK is only loaded when actually used. The
  // `default ?? mod` dance covers both ESM-default and CJS shapes that
  // ioredis ships across versions.
  /* eslint-disable @typescript-eslint/no-require-imports */
  const ioredisMod = require("ioredis") as
    | { default: typeof import("ioredis").default }
    | typeof import("ioredis").default;
  /* eslint-enable @typescript-eslint/no-require-imports */
  const IORedisCtor =
    "default" in ioredisMod ? ioredisMod.default : ioredisMod;
  const client = new IORedisCtor(url, {
    // Cap the per-request retry window so a slow Redis doesn't hold a
    // Vercel Lambda invocation past its timeout — collectors prefer
    // fail-loud (workflow goes red) over fail-slow.
    maxRetriesPerRequest: 3,
    // Connection timeout — Railway Redis usually responds in <50 ms, but
    // a 5 s ceiling is generous enough for cold connect from a cold
    // Lambda without blocking the request meaningfully.
    connectTimeout: 5_000,
    // enableOfflineQueue stays at the ioredis default (`true`). Setting
    // it to `false` made the FIRST command on a fresh client fail
    // immediately when the TCP handshake hadn't completed yet — verify
    // script's first SET hit "Stream isn't writeable" on every cold
    // run. With queue=true, ioredis buffers commands during the brief
    // connect window and flushes them once ready; the maxRetries +
    // connectTimeout above still bound the worst case.
  });

  // Without an `error` listener ioredis crashes the process on any
  // transient transport error. We swallow it here — per-call try/catch
  // in the data-store handles the actual fallback.
  client.on("error", (err: Error) => {
    console.warn("[data-store] ioredis transport error:", err.message);
  });

  // Adapt ioredis's positional set("key", "val", "EX", ttl) to the
  // `{ ex: number; nx?: boolean }` opts shape used by RedisClientLike.
  // ioredis SET supports any combination of EX/NX/XX positional flags;
  // returns "OK" on success or null when SET NX doesn't acquire the key.
  //
  // ioredis methods reference `this.options` internally, so we MUST call
  // `client.set(...)` as a method (not via a stored `const setFn = client.set`,
  // which would unbind `this` and explode with
  // "Cannot read properties of undefined (reading 'options')" on the first
  // write that has no opts).
  return {
    get: (key) => client.get(key),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    set: (key, value, opts) => {
      const hasEx = opts && typeof opts.ex === "number" && opts.ex > 0;
      const hasNx = opts?.nx === true;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const c = client as any;
      if (hasEx && hasNx) return c.set(key, value, "EX", opts!.ex, "NX");
      if (hasEx) return c.set(key, value, "EX", opts!.ex);
      if (hasNx) return c.set(key, value, "NX");
      return c.set(key, value);
    },
    del: (...keys) => client.del(...keys),
  };
}

// ---------------------------------------------------------------------------
// Singleton accessor
// ---------------------------------------------------------------------------

let singleton: DataStore | null = null;

export function getDataStore(): DataStore {
  if (!singleton) {
    singleton = createDataStore();
  }
  return singleton;
}

/** Test-only — clear the singleton so each test gets a fresh client. */
export function _resetDataStoreForTests(): void {
  singleton = null;
  warnedAboutFileFallback = false;
}
