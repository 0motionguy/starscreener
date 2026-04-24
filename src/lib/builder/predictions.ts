// TrendingRepo — Prediction engine v1.
//
// Method: "auto_linear_vol_30d" — fit an OLS line to the last N (default 30)
// non-zero samples of a daily series, extrapolate forward, and produce
// p20/p50/p80 bands whose width is proportional to the realized volatility
// of the residuals. No ML, no libraries — pure JavaScript arithmetic.
//
// Why this instead of ARIMA / Prophet / LLM forecast:
//   - Runs inline in a Next.js route with no extra bundle.
//   - Interpretable — the published `method` string lets any user reproduce it.
//   - Calibrates honestly: the band is wide when history is volatile and
//     narrow when it's smooth, which is the whole point of forecasting.
//
// The prediction "question" is constructed by `questionForArchetype`; the
// resolver logic will live in src/lib/builder/resolvers.ts (P1).

import type {
  Prediction,
  PredictionArchetype,
  PredictionMethod,
} from "./types";

export interface ForecastPoint {
  /** 0 = today; negative = history; positive = forecast horizon in days. */
  t: number;
  actual?: number;
  p20?: number;
  p50?: number;
  p80?: number;
}

export interface ForecastResult {
  method: PredictionMethod;
  points: ForecastPoint[];
  /** Final (end of horizon) p20/p50/p80. Used for the Prediction row. */
  tail: { p20: number; p50: number; p80: number };
  /** Residual standard deviation from the training fit. */
  sigma: number;
  /** Slope (units per day). */
  slope: number;
  /** Intercept at t=0 (today). */
  intercept: number;
  /** Samples used in the fit. */
  fitSamples: number;
}

export interface ForecastOptions {
  /** Days to look back for fitting. Default 30, falls back to however many exist. */
  lookback?: number;
  /** Days to forecast. Default 30. */
  horizon?: number;
}

/**
 * Run the forecast on a daily series.
 *
 * `series` is indexed with index 0 = oldest. If the series is sparse (fewer
 * than 7 non-zero samples) we return a tight band at the last known value —
 * marked with a conservative sigma so the band stays visible.
 */
export function forecastLinear(
  series: number[],
  opts: ForecastOptions = {},
): ForecastResult {
  const lookback = opts.lookback ?? 30;
  const horizon = opts.horizon ?? 30;

  const tail = series.slice(-lookback).filter((v) => Number.isFinite(v));
  const n = tail.length;

  if (n < 7) {
    const last = tail[n - 1] ?? 0;
    const sigma = Math.max(1, Math.abs(last) * 0.05);
    const points: ForecastPoint[] = [];
    for (let i = 0; i < n; i++) {
      points.push({ t: i - (n - 1), actual: tail[i] });
    }
    for (let t = 1; t <= horizon; t++) {
      points.push({
        t,
        p50: last,
        p20: last - 0.84 * sigma * Math.sqrt(t),
        p80: last + 0.84 * sigma * Math.sqrt(t),
      });
    }
    return {
      method: "auto_linear_vol_30d",
      points,
      tail: {
        p20: last - 0.84 * sigma * Math.sqrt(horizon),
        p50: last,
        p80: last + 0.84 * sigma * Math.sqrt(horizon),
      },
      sigma,
      slope: 0,
      intercept: last,
      fitSamples: n,
    };
  }

  // OLS on (i, y_i) for i = 0..n-1.
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < n; i++) {
    sx += i;
    sy += tail[i];
  }
  const mx = sx / n;
  const my = sy / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - mx) * (tail[i] - my);
    den += (i - mx) * (i - mx);
  }
  const slope = den > 0 ? num / den : 0;
  const interceptTrain = my - slope * mx;

  // Residual std (standard error of the regression).
  let ssr = 0;
  for (let i = 0; i < n; i++) {
    const pred = interceptTrain + slope * i;
    const resid = tail[i] - pred;
    ssr += resid * resid;
  }
  const sigma = Math.sqrt(ssr / Math.max(n - 2, 1));

  // Reframe intercept so t=0 is "today" (i.e. i = n-1).
  const intercept = interceptTrain + slope * (n - 1);

  const points: ForecastPoint[] = [];
  for (let i = 0; i < n; i++) {
    points.push({ t: i - (n - 1), actual: tail[i] });
  }
  // The band grows with sqrt(t) — the same profile as an integrated random walk.
  // 0.84 is the z-score for the 80th percentile under a normal assumption.
  for (let t = 1; t <= horizon; t++) {
    const center = intercept + slope * t;
    const width = 0.84 * sigma * Math.sqrt(t);
    points.push({
      t,
      p50: center,
      p20: center - width,
      p80: center + width,
    });
  }

  const tailPoint = {
    p50: intercept + slope * horizon,
    p20: intercept + slope * horizon - 0.84 * sigma * Math.sqrt(horizon),
    p80: intercept + slope * horizon + 0.84 * sigma * Math.sqrt(horizon),
  };

  return {
    method: "auto_linear_vol_30d",
    points,
    tail: tailPoint,
    sigma,
    slope,
    intercept,
    fitSamples: n,
  };
}

/**
 * Build a star-trajectory prediction for a repo from its sparkline.
 *
 * The sparkline in our Repo type is 30 daily points of absolute star counts.
 * We forecast the absolute stars value at `horizonDays`.
 */
export function buildStarTrajectoryPrediction(params: {
  repoFullName: string;
  sparklineData: number[];
  currentStars: number;
  horizonDays?: number;
  now?: Date;
}): Prediction {
  const horizon = params.horizonDays ?? 30;
  const now = params.now ?? new Date();
  const series =
    params.sparklineData.length > 0
      ? params.sparklineData
      : [params.currentStars];
  const forecast = forecastLinear(series, { horizon, lookback: 30 });

  return {
    id: `pred_star_${params.repoFullName.replace("/", "--")}_${horizon}d_${now.getTime()}`,
    subjectType: "repo",
    subjectId: params.repoFullName,
    archetype: "star_trajectory",
    question: questionForArchetype("star_trajectory", {
      repo: params.repoFullName,
      horizonDays: horizon,
      tail: forecast.tail.p50,
    }),
    method: forecast.method,
    horizonDays: horizon,
    p20: forecast.tail.p20,
    p50: forecast.tail.p50,
    p80: forecast.tail.p80,
    metric: "stars",
    unit: "stars",
    openedAt: now.toISOString(),
    resolvesAt: new Date(now.getTime() + horizon * 86_400_000).toISOString(),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

function questionForArchetype(
  arche: PredictionArchetype,
  ctx: { repo?: string; horizonDays?: number; tail?: number },
): string {
  const target = Math.round(ctx.tail ?? 0);
  const days = ctx.horizonDays ?? 30;
  switch (arche) {
    case "star_trajectory":
      return `Will ${ctx.repo} reach ~${target.toLocaleString()} stars in ${days} days?`;
    case "crossover":
      return `Will ${ctx.repo} cross its comparison peer in ${days} days?`;
    case "ship_release":
      return `Will ${ctx.repo} ship a tagged release in ${days} days?`;
    case "adoption":
      return `Will ${ctx.repo} rack up ≥10 cross-signal mentions in ${days} days?`;
  }
}
