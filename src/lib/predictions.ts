// Repo trajectory prediction — v1 baseline.
//
// Design constraints (per the strategy doc, "Prediction v1 — what to actually
// build"):
//
//   - Transparent over clever. We extrapolate from recent daily-star
//     velocity with horizon-dependent damping. No black-box gradient-
//     boost. A reader can audit every coefficient by reading this file.
//   - Confidence band, not a single line. The band width is derived
//     from the standard deviation of the last 29 daily deltas, scaled
//     by sqrt(horizon) — a Brownian-motion approximation that keeps
//     short horizons tight and long horizons honestly fuzzy.
//   - Honest about ignorance. Repos with <14 days of data return
//     `kind: "insufficient_data"` so the UI can render "we don't know
//     yet" instead of a fake number.
//   - No hidden state. Inputs and model version are echoed in every
//     response so a calibration pass (P2) can score predictions
//     against actuals without re-deriving the inputs.
//
// CLIENT BOUNDARY: this module is pure (no node:* imports) so it can
// be imported from server routes AND from `"use client"` components if
// we ever want to recompute on the client. Currently consumed only
// server-side via /api/predict.

import type { Repo } from "@/lib/types";

// Bump when the formula changes. Calibration scoring (P2) buckets by
// modelVersion so a baseline change doesn't pollute historical accuracy.
export const PREDICTION_MODEL_VERSION = "v1-velocity-extrapolation";

export const PREDICTION_HORIZONS = [7, 30, 90] as const;
export type PredictionHorizonDays = (typeof PREDICTION_HORIZONS)[number];

export function isPredictionHorizon(
  value: unknown,
): value is PredictionHorizonDays {
  return (
    typeof value === "number" &&
    (PREDICTION_HORIZONS as readonly number[]).includes(value)
  );
}

// At least this many days of sparkline data before we attempt a forecast.
// Below the threshold the confidence band would be wider than the
// signal, so we surface "insufficient_data" instead of garbage numbers.
export const MIN_SPARKLINE_POINTS = 14;

// Recent-weighted average: most recent day gets weight 1.0, then each
// older day decays by RECENCY_DECAY per step. 0.92 means the window
// effectively spans ~12 days of meaningful weight, with 14d retaining
// ~30% influence — captures momentum changes without overreacting to
// a single anomalous day.
const RECENCY_DECAY = 0.92;

// Long-horizon damping. A 7-day prediction gets near-full velocity;
// 30 days gets ~60%; 90 days gets ~22%. Without damping we'd extrapolate
// today's velocity for 90 days straight, which is a hockey-stick lie.
function dampingFactor(horizonDays: number): number {
  return Math.exp(-horizonDays / 60);
}

// 1.28 = z-score for an 80% confidence interval (P10..P90).
const Z_80 = 1.28;

export type PredictionInputsSnapshot = {
  stars: number;
  starsDelta24h: number;
  starsDelta7d: number;
  starsDelta30d: number;
  sparklinePoints: number;
  meanDailyDelta: number;
  stdDailyDelta: number;
  // Captured so calibration (P2) can grade against actual stars at
  // ts + horizonDays without re-fetching the source data.
  capturedAt: string;
};

export interface PredictionRecord {
  fullName: string;
  horizonDays: PredictionHorizonDays;
  pointEstimate: number;
  lowP10: number;
  highP90: number;
  modelVersion: string;
  generatedAt: string;
  inputs: PredictionInputsSnapshot;
}

export type PredictionResult =
  | { kind: "ok"; prediction: PredictionRecord }
  | { kind: "insufficient_data"; reason: string };

// ---------------------------------------------------------------------------
// Pure math helpers
// ---------------------------------------------------------------------------

/**
 * Convert cumulative-star sparkline (oldest → newest) to daily deltas.
 * Returns an array of length sparkline.length-1. Negative deltas (rare —
 * GitHub allows unstarring) are clamped to 0 because stars can only grow
 * in the prediction frame; treating unstars as negative momentum would
 * pull projections below current stars, which is non-physical.
 */
export function sparklineToDeltas(sparkline: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < sparkline.length; i++) {
    const prev = sparkline[i - 1] ?? 0;
    const cur = sparkline[i] ?? 0;
    out.push(Math.max(0, cur - prev));
  }
  return out;
}

/**
 * Recency-weighted mean. The newest delta (last element) gets weight 1.0,
 * older deltas decay geometrically by RECENCY_DECAY per step.
 */
export function weightedMeanRecent(
  deltas: number[],
  decay: number = RECENCY_DECAY,
): number {
  if (deltas.length === 0) return 0;
  let weightedSum = 0;
  let totalWeight = 0;
  for (let i = 0; i < deltas.length; i++) {
    // i=0 is the OLDEST entry; weight grows toward i=length-1.
    const stepsFromNewest = deltas.length - 1 - i;
    const weight = Math.pow(decay, stepsFromNewest);
    weightedSum += deltas[i]! * weight;
    totalWeight += weight;
  }
  return totalWeight === 0 ? 0 : weightedSum / totalWeight;
}

/**
 * Sample standard deviation. Uses Bessel's correction (n-1) since
 * sparkline is a sample of the underlying daily-velocity distribution.
 */
export function sampleStdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  let sumSq = 0;
  for (const v of values) sumSq += (v - mean) ** 2;
  return Math.sqrt(sumSq / (values.length - 1));
}

// ---------------------------------------------------------------------------
// Predict
// ---------------------------------------------------------------------------

