// Calibration scorer for the predictions JSONL feed.
//
// The writer (`src/lib/predictions-writer.ts`) appends forecasts to
// `.data/predictions.jsonl` stamped with `generatedAt` + `horizonDays`.
// Once `generatedAt + horizonDays` is in the past we can grade the
// forecast against the repo's actual star count today and record:
//
//   - actualStarsAtHorizon  — source of truth for bias / MAPE / band-cov
//   - scoredAt              — marks the row done so we don't re-score it
//   - signedError / absoluteError / percentError — per-row derived metrics
//   - inBand                — did actual fall inside the 80% band?
//
// This module is pure — it takes `predictions[]` and a `Map<fullName, stars>`,
// and returns scored rows. All I/O (reading jsonl, walking the derived repo
// set, rewriting the file under lock) lives in the cron route.
//
// CLIENT BOUNDARY: no node:* imports so this can be unit-tested without a
// filesystem and hypothetically called from a client that already holds the
// inputs in memory.

import type { PredictionRecord } from "@/lib/predictions";

/**
 * A PredictionRecord that has been graded against the real star count at
 * horizon. `scoredAt` + `actualStarsAtHorizon` are guaranteed present;
 * the derived error fields are materialized for the downstream aggregator
 * so it doesn't have to recompute them for every summary call.
 */
export interface ScoredPrediction extends PredictionRecord {
  actualStarsAtHorizon: number;
  scoredAt: string;
  /** Signed error = actual - pointEstimate. Positive = model undershot. */
  signedError: number;
  absoluteError: number;
  /**
   * Fraction: signedError / max(actual, 1). Multiply by 100 for MAPE.
   * We clamp the denominator at 1 so a repo with `actual=0` doesn't
   * explode the metric — in practice any scored repo has ≥ MIN_SPARKLINE_POINTS
   * of history, but the clamp is defense-in-depth.
   */
  percentError: number;
  /** True iff actualStarsAtHorizon ∈ [lowP10, highP90] (inclusive). */
  inBand: boolean;
}

