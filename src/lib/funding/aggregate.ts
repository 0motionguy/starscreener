// V4 funding aggregate ETL.
//
// Server-only. Reads `FundingEvent[]` from the data-store under the
// `funding-events` key, groups by time window + sector, and exposes
// sync getters that the API routes + server components consume.
//
// Refresh + caching follows the existing pattern (cf. trending.ts,
// bluesky-trending.ts):
//   - module-level mutable cache, seeded empty
//   - refreshFundingFromStore() pulls Redis, swaps cache, never throws
//   - 30s rate-limit + in-flight dedupe so a render burst hits Redis once
//
// Graceful empty: when no `funding-events` payload exists in the store
// (which is the current state — collectors aren't wired yet), every
// getter returns the zero shape. Don't scaffold a fake source — the
// V4 UI is expected to render an empty state until the producer ships.
//
// Exposed surface:
//   - refreshFundingFromStore()      pull-from-Redis
//   - getFundingEvents()             flat list, newest first
//   - getFundingTotals()             24h / 7d / 30d count + USD totals
//   - getFundingSectorBreakdown()    sector → totalUsd / dealCount / topDeal
//   - getFundingTopMovers()          companies with the largest single round
//   - getFundingTopDeals()           highest-amount events in a window

import type {
  FundingEvent,
  FundingEventsFile,
  FundingEventRound,
} from "./types";

// ---------------------------------------------------------------------------
// Time-window primitives
// ---------------------------------------------------------------------------

const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

export type FundingWindow = "24h" | "7d" | "30d";

const WINDOW_MS: Record<FundingWindow, number> = {
  "24h": MS_PER_DAY,
  "7d": 7 * MS_PER_DAY,
  "30d": 30 * MS_PER_DAY,
};

function inWindow(event: FundingEvent, window: FundingWindow, nowMs: number): boolean {
  const closedMs = Date.parse(event.closedAt);
  if (!Number.isFinite(closedMs)) return false;
  return nowMs - closedMs <= WINDOW_MS[window] && closedMs <= nowMs;
}

// ---------------------------------------------------------------------------
// Aggregate output shapes
// ---------------------------------------------------------------------------

export interface FundingWindowTotals {
  window: FundingWindow;
  dealCount: number;
  /** Sum of amountUsd across events with a disclosed amount. */
  totalUsd: number;
  /** Count of events whose amount was undisclosed (excluded from totalUsd). */
  undisclosedCount: number;
}

export interface FundingSectorAggregate {
  sector: string;
  dealCount: number;
  totalUsd: number;
  topDeal: FundingEvent | null;
}

export interface FundingTotalsByWindow {
  "24h": FundingWindowTotals;
  "7d": FundingWindowTotals;
  "30d": FundingWindowTotals;
}

export interface FundingTopMover {
  companyName: string;
  companySlug?: string;
  totalUsd: number;
  dealCount: number;
  /** The largest single round for this company in the window. */
  largestRound: FundingEvent;
}

// ---------------------------------------------------------------------------
// In-memory cache + refresh hook
// ---------------------------------------------------------------------------

// Seeded empty — production payload arrives via refreshFundingFromStore().
let cache: FundingEventsFile = {
  fetchedAt: new Date(0).toISOString(),
  source: "empty",
  events: [],
};

interface RefreshResult {
  source: "redis" | "file" | "memory" | "missing";
  ageMs: number;
  count: number;
}

let inflight: Promise<RefreshResult> | null = null;
let lastRefreshMs = 0;
const MIN_REFRESH_INTERVAL_MS = 30_000;

/**
 * Pull the freshest `funding-events` payload from the data-store and swap
 * it into the in-memory cache. Cheap to call multiple times — internal
 * dedupe + rate-limit ensure we hit Redis at most once per 30s per process.
 *
 * Safe to call from any server component / route handler before reading
 * any sync getter. Never throws; on Redis miss the existing cache stays.
 */
