// Generic data-store payload reader factory.
//
// Extracts the duplicated pattern that every per-source reader was
// open-coding: an in-memory cache, a 30s rate-limit + in-flight dedupe on
// `refreshXxxFromStore()`, and a `read<T>(key)` against the data-store that
// preserves the existing entry on Redis miss.
//
// Canonical reference for the runtime semantics this factory matches is
// `refreshTrendingFromStore` in src/lib/trending.ts. Trending itself isn't
// migrated to this factory because it juggles two payloads (trending +
// deltas) plus a derived `_fullNameToRepoId` cache — out of scope for the
// single-payload abstraction here.
//
// Usage:
//   const reader = createPayloadReader<MyPayload>({
//     key: "my-key",
//     normalize: normalizeMyPayload,   // optional — defaults to identity
//     emptyPayload: EMPTY,             // returned by getPayload() before first refresh
//   });
//   export const refreshMyFromStore = reader.refresh;
//   export const getMyPayload = reader.getPayload;
//   export const _resetMyCacheForTests = reader.reset;
//
// The factory does NOT swallow errors silently — it follows the existing
// per-module convention: catch, set lastRefreshMs to now (so retries respect
// the rate-limit), return the cached entry's metadata or a `missing` sentinel.

import { getDataStore, type DataReadResult } from "./data-store";

export type DataSource = "redis" | "file" | "memory" | "missing";

export interface RefreshResult {
  source: DataSource;
  ageMs: number;
  writtenAt: string | null;
}

export interface CacheEntry<T> {
  payload: T;
  source: DataSource;
  writtenAt: string | null;
  ageMs: number;
}

export interface CreatePayloadReaderOpts<T> {
  /** Data-store key. e.g. "consensus-trending". */
  key: string;
  /** Default payload returned by `getPayload()` before the first successful refresh. */
  emptyPayload: T;
  /**
   * Normalize/validate the raw `unknown` Redis payload into `T`. Defaults to
   * an identity cast. Throw or return a "best-effort empty" value on
   * unrecoverable shape — the factory will treat the cache as untouched on
   * thrown errors (existing memory tier preserved).
   */
  normalize?: (raw: unknown) => T;
  /**
   * Render wait budget for this reader. The underlying store read may keep
   * settling in the background, but callers stop waiting and reuse cache.
   */
  refreshTimeoutMs?: number;
  /** Override for tests or unusually fast/slow sources. */
  minRefreshIntervalMs?: number;
  /** Test seam; defaults to getDataStore().read. */
  readFromStore?: <Raw = unknown>(key: string) => Promise<DataReadResult<Raw>>;
}

export interface PayloadReader<T> {
  /**
   * Pull the freshest payload from the data-store and swap it into the
   * in-memory cache. Cheap to call repeatedly:
   *   - In-flight dedupe collapses concurrent calls into one Redis hit.
   *   - 30s rate-limit caps refresh frequency at ~120/hr per process.
   *   - Never throws. On Redis miss the existing cache entry is preserved.
   */
  refresh: () => Promise<RefreshResult>;
  /**
   * Synchronous read of the cached payload. Returns the configured
   * `emptyPayload` until the first successful refresh.
   */
  getPayload: () => T;
  /**
   * Synchronous read of the cache envelope (payload + source/writtenAt/ageMs).
   * Returns `null` until the first successful refresh — callers that need
   * staleness metadata should check for null before reading.
   */
  getEntry: () => CacheEntry<T> | null;
  /** Test-only — clear cache + dedupe state. */
  reset: () => void;
}

const MIN_REFRESH_INTERVAL_MS = 30_000;
const PAYLOAD_READER_REFRESH_TIMEOUT_MS = 1200;

/**
 * Build a single-payload reader bound to a data-store key. Handles cache,
 * 30s rate-limit, and in-flight dedupe. Replaces ~80 LOC of per-module
 * boilerplate with a 5-line wiring at each call site.
 */
export function createPayloadReader<T>(
  opts: CreatePayloadReaderOpts<T>,
): PayloadReader<T> {
  const normalize = opts.normalize ?? ((raw: unknown) => raw as T);
  const minRefreshIntervalMs =
    opts.minRefreshIntervalMs ?? MIN_REFRESH_INTERVAL_MS;
  const refreshTimeoutMs =
    opts.refreshTimeoutMs ?? PAYLOAD_READER_REFRESH_TIMEOUT_MS;
  const readFromStore =
    opts.readFromStore ??
    (<Raw = unknown>(key: string) => getDataStore().read<Raw>(key));

  let cache: CacheEntry<T> | null = null;
  let inflight: Promise<RefreshResult> | null = null;
  let lastRefreshMs = 0;
  let refreshGeneration = 0;
  let latestAppliedGeneration = 0;

  const cachedRefreshResult = (): RefreshResult => ({
    source: cache?.source ?? "missing",
    ageMs: cache?.ageMs ?? 0,
    writtenAt: cache?.writtenAt ?? null,
  });

  const refresh = (): Promise<RefreshResult> => {
    if (inflight) return inflight;
    const sinceLast = Date.now() - lastRefreshMs;
    if (sinceLast < minRefreshIntervalMs && lastRefreshMs > 0) {
      return Promise.resolve(cachedRefreshResult());
    }

    const generation = (refreshGeneration += 1);
    const background = (async (): Promise<RefreshResult> => {
      try {
        const result = await readFromStore<unknown>(opts.key);
        if (result.data && result.source !== "missing") {
          const nextCache = {
            payload: normalize(result.data),
            source: result.source,
            writtenAt: result.writtenAt ?? null,
            ageMs: result.ageMs,
          };
          if (generation >= latestAppliedGeneration) {
            cache = nextCache;
            latestAppliedGeneration = generation;
          }
        }
        lastRefreshMs = Date.now();
        return {
          source: result.source,
          ageMs: result.ageMs,
          writtenAt: result.writtenAt ?? null,
        };
      } catch {
        lastRefreshMs = Date.now();
        return cachedRefreshResult();
      }
    })();

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    inflight = Promise.race([
      background,
      new Promise<RefreshResult>((resolve) => {
        timeoutId = setTimeout(() => {
          lastRefreshMs = Date.now();
          resolve(cachedRefreshResult());
        }, refreshTimeoutMs);
      }),
    ]).finally(() => {
      if (timeoutId) clearTimeout(timeoutId);
      inflight = null;
    });

    return inflight;
  };

  return {
    refresh,
    getPayload: () => cache?.payload ?? opts.emptyPayload,
    getEntry: () => cache,
    reset: () => {
      cache = null;
      inflight = null;
      lastRefreshMs = 0;
    },
  };
}