/**
 * Milliseconds per day — hoisted so the horizon-due math is readable.
 * `horizonDays * MS_PER_DAY` gives the window after `generatedAt` at
 * which the prediction is eligible for scoring.
 */
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Score every eligible prediction in `predictions` against the current
 * star snapshot in `currentStarsByFullName`.
 *
 * Skip rules (all silent — caller decides whether to drop or keep):
 *   1. `row.scoredAt` already set → already graded; re-scoring is out of scope.
 *   2. `generatedAt + horizonDays * 1d > now` → not yet due.
 *   3. `fullName` missing from the stars map → repo fell out of the derived
 *      set (renamed, deleted, or just dropped from the trending slate). No
 *      actual → nothing to score.
 *
 * For every row that passes the gates we compute errors and emit a
 * ScoredPrediction. The caller merges these back into the on-disk jsonl
 * by id (the writer's `id` field is a stable compound key).
 *
 * Pure + deterministic. Inject `now` from the cron route so a single
 * pass grades against a consistent "now" and tests can pin output.
 */
export function scorePredictions(
  predictions: PredictionRecord[],
  currentStarsByFullName: Map<string, number>,
  now: Date = new Date(),
): ScoredPrediction[] {
  const nowMs = now.getTime();
  const scoredAt = now.toISOString();
  const out: ScoredPrediction[] = [];

  for (const prediction of predictions) {
    // Gate 1 — already scored.
    if (prediction.scoredAt) continue;

    // Gate 2 — not yet due. Parse generatedAt defensively; a row with an
    // unparseable timestamp is a malformed writer output and we skip it
    // rather than let NaN propagate into arithmetic.
    const generatedMs = Date.parse(prediction.generatedAt);
    if (!Number.isFinite(generatedMs)) continue;
    const dueMs = generatedMs + prediction.horizonDays * MS_PER_DAY;
    if (dueMs > nowMs) continue;

    // Gate 3 — repo dropped out of the derived set. Map lookups are
    // case-insensitive by convention (caller lowercases the keys).
    const actual = currentStarsByFullName.get(prediction.fullName.toLowerCase());
    if (actual === undefined) continue;

    const signedError = actual - prediction.pointEstimate;
    const absoluteError = Math.abs(signedError);
    const percentError = signedError / Math.max(actual, 1);
    const inBand =
      actual >= prediction.lowP10 && actual <= prediction.highP90;

    out.push({
      ...prediction,
      actualStarsAtHorizon: actual,
      scoredAt,
      signedError,
      absoluteError,
      percentError,
      inBand,
    });
  }

  return out;
}

// ---------------------------------------------------------------------------
// Aggregation — MAPE / MAE / inBandRate bucketed by (modelVersion, horizon)
// ---------------------------------------------------------------------------

/**
 * One aggregate row for the calibration summary endpoint. Buckets are
 * `(modelVersion, horizonDays)` so a v2 model's rollout doesn't pollute
 * v1's historical accuracy (and vice versa). `meanSignedError` is the
 * chronic-bias signal: a consistently positive value means the model
 * undershoots; negative means it overshoots.
 */
export interface CalibrationSummary {
  modelVersion: string;
  horizonDays: number;
  count: number;
  /** Fraction (0..1) of scored rows whose actual fell inside [p10, p90]. */
  inBandRate: number;
  /** Mean absolute percent error × 100. Missing if count is 0. */
  mape: number;
  /** Mean absolute error in stars. */
  mae: number;
  /** Mean signed error — positive = chronic undershoot. */
  meanSignedError: number;
}

/**
 * Aggregate a set of scored predictions into per-bucket summary rows.
 * Input rows MUST already carry `actualStarsAtHorizon` + the derived
 * error fields; the endpoint layer filters the on-disk rows before
 * handing them here.
 *
 * Buckets are stable-sorted by (modelVersion, horizonDays ascending) so
 * the UI can render a deterministic table without re-sorting.
 */
export function summarizeCalibration(
  scored: ScoredPrediction[],
): CalibrationSummary[] {
  const buckets = new Map<string, ScoredPrediction[]>();
  for (const row of scored) {
    const key = `${row.modelVersion}::${row.horizonDays}`;
    const list = buckets.get(key);
    if (list) list.push(row);
    else buckets.set(key, [row]);
  }

  const summaries: CalibrationSummary[] = [];
  for (const [, rows] of buckets) {
    if (rows.length === 0) continue;
    let sumAbs = 0;
    let sumAbsPct = 0;
    let sumSigned = 0;
    let inBandCount = 0;
    for (const row of rows) {
      sumAbs += row.absoluteError;
      sumAbsPct += Math.abs(row.percentError);
      sumSigned += row.signedError;
      if (row.inBand) inBandCount++;
    }
    const count = rows.length;
    // `rows[0]` is guaranteed by the `rows.length === 0` short-circuit above.
    const sample = rows[0]!;
    summaries.push({
      modelVersion: sample.modelVersion,
      horizonDays: sample.horizonDays,
      count,
      inBandRate: inBandCount / count,
      mape: (sumAbsPct / count) * 100,
      mae: sumAbs / count,
      meanSignedError: sumSigned / count,
    });
  }

  summaries.sort((a, b) => {
    if (a.modelVersion !== b.modelVersion) {
      return a.modelVersion.localeCompare(b.modelVersion);
    }
    return a.horizonDays - b.horizonDays;
  });

  return summaries;
}

/**
 * Type guard — true iff the row has been graded. Keeps the endpoint layer
 * honest: a scored summary can only ever be built from rows that carry
 * `actualStarsAtHorizon` + `scoredAt`.
 */
export function isScoredPrediction(
  row: PredictionRecord,
): row is PredictionRecord & {
  actualStarsAtHorizon: number;
  scoredAt: string;
} {
  return (
    typeof row.actualStarsAtHorizon === "number" &&
    Number.isFinite(row.actualStarsAtHorizon) &&
    typeof row.scoredAt === "string" &&
    row.scoredAt.length > 0
  );
}

/**
 * Re-derive the error fields from a stored row. The on-disk jsonl only
 * persists `actualStarsAtHorizon` + `scoredAt` (plus the pre-existing
 * forecast fields) — the summary endpoint rehydrates signedError etc.
 * at read time so we never have to migrate the file if the formulas
 * change.
 */
export function rehydrateScored(
  row: PredictionRecord & { actualStarsAtHorizon: number; scoredAt: string },
): ScoredPrediction {
  const signedError = row.actualStarsAtHorizon - row.pointEstimate;
  const absoluteError = Math.abs(signedError);
  const percentError = signedError / Math.max(row.actualStarsAtHorizon, 1);
  const inBand =
    row.actualStarsAtHorizon >= row.lowP10 &&
    row.actualStarsAtHorizon <= row.highP90;
  return {
    ...row,
    signedError,
    absoluteError,
    percentError,
    inBand,
  };
}
