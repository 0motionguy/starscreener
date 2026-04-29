// /top10 — per-slug sparkline ring-buffer over the data-store.
//
// Non-repo categories (LLMS, MCPS, SKILLS, NEWS, FUNDING) don't ship a
// per-item time series in their upstream readers. We synthesize one by
// snapshotting today's value once a day under a slug-keyed Redis hash and
// reading the trailing N days back when the page renders.
//
// Storage shape — each slug gets one Redis key:
//   ss:data:v1:top10-spark:<category>:<urlSafeSlug>
//   value = JSON `{ "2026-04-23": 12.4, "2026-04-24": 13.0, ... }`
//
// Cap retained dates at MAX_POINTS (32) so writes are O(1) and old points
// roll off naturally. Reader returns the last N values in chronological
// order; missing days are skipped (sparse), so a 14-day window produces a
// length-N number[] of however many points were captured in that window.

import type { Top10Category } from "./types";
import { getDataStore } from "@/lib/data-store";

const MAX_POINTS = 32;
const NAMESPACE_PREFIX = "top10-spark:";

/** YYYY-MM-DD key format. Validated upstream by callers. */
type Iso = string;

interface SparklineSeries {
  /** date → value, sparse. */
  points: Record<Iso, number>;
}

function isValidIso(d: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(`${d}T00:00:00Z`));
}

/** URL-safe-ish slug for the Redis key segment. Slashes break the namespace
 *  walker; Redis itself is permissive but our scan helpers split on `:`. */
function safeSlug(raw: string): string {
  return raw.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 80);
}

function key(category: Top10Category, slug: string): string {
  return `${NAMESPACE_PREFIX}${category}:${safeSlug(slug)}`;
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Append today's value (or `dateOverride` for backfill / tests) to a slug's
 * sparkline series. Read-modify-write: cheap because each series is tiny
 * (≤ 32 entries) and writes are once per day per slug. No-ops when the
 * data-store has no Redis backend (silent degradation by design).
 */
export async function appendSparklinePoint(
  category: Top10Category,
  slug: string,
  value: number,
  dateOverride?: Iso,
): Promise<void> {
  if (!Number.isFinite(value)) return;
  const date = dateOverride ?? todayUtc();
  if (!isValidIso(date)) return;

  const store = getDataStore();
  const k = key(category, slug);
  let series: SparklineSeries = { points: {} };
  try {
    const result = await store.read<SparklineSeries>(k);
    if (
      result.data &&
      typeof result.data === "object" &&
      typeof (result.data as SparklineSeries).points === "object"
    ) {
      series = result.data as SparklineSeries;
    }
  } catch {
    // First write → empty series.
  }
  series.points[date] = value;

  // Cap retention. Sort dates desc, keep MAX_POINTS, rebuild map.
  const dates = Object.keys(series.points).filter(isValidIso).sort();
  if (dates.length > MAX_POINTS) {
    const keep = dates.slice(dates.length - MAX_POINTS);
    const next: Record<Iso, number> = {};
    for (const d of keep) next[d] = series.points[d];
    series.points = next;
  }

  // 120-day TTL — buys two MAX_POINTS rotations even if a slug goes silent
  // for a month, so a returning slug doesn't fall out of cache.
  await store.write(k, series, { ttlSeconds: 120 * 24 * 60 * 60 });
}

/**
 * Read the last N values for a slug in chronological order. Returns an empty
 * array when no data exists. Missing days within the window are skipped — a
 * 14-day window with 9 captured points returns a length-9 array.
 */
export async function readSparkline(
  category: Top10Category,
  slug: string,
  windowDays = 14,
): Promise<number[]> {
  const store = getDataStore();
  const k = key(category, slug);
  let series: SparklineSeries | null = null;
  try {
    const result = await store.read<SparklineSeries>(k);
    if (
      result.data &&
      typeof result.data === "object" &&
      typeof (result.data as SparklineSeries).points === "object"
    ) {
      series = result.data as SparklineSeries;
    }
  } catch {
    return [];
  }
  if (!series) return [];

  const cutoff = Date.now() - windowDays * 24 * 60 * 60 * 1000;
  return Object.entries(series.points)
    .filter(([d, v]) => {
      if (!isValidIso(d) || !Number.isFinite(v)) return false;
      return Date.parse(`${d}T00:00:00Z`) >= cutoff;
    })
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([, v]) => v);
}

/**
 * Batch read for a list of slugs in a single category. Returns a map slug →
 * number[]. Iterates serially because each call to data-store.read is async
 * and Promise.all can hammer Redis with hundreds of keys per page render —
 * not worth the latency win for a 60-key surface.
 */
export async function readSparklineBatch(
  category: Top10Category,
  slugs: string[],
  windowDays = 14,
): Promise<Map<string, number[]>> {
  const out = new Map<string, number[]>();
  // Fan out 8 at a time — limits open Redis connections without serializing
  // unnecessarily. 8 × ~30ms = 240ms worst-case for a top-10 surface.
  const CONCURRENCY = 8;
  for (let i = 0; i < slugs.length; i += CONCURRENCY) {
    const batch = slugs.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (s) => [s, await readSparkline(category, s, windowDays)] as const),
    );
    for (const [s, v] of results) out.set(s, v);
  }
  return out;
}
