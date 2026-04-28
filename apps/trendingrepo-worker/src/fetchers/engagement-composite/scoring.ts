// Pure scoring kernel for the engagement-composite fetcher.
//
// Given a cohort of NormalizedRepoSignals (one row per repo, with raw
// per-component aggregates), produce ranked EngagementCompositeItems
// with a 0-100 compositeScore.
//
// Normalization strategy per component:
//   - hn / reddit / bluesky / devto / ph  → percentile rank within cohort
//     These distributions are bursty but bounded; percentile rank gives a
//     cohort-relative answer that stays meaningful even on quiet days.
//   - npm / ghStars                       → log-normalized fraction
//     Heavy-tailed power-law distributions (one repo with 50M weekly
//     downloads should not crowd everyone else into ~0). log10(x+1)
//     divided by the cohort max log10 keeps the dynamic range usable.
//
// Repos with no signal in a component get raw=0 → normalized=0 (not null
// or NaN — they should still rank, just lower).
//
// Tiebreak rule: when raw component values are identical (typical for
// cold repos with all-zero signals), preserve stable order by full_name
// ascending so the leaderboard is deterministic across runs.

import type {
  ComponentKey,
  ComponentScore,
  EngagementCompositeItem,
  NormalizedRepoSignals,
} from './types.js';
import { COMPONENT_KEYS } from './types.js';

/**
 * Component weights. Sum MUST equal 1.00 — asserted in unit tests so a
 * future tweak that breaks the invariant fails CI immediately.
 *
 *   ghStars (.25)  — strongest leading indicator of mainstream traction
 *   hn      (.20)  — best engagement signal pre-mainstream
 *   npm     (.20)  — actual usage, not just attention
 *   reddit  (.15)  — broader-but-noisier developer attention
 *   ph      (.10)  — launch moment, mostly orthogonal to other signals
 *   bluesky (.05)  — early-mover signal, low volume so capped low
 *   devto   (.05)  — slow-burn long-tail content signal
 */
export const WEIGHTS: Record<ComponentKey, number> = {
  hn: 0.20,
  reddit: 0.15,
  bluesky: 0.05,
  devto: 0.05,
  npm: 0.20,
  ghStars: 0.25,
  ph: 0.10,
};

/** Components that use percentile-rank normalization. */
const PERCENTILE_COMPONENTS: ReadonlySet<ComponentKey> = new Set<ComponentKey>([
  'hn',
  'reddit',
  'bluesky',
  'devto',
  'ph',
]);

/** Components that use log10 normalization (heavy-tailed). */
const LOG_COMPONENTS: ReadonlySet<ComponentKey> = new Set<ComponentKey>([
  'npm',
  'ghStars',
]);

/**
 * Compute the percentile rank of `value` within `sorted` (ascending).
 * Returns a fraction in [0, 1].
 *
 * Definition: fraction of values strictly less than `value`, plus half
 * the fraction of values equal to `value` (mid-rank tiebreak). This
 * avoids percentile=1.0 collapsing the top to identical scores when
 * many repos share the cohort max, and keeps percentile=0 the floor
 * for repos with raw=0 in a cohort where many others have raw>0.
 */
export function percentileRank(value: number, sorted: ReadonlyArray<number>): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return 0.5; // single-item cohort: midpoint
  // Binary search for the lower/upper bounds of `value`.
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sorted[mid]! < value) lo = mid + 1;
    else hi = mid;
  }
  const lowerCount = lo; // count of values strictly less than `value`
  let upper = lowerCount;
  while (upper < sorted.length && sorted[upper] === value) upper += 1;
  const equalCount = upper - lowerCount;
  return (lowerCount + equalCount / 2) / sorted.length;
}

/**
 * Log10-fraction normalization for heavy-tailed components.
 * Returns log10(value+1) / log10(max+1), or 0 when max <= 0.
 */
export function logNormalize(value: number, max: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (!Number.isFinite(max) || max <= 0) return 0;
  const denom = Math.log10(max + 1);
  if (denom <= 0) return 0;
  return Math.log10(value + 1) / denom;
}

