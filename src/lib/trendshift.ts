// TrendShift — reader for the `trendshift-daily` data-store payload.
//
// The worker fetcher at apps/trendingrepo-worker/src/fetchers/trendshift-daily
// scrapes https://trendshift.io/?trending-limit=100, extracts every
// /repositories/<id> anchor, and writes a list of { fullName, rank, url }
// rows ordered by appearance (rank 1 = top of the trending board).
//
// This module exposes:
//   - getTrendshiftRankMap()        sync, returns the latest rank lookup
//   - refreshTrendshiftFromStore()  async, 30s rate-limit, never-throws
//
// Page handler calls the refresh once at the top of the render. The sync
// getter is consulted inside sortRepos() to break ties on the TREND tab.

import trendshiftSeed from "../../data/trendshift-daily.json";

// ---------------------------------------------------------------------------
// Types — match apps/trendingrepo-worker/src/fetchers/trendshift-daily/index.ts
// ---------------------------------------------------------------------------

export interface TrendshiftDailyItem {
  fullName: string;
  rank: number;
  repositoryId: number | null;
  url: string;
  source: "trendshift";
}

export interface TrendshiftDailyPayload {
  fetchedAt: string;
  sourceUrl: string;
  itemCount: number;
  items: TrendshiftDailyItem[];
}

// ---------------------------------------------------------------------------
// In-memory cache (seeded from bundled JSON; swapped by refresh hook)
// ---------------------------------------------------------------------------

let payload: TrendshiftDailyPayload = trendshiftSeed as TrendshiftDailyPayload;
let rankMap: Map<string, number> = buildRankMap(payload);

function buildRankMap(p: TrendshiftDailyPayload): Map<string, number> {
  const out = new Map<string, number>();
  for (const item of p.items ?? []) {
    if (!item?.fullName) continue;
    const key = item.fullName.toLowerCase();
    const rank = Number.isFinite(item.rank) ? item.rank : 9999;
    // First occurrence wins (anchors at top of page rank lower-numerically).
    if (!out.has(key)) out.set(key, rank);
  }
  return out;
}

/**
 * Returns the current { fullName.toLowerCase() → rank } map. Rank 1 = top of
 * the TrendShift board. Lookup-keys are always lowercased.
 */
export function getTrendshiftRankMap(): Map<string, number> {
  return rankMap;
}

export function getTrendshiftPayload(): TrendshiftDailyPayload {
  return payload;
}

// ---------------------------------------------------------------------------
// Refresh hook — pull latest trendshift-daily from the data-store.
// 30s rate-limit + in-flight dedupe + never-throws. Mirrors trending.ts.
// ---------------------------------------------------------------------------

let inflight: Promise<{ trendshift: { source: string; ageMs: number } }> | null =
  null;
let lastRefreshMs = 0;
const MIN_REFRESH_INTERVAL_MS = 30_000;

export async function refreshTrendshiftFromStore(): Promise<{
  trendshift: { source: string; ageMs: number };
}> {
  if (inflight) return inflight;
  const sinceLast = Date.now() - lastRefreshMs;
  if (sinceLast < MIN_REFRESH_INTERVAL_MS && lastRefreshMs > 0) {
    return { trendshift: { source: "memory", ageMs: sinceLast } };
  }
  inflight = (async () => {
    try {
      const { getDataStore } = await import("./data-store");
      const result = await getDataStore().read<TrendshiftDailyPayload>(
        "trendshift-daily",
      );
      if (result.data && result.source !== "missing") {
        payload = result.data;
        rankMap = buildRankMap(payload);
      }
      lastRefreshMs = Date.now();
      return { trendshift: { source: result.source, ageMs: result.ageMs } };
    } catch {
      lastRefreshMs = Date.now();
      return { trendshift: { source: "memory", ageMs: 0 } };
    }
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}
