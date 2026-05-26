// TrendingRepo — Fork Activity (full-history fork-count time series).
//
// Per-repo daily cumulative fork series, intended to be persisted in Redis
// under `ss:data:v1:fork-activity:{owner}__{name}` once the collector ships.
//
// CURRENT STATUS — 2026-05-25 (Agent 6, /repo profile rebuild)
//   No fork-history cron has been written yet. The companion star-activity
//   pipeline (`scripts/backfill-star-activity.mjs` + `scripts/append-star-
//   activity.mjs`) provides the template for the eventual fork writer, but
//   nothing under .github/workflows/ collects forks today. As a result
//   `getForkActivity()` resolves to `null` on every repo and the chart
//   renders the empty state instead of a fabricated series.
//
//   The matching reader / refresh pair is wired up now so when the cron
//   lands, the chart picks it up without touching the page.tsx contract
//   or the component code.
//
// MISSING-CRON NOTE
//   A new GitHub Actions workflow analogous to `append-star-activity.yml`
//   needs to:
//     1. Read `data/trending.json` for the tracked repo list.
//     2. Call GET /repos/{owner}/{name} per repo and capture
//        `forks_count` into a daily UTC bucket.
//     3. Write `ForkActivityPayload` via `writeDataStore(payloadSlug(...))`.
//   Out of scope for Agent 6.

import type { DataSource } from "./data-store";

export interface ForkActivityPoint {
  d: string;       // YYYY-MM-DD (UTC bucket)
  f: number;       // cumulative forks at end of day
  delta: number;   // f - prev.f (denormalized so charts don't recompute on every render)
}

export interface ForkActivityPayload {
  repoId: string;                  // "owner/name"
  points: ForkActivityPoint[];     // ascending by date
  firstObservedAt: string;         // ISO — when our pipeline first wrote a point
  // Until a backfill walker ships, the only writer will be a daily append
  // ("forks-api-snapshot"). The discriminator keeps room for a future
  // pagination-based backfill ("forks-api-walk") without breaking readers.
  backfillSource: "forks-api-snapshot" | "forks-api-walk";
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Per-process cache + dedupe — same shape as star-activity so the page can
// pair them.
// ---------------------------------------------------------------------------

const cache = new Map<string, ForkActivityPayload>();

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
  return repoId.toLowerCase();
}

function payloadSlug(repoId: string): string {
  return `fork-activity:${repoId.toLowerCase().replace("/", "__")}`;
}

/**
 * Synchronous getter for an already-fetched fork-activity payload. Returns
 * null if the caller didn't `refreshForkActivityFromStore` first OR if the
 * data-store has nothing for this repo (the expected state until a fork
 * collector ships).
 */
export function getForkActivity(repoId: string): ForkActivityPayload | null {
  return cache.get(normalizeRepoId(repoId)) ?? null;
}

/**
 * Pull the latest fork-activity payload for `repoId` from the data-store.
 * Mirrors `refreshStarActivityFromStore` so callers can `await Promise.all`
 * both refreshes side-by-side on the /repo page render.
 *
 * Never throws — on miss (the current default for every repo) the existing
 * cache entry is preserved (null if none).
 */
export async function refreshForkActivityFromStore(
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
    const result = await store.read<ForkActivityPayload>(payloadSlug(repoId));
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
// Chart-prep helpers — pure. Match the star-activity API surface so the
// chart row can reuse window selection without per-series duplication.
// ---------------------------------------------------------------------------

export type ForkActivityWindow =
  | "30d"
  | "90d"
  | "6m"
  | "1y"
  | "all";

const WINDOW_DAYS: Record<ForkActivityWindow, number | null> = {
  "30d": 30,
  "90d": 90,
  "6m": 180,
  "1y": 365,
  all: null,
};

/**
 * Slice a payload's points to only those within the chosen time window.
 * Identical shape to `filterPayloadByWindow` over in star-activity.ts so
 * the two charts behave the same.
 */
export function filterForkPayloadByWindow(
  payload: ForkActivityPayload,
  window: ForkActivityWindow,
): ForkActivityPayload {
  const days = WINDOW_DAYS[window];
  if (days === null || payload.points.length === 0) return payload;
  const cutoffMs = Date.now() - days * 86_400_000;
  const cutoff = new Date(cutoffMs).toISOString().slice(0, 10);
  const filtered = payload.points.filter((p) => p.d >= cutoff);
  return { ...payload, points: filtered };
}

// ---------------------------------------------------------------------------
// Test helpers — mirror star-activity so the fork chart can be unit-tested
// without touching the real data-store.
// ---------------------------------------------------------------------------

/** Reset the per-process cache + dedupe state. Test-only. */
export function _resetForkActivityCacheForTests(): void {
  cache.clear();
  refreshState.clear();
}

/** Test-only direct seed — used by tests that don't want to mock the data-store. */
export function _seedForkActivityForTests(
  repoId: string,
  payload: ForkActivityPayload,
): void {
  cache.set(normalizeRepoId(repoId), payload);
}
