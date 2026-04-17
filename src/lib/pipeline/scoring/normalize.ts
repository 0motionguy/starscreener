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