/**
 * Normalize a single raw value for a single component, given cohort context.
 * - Percentile components: use the pre-sorted `sortedValues` array.
 * - Log components: use the precomputed `max`.
 * - Raw values <= 0 collapse to normalized=0 regardless of method.
 */
export function normalizeOne(
  component: ComponentKey,
  rawValue: number,
  cohortContext: { sortedValues: ReadonlyArray<number>; max: number },
): number {
  const safeRaw = Number.isFinite(rawValue) && rawValue > 0 ? rawValue : 0;
  if (safeRaw === 0) return 0;
  if (LOG_COMPONENTS.has(component)) {
    return clamp01(logNormalize(safeRaw, cohortContext.max));
  }
  if (PERCENTILE_COMPONENTS.has(component)) {
    return clamp01(percentileRank(safeRaw, cohortContext.sortedValues));
  }
  // Defensive: every defined component is in one of the two sets above.
  // Fall back to log if a new component is added without classifying it.
  return clamp01(logNormalize(safeRaw, cohortContext.max));
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

interface ComponentContext {
  sortedValues: number[]; // ascending, only positive values
  max: number;
}

/**
 * Build per-component cohort context from the input rows.
 * Sorted arrays exclude zeros so percentile rank for the bulk-of-repos
 * (raw=0) case stays at 0 by short-circuit in normalizeOne.
 */
export function buildCohortContext(
  rows: ReadonlyArray<NormalizedRepoSignals>,
): Record<ComponentKey, ComponentContext> {
  const ctx = {} as Record<ComponentKey, ComponentContext>;
  for (const key of COMPONENT_KEYS) {
    const positives: number[] = [];
    let max = 0;
    for (const row of rows) {
      const v = row[key];
      if (Number.isFinite(v) && v > 0) {
        positives.push(v);
        if (v > max) max = v;
      }
    }
    positives.sort((a, b) => a - b);
    ctx[key] = { sortedValues: positives, max };
  }
  return ctx;
}

/**
 * Compose a single repo's component scores into a 0-100 weighted total.
 * Returns the raw weighted sum * 100 (already clamped via normalizeOne).
 */
export function composeScore(components: Record<ComponentKey, ComponentScore>): number {
  let sum = 0;
  for (const key of COMPONENT_KEYS) {
    sum += (components[key]?.normalized ?? 0) * WEIGHTS[key];
  }
  // Round to 1 decimal place (matches payload spec).
  return Math.round(Math.max(0, Math.min(100, sum * 100)) * 10) / 10;
}

/**
 * Score a full cohort of repo signals. Returns an array sorted by
 * compositeScore descending, with stable tiebreak on fullName ascending.
 * Ranks are 1-based.
 *
 * `topLimit` caps the returned items (typical: 200 per the spec). Pass
 * Number.POSITIVE_INFINITY to keep the full ranked list.
 */
export function scoreCohort(
  rows: ReadonlyArray<NormalizedRepoSignals>,
  topLimit: number = Number.POSITIVE_INFINITY,
): EngagementCompositeItem[] {
  if (rows.length === 0) return [];
  const cohort = buildCohortContext(rows);
  const items: EngagementCompositeItem[] = rows.map((row) => {
    const components = {} as Record<ComponentKey, ComponentScore>;
    for (const key of COMPONENT_KEYS) {
      const raw = Number.isFinite(row[key]) && row[key] > 0 ? row[key] : 0;
      components[key] = {
        raw,
        normalized: normalizeOne(key, raw, cohort[key]),
      };
    }
    return {
      fullName: row.fullName,
      rank: 0,
      compositeScore: composeScore(components),
      components,
    };
  });

  items.sort((a, b) => {
    if (b.compositeScore !== a.compositeScore) return b.compositeScore - a.compositeScore;
    // Stable tiebreak: fullName ascending. Keeps the leaderboard
    // deterministic on cold-cohort days when many repos share score=0.
    return a.fullName.localeCompare(b.fullName);
  });

  const cap = Math.max(0, Math.min(items.length, topLimit));
  const truncated = items.slice(0, cap);
  for (let i = 0; i < truncated.length; i += 1) {
    truncated[i]!.rank = i + 1;
  }
  return truncated;
}