export async function refreshFundingFromStore(): Promise<RefreshResult> {
  if (inflight) return inflight;
  const sinceLast = Date.now() - lastRefreshMs;
  if (sinceLast < MIN_REFRESH_INTERVAL_MS && lastRefreshMs > 0) {
    return {
      source: "memory",
      ageMs: sinceLast,
      count: cache.events.length,
    };
  }

  inflight = (async (): Promise<RefreshResult> => {
    try {
      const { getDataStore } = await import("../data-store");
      const result = await getDataStore().read<FundingEventsFile>(
        "funding-events",
      );
      if (
        result.data &&
        result.source !== "missing" &&
        Array.isArray(result.data.events)
      ) {
        cache = result.data;
      }
      lastRefreshMs = Date.now();
      return {
        source: result.source,
        ageMs: result.ageMs,
        count: cache.events.length,
      };
    } catch {
      // Refresh hooks are explicitly never-throws — a Redis blip should
      // not 500 the page. Existing cache (or seeded-empty) is what we
      // serve until the next refresh window.
      lastRefreshMs = Date.now();
      return { source: "missing", ageMs: 0, count: cache.events.length };
    }
  })().finally(() => {
    inflight = null;
  });

  return inflight;
}

// ---------------------------------------------------------------------------
// Sync getters (read whatever's in the in-memory cache)
// ---------------------------------------------------------------------------

/** Flat list of events, newest first by closedAt. */
export function getFundingEvents(): FundingEvent[] {
  return [...cache.events].sort(
    (a, b) => Date.parse(b.closedAt) - Date.parse(a.closedAt),
  );
}

/** ISO 8601 timestamp of the source payload. */
export function getFundingFetchedAt(): string {
  return cache.fetchedAt;
}

/**
 * Pure aggregator — exported for testing. Counts deals and sums disclosed
 * amounts in a given window.
 */
export function aggregateWindow(
  events: readonly FundingEvent[],
  window: FundingWindow,
  nowMs: number = Date.now(),
): FundingWindowTotals {
  let dealCount = 0;
  let totalUsd = 0;
  let undisclosedCount = 0;
  for (const event of events) {
    if (!inWindow(event, window, nowMs)) continue;
    dealCount += 1;
    if (typeof event.amountUsd === "number" && event.amountUsd > 0) {
      totalUsd += event.amountUsd;
    } else {
      undisclosedCount += 1;
    }
  }
  return { window, dealCount, totalUsd, undisclosedCount };
}

/** 24h / 7d / 30d totals for the current cache. */
export function getFundingTotals(
  nowMs: number = Date.now(),
): FundingTotalsByWindow {
  return {
    "24h": aggregateWindow(cache.events, "24h", nowMs),
    "7d": aggregateWindow(cache.events, "7d", nowMs),
    "30d": aggregateWindow(cache.events, "30d", nowMs),
  };
}

/**
 * Per-sector breakdown for events inside `window`. Events without a sector
 * tag are bucketed under "uncategorized".
 *
 * Sorted by totalUsd desc (largest sector first); ties broken by dealCount.
 */
export function aggregateSectors(
  events: readonly FundingEvent[],
  window: FundingWindow,
  nowMs: number = Date.now(),
): FundingSectorAggregate[] {
  const byKey = new Map<string, FundingSectorAggregate>();
  for (const event of events) {
    if (!inWindow(event, window, nowMs)) continue;
    const sector = event.sector?.trim() || "uncategorized";
    let bucket = byKey.get(sector);
    if (!bucket) {
      bucket = { sector, dealCount: 0, totalUsd: 0, topDeal: null };
      byKey.set(sector, bucket);
    }
    bucket.dealCount += 1;
    const amount = event.amountUsd ?? 0;
    if (amount > 0) bucket.totalUsd += amount;
    if (
      !bucket.topDeal ||
      (event.amountUsd ?? 0) > (bucket.topDeal.amountUsd ?? 0)
    ) {
      bucket.topDeal = event;
    }
  }
  return Array.from(byKey.values()).sort((a, b) => {
    if (b.totalUsd !== a.totalUsd) return b.totalUsd - a.totalUsd;
    return b.dealCount - a.dealCount;
  });
}

export function getFundingSectorBreakdown(
  window: FundingWindow = "30d",
  nowMs: number = Date.now(),
): FundingSectorAggregate[] {
  return aggregateSectors(cache.events, window, nowMs);
}

