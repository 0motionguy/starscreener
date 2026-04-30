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

import type { DataSource } from "./data-store";

export interface StarActivityPoint {
  d: string;       // YYYY-MM-DD (UTC bucket)
  s: number;       // cumulative stars at end of day
  delta: number;   // s - prev.s (denormalized so charts don't recompute on every render)
}

export interface StarActivityPayload {
  repoId: string;                  // "owner/name"
  points: StarActivityPoint[];     // ascending by date
  firstObservedAt: string;         // ISO — when our pipeline first wrote a point
  backfillSource: "stargazer-api" | "snapshot-only";
  coversFirstStar: boolean;        // true when backfill walked all the way back
  updatedAt: string;
}

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
// Chart-prep helpers — pure, used by the interactive chart and the OG card.
// ---------------------------------------------------------------------------

export type StarActivityMode = "date" | "timeline";
export type StarActivityScale = "lin" | "log";
export type StarActivityMetric = "stars" | "velocity" | "mindshare";
export type StarActivityWindow =
  | "7d"
  | "30d"
  | "90d"
  | "6m"
  | "1y"
  | "all";

const WINDOW_DAYS: Record<StarActivityWindow, number | null> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  "6m": 180,
  "1y": 365,
  all: null,
};

/**
 * Slice a payload's points to only those within the chosen time window.
 * Returns the same payload shape with a filtered points array. `all` is a
 * pass-through. Used by the chart and the OG renderer so window selection
 * happens in one place.
 */
export function filterPayloadByWindow(
  payload: StarActivityPayload,
  window: StarActivityWindow,
): StarActivityPayload {
  const days = WINDOW_DAYS[window];
  if (days === null || payload.points.length === 0) return payload;
  const cutoffMs = Date.now() - days * 86_400_000;
  const cutoff = new Date(cutoffMs).toISOString().slice(0, 10);
  const filtered = payload.points.filter((p) => p.d >= cutoff);
  return { ...payload, points: filtered };
}

/**
 * Trailing 7-day rolling mean of `delta` per point. Smooths the noisy
 * day-by-day stars-per-day signal into a "velocity" curve. The first
 * (window-1) points use whatever's available, so a freshly-tracked repo
 * still has a curve from day 1 instead of leaving the chart empty.
 */
export function computeVelocitySeries(payload: StarActivityPayload): number[] {
  const out: number[] = new Array(payload.points.length);
  const W = 7;
  for (let i = 0; i < payload.points.length; i++) {
    const start = Math.max(0, i - (W - 1));
    let sum = 0;
    for (let j = start; j <= i; j++) sum += payload.points[j].delta;
    out[i] = sum / (i - start + 1);
  }
  return out;
}

/**
 * Per-day share-of-stars within the compared set. Returns a Map<date, share%>
 * for the given repo against the supplied set of sibling payloads.
 *
 * MINDSHARE depends on the COMPARED SET, not the global universe — this is
 * "share of stars among the repos you're looking at right now". A repo that
 * looks dominant alone gets a small slice when compared against monsters.
 */
export function computeMindshareSeries(
  selfPayload: StarActivityPayload,
  siblingPayloads: StarActivityPayload[],
): Map<string, number> {
  const totalsByDay = new Map<string, number>();
  for (const sibling of siblingPayloads) {
    for (const p of sibling.points) {
      totalsByDay.set(p.d, (totalsByDay.get(p.d) ?? 0) + p.s);
    }
  }
  const out = new Map<string, number>();
  for (const p of selfPayload.points) {
    const total = totalsByDay.get(p.d) ?? p.s;
    out.set(p.d, total > 0 ? (p.s / total) * 100 : 0);
  }
  return out;
}

export interface ChartPoint {
  /**
   * X coordinate. In `date` mode this is the unix-epoch ms of the bucket;
   * in `timeline` mode it's days-since-the-first-point. Same numeric scale
   * regardless so the chart layer can use a single linear x-axis.
   */
  x: number;
  /**
   * Y coordinate already adjusted for `scale`. For `lin` it's raw cumulative
   * stars; for `log` it's `Math.log10(max(1, stars))`. Charts just plot.
   */
  y: number;
  /** Original star count, kept for tooltips. */
  stars: number;
}

export interface ChartSeries {
  repoId: string;
  points: ChartPoint[];
  /** Bounds for axis-fit on the consumer side. */
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

/**
 * Convert a stored payload into a chart-ready series. Pure function — same
 * inputs always produce the same output, so it's safe to call in both the
 * client component and the server-side OG renderer.
 */
export function deriveChartSeries(
  payload: StarActivityPayload,
  mode: StarActivityMode = "date",
  scale: StarActivityScale = "lin",
): ChartSeries {
  if (payload.points.length === 0) {
    return {
      repoId: payload.repoId,
      points: [],
      xMin: 0,
      xMax: 0,
      yMin: 0,
      yMax: 0,
    };
  }

  const firstMs = parseDayMs(payload.points[0].d);
  const points: ChartPoint[] = payload.points.map((p) => {
    const dayMs = parseDayMs(p.d);
    const x = mode === "timeline" ? (dayMs - firstMs) / 86_400_000 : dayMs;
    // log10(0) is -Infinity; clamp the floor at 1 so a freshly-tracked
    // repo with zero stars doesn't blow up the chart.
    const y = scale === "log" ? Math.log10(Math.max(1, p.s)) : p.s;
    return { x, y, stars: p.s };
  });

  let xMin = points[0].x;
  let xMax = points[0].x;
  let yMin = points[0].y;
  let yMax = points[0].y;
  for (const p of points) {
    if (p.x < xMin) xMin = p.x;
    if (p.x > xMax) xMax = p.x;
    if (p.y < yMin) yMin = p.y;
    if (p.y > yMax) yMax = p.y;
  }

  return { repoId: payload.repoId, points, xMin, xMax, yMin, yMax };
}

function parseDayMs(d: string): number {
  // YYYY-MM-DD strings parse to UTC midnight under Date.parse, which is what
  // we want — the ingestion writer also bucketed by UTC day.
  return Date.parse(`${d}T00:00:00Z`);
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
