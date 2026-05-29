// TrendingRepo — Star-Activity Deltas (GitHub-direct 24h/7d/30d star growth).
//
// The OSS-Insight-independent delta backbone for the homepage Top/Gainer/Trend
// tabs. Produced by the worker fetcher
//   apps/trendingrepo-worker/src/fetchers/star-activity-deltas/index.ts
// which diffs each repo's `star-activity` daily cumulative star series
// (collected straight from the GitHub API) over 24h/7d/30d windows.
//
// WHY this exists: until now every 7d/30d delta on the site derived from
// api.ossinsight.io (directly via the `trending` past_week/past_month buckets,
// or transitively via the snapshot-based `deltas` slug whose ring is too
// shallow for a 7d/30d window). When OSS Insight 500s for days at a time,
// 7d/30d collapse to "—". This slug is the durable secondary that survives
// that outage. `derived-repos.ts` (resolveDelta) prefers it for 7d/30d.
//
// Single global slug `star-activity-deltas`, keyed by lowercased fullName.
// Read pattern mirrors src/lib/trending.ts: call
// refreshStarActivityDeltasFromStore() once before render, then the sync
// getters return whatever's in the in-memory cache.

import type { DataSource } from "./data-store";

export type SADeltaBasis = "exact" | "nearest" | "cold-start" | "no-history";

export interface SADeltaValue {
  value: number | null;
  basis: SADeltaBasis;
  from_d?: string;
  age_days?: number;
}

export interface SADeltaEntry {
  stars_now: number;
  latest_d: string;
  delta_24h: SADeltaValue;
  delta_7d: SADeltaValue;
  delta_30d: SADeltaValue;
}

export interface StarActivityDeltasFile {
  computedAt: string;
  coverage?: Record<string, number>;
  repos: Record<string, SADeltaEntry>;
}

const EMPTY: StarActivityDeltasFile = { computedAt: "", repos: {} };
const SLUG = "star-activity-deltas";
const MIN_REFRESH_INTERVAL_MS = 30_000;

// Module-scoped cache (same discipline as trending.ts `deltas`). No bundled
// seed file exists for this slug — the data-store read returns source
// "missing" until the worker has published to Redis, and the cache stays
// empty (honest "—" rather than fabricated numbers).
let cache: StarActivityDeltasFile = EMPTY;
let inflight: Promise<RefreshOutcome> | null = null;
let lastRefreshMs = 0;

export interface RefreshOutcome {
  source: DataSource;
  ageMs: number;
}

/**
 * Synchronous getter — returns the whole in-memory payload. Pair with
 * refreshStarActivityDeltasFromStore() exactly like getDeltas /
 * refreshTrendingFromStore are paired in src/lib/trending.ts.
 */
export function getStarActivityDeltas(): StarActivityDeltasFile {
  return cache;
}

/**
 * Data-version for derived-repos' process-global cache key. Changes whenever
 * a fresh payload is swapped in (worker stamps a new `computedAt` per run),
 * so a newly-published delta set invalidates the derived-repos cache and the
 * homepage picks up real 7d/30d without waiting on another upstream to move.
 */
export function getStarActivityDeltasDataVersion(): string {
  return cache.computedAt || "empty";
}

/**
 * Convenience lookup of one repo's delta entry by fullName (case-insensitive).
 * Returns null when the repo has no GitHub-direct delta yet.
 */
export function getStarActivityDelta(fullName: string): SADeltaEntry | null {
  return cache.repos[fullName.toLowerCase()] ?? null;
}

/**
 * Pull the latest star-activity-deltas payload from the data-store and swap
 * it into the in-memory cache. One cheap single-key Redis read, deduped +
 * rate-limited to once per 30s per process. Never throws — on miss the
 * existing cache is preserved.
 */
export async function refreshStarActivityDeltasFromStore(): Promise<RefreshOutcome> {
  if (inflight) return inflight;
  const sinceLast = Date.now() - lastRefreshMs;
  if (sinceLast < MIN_REFRESH_INTERVAL_MS && lastRefreshMs > 0) {
    return { source: "memory", ageMs: sinceLast };
  }

  inflight = (async (): Promise<RefreshOutcome> => {
    try {
      const { getDataStore } = await import("./data-store");
      const store = getDataStore();
      const result = await store.read<StarActivityDeltasFile>(SLUG);
      if (result.data && result.source !== "missing") {
        cache = result.data;
      }
      lastRefreshMs = Date.now();
      return { source: result.source, ageMs: result.ageMs };
    } catch {
      lastRefreshMs = Date.now();
      return { source: "missing", ageMs: 0 };
    }
  })().finally(() => {
    inflight = null;
  });

  return inflight;
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Reset the in-memory cache + dedupe state. Test-only. */
export function _resetStarActivityDeltasCacheForTests(): void {
  cache = EMPTY;
  lastRefreshMs = 0;
  inflight = null;
}

/** Direct seed — used by tests that don't want to mock the data-store. */
export function _seedStarActivityDeltasForTests(
  file: StarActivityDeltasFile,
): void {
  cache = file;
}
