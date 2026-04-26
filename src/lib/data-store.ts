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
// Upstash client interface (mockable for tests, no SDK dep at type level)
// ---------------------------------------------------------------------------

export interface UpstashClientLike {
  get(key: string): Promise<unknown>;
  set(
    key: string,
    value: string,
    opts?: { ex?: number },
  ): Promise<unknown>;
  del(...keys: string[]): Promise<number>;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export type EnvLike = Record<string, string | undefined>;

export interface CreateDataStoreOptions {
  env?: EnvLike;
  /** Override the Upstash factory. Tests inject a fake here. */
  upstashFactory?: (url: string, token: string) => UpstashClientLike;
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
  private readonly redis: UpstashClientLike | null;
  private readonly memory = new MemoryCache();
  private readonly dataDir: string;
  private readonly disableFileMirror: boolean;
  private readonly onError: (err: unknown, op: "read" | "write") => void;
  private warnedRedisError = false;

  constructor(opts: {
    redis: UpstashClientLike | null;
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
  const url = env.UPSTASH_REDIS_REST_URL?.trim();
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
          "[data-store] UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN " +
            "not set in production — degrading to file+memory only. Reads " +
            "serve the bundled JSON snapshot; writes have no durable target.",
        );
      } else if (reason === "import-failed") {
        console.warn("[data-store] Failed to load @upstash/redis:", err);
      }
    });

  if (!url || !token) {
    onFallback("env-missing");
    return new DefaultDataStore({
      redis: null,
      dataDir,
      disableFileMirror,
    });
  }

  const factory = options.upstashFactory ?? defaultUpstashFactory;
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

function defaultUpstashFactory(url: string, token: string): UpstashClientLike {
  // Lazy require so `@upstash/redis` is only loaded when actually used.
  // Keeps dev cold starts and unit-test bundles cheap.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require("@upstash/redis") as {
    Redis: new (config: { url: string; token: string }) => UpstashClientLike;
  };
  return new mod.Redis({ url, token });
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
