// TrendingRepo — Star Activity (full-history stargazer time series).
//
// Per-repo daily cumulative star series, persisted in Redis under
//   ss:data:v1:star-activity:{owner}__{name}
//
// Two writers feed it:
//   1. scripts/backfill-star-activity.mjs — one-shot reconstruction by walking
//      the GitHub /stargazers endpoint for repos under the 40k-star list cap.
//   2. scripts/append-star-activity.mjs   — daily forward append (one new
//      cumulative point per repo per UTC day, sourced from the cheap
//      /repos/{owner}/{name} stargazers_count endpoint).
//
// Read pattern matches src/lib/trending.ts but is per-repo, not global —
// /compare may load 4 repos at once and we don't want a global rate-limit
// to deduplicate them into one fetch.

import "server-only";

import type { DataSource } from "./data-store";
import type { StarActivityPayload } from "./star-activity-shared";
export {
  computeMindshareSeries,
  computeVelocitySeries,
  deriveChartSeries,
  filterPayloadByWindow,
} from "./star-activity-shared";
export type {
  ChartPoint,
  ChartSeries,
  StarActivityMetric,
  StarActivityMode,
  StarActivityPayload,
  StarActivityPoint,
  StarActivityScale,
  StarActivityWindow,
} from "./star-activity-shared";

// Per-repo cache, refresh metadata, and in-flight dedupe. Sized
// generously — any tracked repo can be visited; we don't proactively
// evict because the values are small (~33 KB at 3 years × 1 entry/day).
const cache = new Map<string, StarActivityPayload>();

interface RefreshState {
  inflight: Promise<RefreshOutcome> | null;
  lastRefreshMs: number;
}
const refreshState = new Map<string, RefreshState>();

const MIN_REFRESH_INTERVAL_MS = 30_000;

export interface RefreshOutcome {
  source: DataSource;
  ageMs: number;
}

function normalizeRepoId(repoId: string): string {
  // The data-store slug uses `__` instead of `/` because the existing file-mirror
  // path resolves `data/<slug>.json` and a slash would create a subdirectory
  // boundary the writer/reader don't agree on. Internal cache key keeps the
  // canonical owner/name form so callers don't have to know about the swap.
  return repoId.toLowerCase();
}

function payloadSlug(repoId: string): string {
  return `star-activity:${repoId.toLowerCase().replace("/", "__")}`;
}

/**
 * Synchronous getter for an already-fetched payload. Returns null if the
 * caller didn't `refreshStarActivityFromStore` first OR if the data-store
 * has nothing for this repo. Pair with `refresh*` exactly the way
 * `getTrending`/`refreshTrendingFromStore` are paired in src/lib/trending.ts.
 */
export function getStarActivity(repoId: string): StarActivityPayload | null {
  return cache.get(normalizeRepoId(repoId)) ?? null;
}

/**
 * Pull the latest star-activity payload for `repoId` from the data-store
 * and swap it into the in-memory cache. Per-repo dedupe + 30s rate-limit
 * so the chart and the OG endpoint can both call this on every render
 * without hammering Redis.
 *
 * Never throws — on miss the existing cache entry is preserved (null if none).
 */
export async function refreshStarActivityFromStore(
  repoId: string,
): Promise<RefreshOutcome> {
  const key = normalizeRepoId(repoId);
  const state = refreshState.get(key) ?? { inflight: null, lastRefreshMs: 0 };

  if (state.inflight) return state.inflight;

  const sinceLast = Date.now() - state.lastRefreshMs;
  if (sinceLast < MIN_REFRESH_INTERVAL_MS && state.lastRefreshMs > 0) {
    return { source: "memory", ageMs: sinceLast };
  }

  const promise = (async (): Promise<RefreshOutcome> => {
    const { getDataStore } = await import("./data-store");
    const store = getDataStore();
    const result = await store.read<StarActivityPayload>(payloadSlug(repoId));
    if (result.data && result.source !== "missing") {
      cache.set(key, result.data);
    }
    state.lastRefreshMs = Date.now();
    return { source: result.source, ageMs: result.ageMs };
  })().finally(() => {
    state.inflight = null;
  });

  state.inflight = promise;
  refreshState.set(key, state);
  return promise;
}

// ---------------------------------------------------------------------------
// Test helper
// ---------------------------------------------------------------------------

/** Reset the per-process cache + dedupe state. Test-only. */
export function _resetStarActivityCacheForTests(): void {
  cache.clear();
  refreshState.clear();
}

/** Test-only direct seed — used by tests that don't want to mock the data-store. */
export function _seedStarActivityForTests(
  repoId: string,
  payload: StarActivityPayload,
): void {
  cache.set(normalizeRepoId(repoId), payload);
}

// ---------------------------------------------------------------------------
// Star-plot request counter — surfaces the "plots today" KPI on /tools.
// ---------------------------------------------------------------------------

/**
 * Count star-history plot renders queued for `date` (YYYY-MM-DD, UTC).
 *
 * Honest stub: there is NO `star_plot_requests` table in the Drizzle schema
 * today and no instrumentation in the /tools/star-history route writes one.
 * Until the metric is wired (planned next sprint), this reader returns 0 so
 * `ToolsKpiStrip` can render a real number ("0") instead of an em-dash.
 *
 * Signature mirrors `countArchivedTop10Snapshots` over in the tools page —
 * a `date` string parameter, async, returns a `Promise<number>`. When the
 * real table arrives, callers won't need to change.
 *
 * Degrades gracefully — never throws. The /tools page wraps every reader
 * in `safeAsync()` anyway, but we double-belt this one because /tools is a
 * public ISR route that must NEVER 500 on a missing metric.
 */
export async function countStarPlotRequests(_date: string): Promise<number> {
  try {
    // Intentionally a no-op until the instrumentation lands. Keeping the
    // body small + side-effect-free so future implementers can swap in a
    // single `db.select().from(starPlotRequests).where(...)` call without
    // changing the public contract.
    return 0;
  } catch (err) {
    console.warn("[star-activity/countStarPlotRequests] degraded:", err);
    return 0;
  }
}
