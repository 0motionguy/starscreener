import type { Repo } from "@/lib/types";

function asNumber(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * AGN-524: TRENDING score for client-side default-sort fallback when the
 * upstream `trendScore24h` field isn't on the row (e.g., the LiveRow
 * projection in `LiveTopTable`). Absolute 24h Δstars + community mentions,
 * weighted so a single mention is worth ~MENTION_WEIGHT stars-of-attention.
 *
 * Pre-fix the table fell back to `momentumScore` (% growth), which biased
 * the Top 50 toward tiny repos with bursty % deltas (text-to-cad +327% on
 * an 11-star base crowded out warpdotdev/warp +162 abs).
 */
export const MENTION_WEIGHT = 8;

export interface LiveRowLike {
  starsDelta24h: number;
  mentionCount24h: number;
}

export function liveRowTrendingScore(row: LiveRowLike): number {
  return asNumber(row.starsDelta24h) + asNumber(row.mentionCount24h) * MENTION_WEIGHT;
}

export function compareLiveTopTrending(a: Repo, b: Repo): number {
  const trendDelta = asNumber(b.trendScore24h) - asNumber(a.trendScore24h);
  if (trendDelta !== 0) return trendDelta;

  const starDelta = asNumber(b.starsDelta24h) - asNumber(a.starsDelta24h);
  if (starDelta !== 0) return starDelta;

  const mentionsDelta = asNumber(b.mentionCount24h) - asNumber(a.mentionCount24h);
  if (mentionsDelta !== 0) return mentionsDelta;

  return asNumber(b.momentumScore) - asNumber(a.momentumScore);
}

