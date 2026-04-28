// StarScreener Pipeline — pure normalization helpers for scoring.
//
// All functions here are side-effect free. They accept raw metric values and
// return scores in the 0-100 range (unless otherwise specified). Freshness
// curve matches the legacy scoring.ts so UIs remain consistent across the
// old and new engine.

import { clamp } from "../../utils";

// ---------------------------------------------------------------------------
// Core numeric normalizations
// ---------------------------------------------------------------------------

/**
 * Logarithmic normalization: maps `value` to 0-100 using log scale.
 *
 * `ceiling` is the reference point that corresponds to a score of 100.
 * Values <= 0 return 0. Values > ceiling are clamped to 100.
 */
export function logNorm(value: number, ceiling: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (!Number.isFinite(ceiling) || ceiling <= 0) return 0;
  const score =
    (Math.log10(value + 1) / Math.log10(ceiling + 1)) * 100;
  return clamp(score, 0, 100);
}

/**
 * Linear normalization: maps `value` from the [min, max] window to 0-100.
 * Values outside the window are clamped.
 */
export function linearNorm(value: number, min: number, max: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max)) {
    return 0;
  }
  if (max <= min) return 0;
  const score = ((value - min) / (max - min)) * 100;
  return clamp(score, 0, 100);
}

// ---------------------------------------------------------------------------
// Freshness curve (days since a timestamp -> 0-100)
// ---------------------------------------------------------------------------

/**
 * Freshness score based on days since `isoDate`.
 *
 *   null         → 0
 *   0 days       → 100
 *   1 day        → 95
 *   3 days       → 85
 *   7 days       → 70
 *   14 days      → 55
 *   30 days      → 30
 *   60 days      → 15
 *   90 days      → 5
 *   > 90 days    → 0
 *
 * Matches the legacy `scoring.ts` curve so behavior is consistent.
 */
export function freshnessScore(isoDate: string | null): number {
  if (!isoDate) return 0;
  const ts = new Date(isoDate).getTime();
  if (!Number.isFinite(ts)) return 0;

  const daysSince = (Date.now() - ts) / (1000 * 60 * 60 * 24);

  if (daysSince <= 0) return 100;
  if (daysSince <= 1) return 95;
  if (daysSince <= 3) return 85;
  if (daysSince <= 7) return 70;
  if (daysSince <= 14) return 55;
  if (daysSince <= 30) return 30;
  if (daysSince <= 60) return 15;
  if (daysSince <= 90) return 5;
  return 0;
}

// ---------------------------------------------------------------------------
// Percentile rank (0-100) of `value` vs `allValues`.
// ---------------------------------------------------------------------------

/**
 * Percentile rank (0-100) of `value` within `allValues`.
 *
 * Defined as: (count of values strictly less than `value`) / (N) * 100.
 * If `allValues` is empty, returns 0.
 */
export function percentileRank(value: number, allValues: number[]): number {
  if (!Array.isArray(allValues) || allValues.length === 0) return 0;
  if (!Number.isFinite(value)) return 0;

  let below = 0;
  for (const v of allValues) {
    if (Number.isFinite(v) && v < value) below += 1;
  }
  return clamp((below / allValues.length) * 100, 0, 100);
}

// ---------------------------------------------------------------------------
// Cross-domain normalization (per-domain raw -> 0..100 momentum).
// ---------------------------------------------------------------------------

export interface DomainPercentileOptions {
  /**
   * Below this corpus size, blend percentile against absolute. Default 200.
   * For N >= bootstrapN: pure percentile rank.
   * For N < bootstrapN: result = pct * (N/bootstrapN) + abs * (1 - N/bootstrapN)
   * where `abs` = the input score itself (treated as already 0..100).
   */
  bootstrapN?: number;
}

/**
 * Cross-domain normalization: convert a per-domain raw-score array into
 * a 0..100 momentum array that is comparable across domains.
 *
 * Algorithm (matches plan §2):
 *   if N >= bootstrapN:    momentum[i] = percentileRank(raw[i], raw[*])     // already 0..100
 *   else:                  blend = N / bootstrapN
 *                          pct   = percentileRank(raw[i], raw[*])
 *                          abs   = clamp(raw[i], 0, 100)
 *                          momentum[i] = pct * blend + abs * (1 - blend)
 *
 * Edge cases:
 *   - Empty input: return [].
 *   - Single item: percentile is undefined; return [clamp(raw[0], 0, 100)] for stability.
 *   - All identical inputs: percentile would be 100 for all; that's correct behavior.
 *   - NaN / non-finite raw scores: treat as 0. (Don't propagate NaN.)
 *
 * @param rawScores - per-domain raw scores, each 0..100 (the weighted sum from a DomainScorer).
 * @param opts.bootstrapN - corpus size threshold for pure-percentile mode. Default 200.
 * @returns array of momentum values, same length as input, each 0..100.
 */
export function domainPercentileRank(
  rawScores: number[],
  opts?: DomainPercentileOptions,
): number[] {
  if (!Array.isArray(rawScores) || rawScores.length === 0) return [];

  const bootstrapN =
    opts?.bootstrapN !== undefined && Number.isFinite(opts.bootstrapN) && opts.bootstrapN > 0
      ? opts.bootstrapN
      : 200;

  // Sanitize: NaN / non-finite -> 0. Use the sanitized array everywhere so
  // percentileRank sees clean values too.
  const clean = rawScores.map((v) => (Number.isFinite(v) ? (v as number) : 0));
  const n = clean.length;

  // Single-item stability case: percentile is degenerate, fall back to abs.
  if (n === 1) {
    return [clamp(clean[0], 0, 100)];
  }

  if (n >= bootstrapN) {
    return clean.map((v) => percentileRank(v, clean));
  }

  const blend = n / bootstrapN;
  const inv = 1 - blend;
  return clean.map((v) => {
    const pct = percentileRank(v, clean);
    const abs = clamp(v, 0, 100);
    return clamp(pct * blend + abs * inv, 0, 100);
  });
}
