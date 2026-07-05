// mentions-daily reader — the real per-day mention series behind the
// /market-signals volume chart + tag momentum. Written by the worker fetcher
// `apps/trendingrepo-worker/src/fetchers/mentions-daily` (slug `mentions-daily`)
// as CUMULATIVE per-source counts per day; the app diffs consecutive days into
// "new mentions/day" here so the chart shows a real, non-flat series.
//
// Redis is the source of truth. Server components call
// `refreshMentionsDailyFromStore()` once before reading the sync getters;
// 30s rate-limit + in-flight dedupe keep concurrent renders cheap.

import "server-only";

export interface MentionsDailyRow {
  date: string; // YYYY-MM-DD (UTC)
  perSource: Record<string, number>;
  total: number;
}
export interface MentionsDailyFile {
  days: MentionsDailyRow[];
  writtenAt?: string;
}

/** Social sources tracked in the daily snapshot (GitHub is star-velocity, kept separate). */
export const DAILY_SOURCES = ["hackernews", "twitter", "bluesky", "devto", "lobsters"] as const;
export type DailySource = (typeof DAILY_SOURCES)[number];

const SLUG = "mentions-daily";

let cached: MentionsDailyFile | null = null;
let inflight: Promise<void> | null = null;
let lastRefreshMs = 0;
const MIN_REFRESH_INTERVAL_MS = 30_000;

export function getMentionsDaily(): MentionsDailyFile | null {
  return cached;
}

export async function refreshMentionsDailyFromStore(): Promise<void> {
  if (inflight) return inflight;
  const since = Date.now() - lastRefreshMs;
  if (since < MIN_REFRESH_INTERVAL_MS && lastRefreshMs > 0) return;

  inflight = (async () => {
    try {
      const { getDataStore } = await import("./data-store");
      const res = await getDataStore().read<MentionsDailyFile>(SLUG);
      if (res.data && res.source !== "missing" && Array.isArray(res.data.days)) {
        cached = res.data;
      }
    } catch {
      /* keep prior cache */
    } finally {
      lastRefreshMs = Date.now();
    }
  })().finally(() => {
    inflight = null;
  });

  return inflight;
}

export interface DailyVolumePoint {
  date: string;
  hackernews: number;
  twitter: number;
  bluesky: number;
  devto: number;
  lobsters: number;
}

/**
 * Per-day NEW mentions per source (cumulative day[i] − day[i−1], floored at 0).
 * `hasHistory` is false until at least 2 daily snapshots exist — the render
 * then falls back to an honest current-totals view instead of a fake time series.
 */
export function getMentionsDailySeries(): { points: DailyVolumePoint[]; hasHistory: boolean } {
  const days = cached?.days ?? [];
  if (days.length < 2) return { points: [], hasHistory: false };
  const diff = (cur: Record<string, number>, prev: Record<string, number>, k: string) =>
    Math.max(0, Number(cur?.[k] ?? 0) - Number(prev?.[k] ?? 0));
  const points: DailyVolumePoint[] = [];
  for (let i = 1; i < days.length; i += 1) {
    const cur = days[i].perSource ?? {};
    const prev = days[i - 1].perSource ?? {};
    points.push({
      date: days[i].date,
      hackernews: diff(cur, prev, "hackernews"),
      twitter: diff(cur, prev, "twitter"),
      bluesky: diff(cur, prev, "bluesky"),
      devto: diff(cur, prev, "devto"),
      lobsters: diff(cur, prev, "lobsters"),
    });
  }
  return { points, hasHistory: points.length > 0 };
}

/** Latest cumulative per-source totals (for the current-snapshot fallback). */
export function getLatestMentionTotals(): Record<DailySource, number> | null {
  const days = cached?.days ?? [];
  const last = days[days.length - 1];
  if (!last) return null;
  const out = {} as Record<DailySource, number>;
  for (const s of DAILY_SOURCES) out[s] = Number(last.perSource?.[s] ?? 0);
  return out;
}

export function _resetMentionsDailyForTests(): void {
  cached = null;
  lastRefreshMs = 0;
  inflight = null;
}