/**
 * Top movers — companies with the largest cumulative funding in the
 * window. Output is capped at `limit`, sorted by totalUsd desc.
 */
export function aggregateTopMovers(
  events: readonly FundingEvent[],
  window: FundingWindow,
  limit: number,
  nowMs: number = Date.now(),
): FundingTopMover[] {
  const byCompany = new Map<string, FundingTopMover>();
  for (const event of events) {
    if (!inWindow(event, window, nowMs)) continue;
    const key = (event.companySlug ?? event.companyName).toLowerCase();
    const amount = event.amountUsd ?? 0;
    const existing = byCompany.get(key);
    if (!existing) {
      byCompany.set(key, {
        companyName: event.companyName,
        companySlug: event.companySlug,
        totalUsd: amount,
        dealCount: 1,
        largestRound: event,
      });
      continue;
    }
    existing.totalUsd += amount;
    existing.dealCount += 1;
    if ((event.amountUsd ?? 0) > (existing.largestRound.amountUsd ?? 0)) {
      existing.largestRound = event;
    }
  }
  return Array.from(byCompany.values())
    .sort((a, b) => b.totalUsd - a.totalUsd)
    .slice(0, limit);
}

export function getFundingTopMovers(
  window: FundingWindow = "7d",
  limit = 10,
  nowMs: number = Date.now(),
): FundingTopMover[] {
  return aggregateTopMovers(cache.events, window, limit, nowMs);
}

/** Highest-amount individual events in the window, capped at `limit`. */
export function getFundingTopDeals(
  window: FundingWindow = "7d",
  limit = 10,
  nowMs: number = Date.now(),
): FundingEvent[] {
  return cache.events
    .filter((e) => inWindow(e, window, nowMs))
    .filter((e) => typeof e.amountUsd === "number" && e.amountUsd > 0)
    .sort((a, b) => (b.amountUsd ?? 0) - (a.amountUsd ?? 0))
    .slice(0, limit);
}

// ---------------------------------------------------------------------------
// Filters used by the events API
// ---------------------------------------------------------------------------

export interface FundingEventsFilter {
  roundType?: FundingEventRound;
  /** Lower bound on closedAt, inclusive. ISO 8601. */
  since?: string;
  /** Upper bound on the result list. */
  limit?: number;
  /** Skip this many events from the start (for pagination). */
  offset?: number;
}

export interface FundingEventsPage {
  events: FundingEvent[];
  total: number;
  limit: number;
  offset: number;
}

export function queryFundingEvents(
  filter: FundingEventsFilter = {},
): FundingEventsPage {
  const limit = clampInt(filter.limit, 1, 200, 50);
  const offset = clampInt(filter.offset, 0, Number.MAX_SAFE_INTEGER, 0);
  const sinceMs = filter.since ? Date.parse(filter.since) : Number.NEGATIVE_INFINITY;

  const filtered = cache.events.filter((event) => {
    if (filter.roundType && event.roundType !== filter.roundType) return false;
    if (Number.isFinite(sinceMs)) {
      const closedMs = Date.parse(event.closedAt);
      if (!Number.isFinite(closedMs)) return false;
      if (closedMs < sinceMs) return false;
    }
    return true;
  });

  filtered.sort((a, b) => Date.parse(b.closedAt) - Date.parse(a.closedAt));

  return {
    events: filtered.slice(offset, offset + limit),
    total: filtered.length,
    limit,
    offset,
  };
}

function clampInt(
  value: number | undefined,
  min: number,
  max: number,
  fallback: number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  const truncated = Math.trunc(value);
  if (truncated < min) return min;
  if (truncated > max) return max;
  return truncated;
}

// ---------------------------------------------------------------------------
// Test-only seam
// ---------------------------------------------------------------------------

/** Test-only — replace the cache and reset refresh bookkeeping. */
export function _setFundingCacheForTests(file: FundingEventsFile): void {
  cache = file;
  lastRefreshMs = 0;
  inflight = null;
}

/** Test-only — clear back to seeded-empty. */
export function _resetFundingCacheForTests(): void {
  cache = {
    fetchedAt: new Date(0).toISOString(),
    source: "empty",
    events: [],
  };
  lastRefreshMs = 0;
  inflight = null;
}