/**
 * Pure predictor — takes the repo and a horizon, returns either a
 * structured PredictionRecord or an `insufficient_data` result.
 *
 * The inputs snapshot in the response is the full set of features
 * the model used; it is the contract for calibration scoring later.
 */
export function predictRepoTrajectory(
  repo: Pick<
    Repo,
    | "fullName"
    | "stars"
    | "starsDelta24h"
    | "starsDelta7d"
    | "starsDelta30d"
    | "sparklineData"
  >,
  horizonDays: PredictionHorizonDays,
  now: Date = new Date(),
): PredictionResult {
  const sparkline = repo.sparklineData ?? [];
  if (sparkline.length < MIN_SPARKLINE_POINTS) {
    return {
      kind: "insufficient_data",
      reason: `repo has ${sparkline.length} sparkline points; need ${MIN_SPARKLINE_POINTS} to forecast`,
    };
  }

  const deltas = sparklineToDeltas(sparkline);
  const meanVelocity = weightedMeanRecent(deltas);
  const stdVelocity = sampleStdDev(deltas);
  const damping = dampingFactor(horizonDays);

  // Point estimate: extrapolate weighted velocity, damped by horizon.
  const projectedGrowth = meanVelocity * horizonDays * damping;
  const pointEstimate = Math.round(repo.stars + projectedGrowth);

  // Confidence band: Brownian-motion-style sqrt(horizon) scaling. The
  // wider the daily volatility, the wider the band. Damping is applied
  // so 90d bands aren't artificially blown out by short-term spikes.
  const bandRaw = Z_80 * stdVelocity * Math.sqrt(horizonDays) * damping;
  // Clamp the lower bound at current stars — predictions can't say
  // "stars will go down" since GitHub stars are ~monotonic.
  const lowP10 = Math.max(repo.stars, Math.round(pointEstimate - bandRaw));
  const highP90 = Math.max(pointEstimate, Math.round(pointEstimate + bandRaw));

  const generatedAt = now.toISOString();
  const prediction: PredictionRecord = {
    fullName: repo.fullName,
    horizonDays,
    pointEstimate,
    lowP10,
    highP90,
    modelVersion: PREDICTION_MODEL_VERSION,
    generatedAt,
    inputs: {
      stars: repo.stars,
      starsDelta24h: repo.starsDelta24h ?? 0,
      starsDelta7d: repo.starsDelta7d ?? 0,
      starsDelta30d: repo.starsDelta30d ?? 0,
      sparklinePoints: sparkline.length,
      meanDailyDelta: Number(meanVelocity.toFixed(2)),
      stdDailyDelta: Number(stdVelocity.toFixed(2)),
      capturedAt: generatedAt,
    },
  };

  return { kind: "ok", prediction };
}

// ---------------------------------------------------------------------------
// Driver explanation — what's pushing this forecast up or down?
// ---------------------------------------------------------------------------
//
// Surfaced on the /predict UI so users see WHY, not just WHAT. Three
// human-readable lines, ranked by impact: recent acceleration vs slow
// decay, cross-horizon momentum, and uncertainty from volatility.

export interface PredictionDriver {
  label: string;
  detail: string;
  tone: "positive" | "negative" | "neutral";
}

export function explainPrediction(
  prediction: PredictionRecord,
): PredictionDriver[] {
  const drivers: PredictionDriver[] = [];
  const inputs = prediction.inputs;

  // Driver 1 — recent vs longer-term velocity.
  const recentDailyAvg = inputs.meanDailyDelta;
  const longTermDailyAvg = (inputs.starsDelta30d ?? 0) / 30;
  if (longTermDailyAvg > 0 && recentDailyAvg > longTermDailyAvg * 1.2) {
    drivers.push({
      label: "Accelerating",
      detail: `Recent daily growth (${recentDailyAvg.toFixed(1)}/day) is ${(
        (recentDailyAvg / longTermDailyAvg - 1) *
        100
      ).toFixed(0)}% above the 30-day average.`,
      tone: "positive",
    });
  } else if (
    longTermDailyAvg > 0 &&
    recentDailyAvg < longTermDailyAvg * 0.8
  ) {
    drivers.push({
      label: "Decelerating",
      detail: `Recent daily growth (${recentDailyAvg.toFixed(1)}/day) is ${(
        (1 - recentDailyAvg / longTermDailyAvg) *
        100
      ).toFixed(0)}% below the 30-day average.`,
      tone: "negative",
    });
  }

  // Driver 2 — volatility tells us how much to trust the line.
  const cv =
    inputs.meanDailyDelta > 0
      ? inputs.stdDailyDelta / inputs.meanDailyDelta
      : 0;
  if (cv > 1.5) {
    drivers.push({
      label: "High volatility",
      detail: `Daily growth varies a lot (CV=${cv.toFixed(1)}); the band is wide.`,
      tone: "neutral",
    });
  } else if (cv < 0.5 && inputs.meanDailyDelta > 1) {
    drivers.push({
      label: "Steady cadence",
      detail: `Daily growth is consistent (CV=${cv.toFixed(2)}); narrow band.`,
      tone: "positive",
    });
  }

  // Driver 3 — fall back to a baseline driver if neither acceleration
  // nor volatility surfaced anything striking.
  if (drivers.length === 0) {
    drivers.push({
      label: "Baseline trajectory",
      detail: `Projecting current pace (${inputs.meanDailyDelta.toFixed(1)} stars/day) forward, damped for horizon.`,
      tone: "neutral",
    });
  }

  return drivers;
}
