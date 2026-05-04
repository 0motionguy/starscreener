// /top10 — daily snapshot read/write helpers.
//
// Cron-driven writer captures the full Top10Payload at 23:55 UTC each day,
// stores it under `ss:data:v1:top10:YYYY-MM-DD` in Redis, and `/top10/[date]`
// renders the frozen snapshot. Live `/top10` reads yesterday's snapshot too,
// to compute the NEW ENTRY badge (items present today that weren't in
// yesterday's top-10 for that category).
//
// Both ends use the same data-store the rest of the app uses, so a missing
// Redis env degrades to "no historical data" rather than a hard failure —
// the live page just doesn't paint NEW badges, and date routes 404.

import { getDataStore } from "@/lib/data-store";
import type { Top10Category, Top10Payload } from "./types";

const NAMESPACE_PREFIX = "top10:";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDate(date: string): boolean {
  if (!DATE_RE.test(date)) return false;
  const t = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(t);
}

export function snapshotKey(date: string): string {
  return `${NAMESPACE_PREFIX}${date}`;
}

/**
 * UTC date in `YYYY-MM-DD` form. The snapshot key is keyed by UTC, not local
 * time, so a writer in any timezone produces a stable key.
 */
export function todayUtcDate(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export function yesterdayUtcDate(d: Date = new Date()): string {
  const y = new Date(d.getTime() - 24 * 60 * 60 * 1000);
  return todayUtcDate(y);
}

/**
 * Persist the full Top10Payload under today's date. Used by the cron script.
 * 90-day TTL — enough headroom for a quarterly look-back without ballooning
 * Redis usage. (Daily snapshot × 8 categories × ~30 KB ≈ 240 KB/day.)
 */
export async function writeTop10Snapshot(
  date: string,
  payload: Top10Payload,
): Promise<void> {
  if (!isValidDate(date)) {
    throw new Error(`writeTop10Snapshot: invalid date ${date}`);
  }
  const store = getDataStore();
  await store.write(snapshotKey(date), payload, {
    ttlSeconds: 90 * 24 * 60 * 60,
  });
}

/**
 * Read the snapshot for `date`. Returns null when the key is missing, the
 * date format is invalid, or the value can't be parsed back to the expected
 * shape. Never throws — callers branch on null.
 */
export async function readTop10Snapshot(
  date: string,
): Promise<Top10Payload | null> {
  if (!isValidDate(date)) return null;
  const store = getDataStore();
  try {
    const result = await store.read<Top10Payload>(snapshotKey(date));
    if (!result.data) return null;
    // Soft-validate: we trust our own writes, but a hand-corrupted Redis key
    // shouldn't take the page down. Just check the top-level shape; the
    // builders / renderers handle item-level oddities (empty arrays etc).
    const data = result.data as Partial<Top10Payload>;
    if (
      typeof data !== "object" ||
      data === null ||
      typeof data.repos !== "object" ||
      typeof data.llms !== "object"
    ) {
      return null;
    }
    return result.data;
  } catch {
    return null;
  }
}

/**
 * Build a `Map<Category, Set<slug>>` of the slugs present in the prior-day
 * snapshot. Used by the live page to flag NEW ENTRY items in today's view.
 * Returns null when no prior snapshot is available (cold start, Redis miss).
 */
export async function loadPriorTopSlugs(
  date: string = yesterdayUtcDate(),
): Promise<Record<Top10Category, Set<string>> | null> {
  const prior = await readTop10Snapshot(date);
  if (!prior) return null;
  const out = {} as Record<Top10Category, Set<string>>;
  for (const cat of Object.keys(prior) as Top10Category[]) {
    out[cat] = new Set(prior[cat].items.map((item) => item.slug));
  }
  return out;
}
