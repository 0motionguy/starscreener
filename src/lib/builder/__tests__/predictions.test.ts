// TrendingRepo — Prediction engine tests.

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { forecastLinear, buildStarTrajectoryPrediction } from "../predictions";

test("forecastLinear: sparse series returns a tight band at last value", () => {
  const result = forecastLinear([10, 12, 14], { horizon: 7 });
  assert.equal(result.method, "auto_linear_vol_30d");
  assert.equal(result.fitSamples, 3);
  // With only 3 points, slope is ignored and we hold at the last value.
  assert.equal(result.slope, 0);
  assert.ok(result.tail.p50 === 14);
  assert.ok(result.tail.p20 < result.tail.p50);
  assert.ok(result.tail.p80 > result.tail.p50);
});

test("forecastLinear: monotonic rising series produces a positive slope", () => {
  const series = Array.from({ length: 30 }, (_, i) => 100 + i * 10);
  const result = forecastLinear(series, { horizon: 30 });
  assert.ok(result.slope > 5, `slope should be ~10, got ${result.slope}`);
  assert.ok(result.slope < 15);
  assert.ok(
    result.tail.p50 > series[series.length - 1],
    "forecast should extend upward",
  );
  // Residual on a perfectly linear series is ~0 (float noise only).
  assert.ok(result.sigma < 0.001);
});

test("forecastLinear: noisy series widens the band with √t", () => {
  const series = Array.from({ length: 30 }, (_, i) =>
    100 + i * 5 + (i % 2 === 0 ? 20 : -20),
  );
  const result = forecastLinear(series, { horizon: 30 });
  const widthAt1 =
    (result.points.find((p) => p.t === 1)?.p80 ?? 0) -
    (result.points.find((p) => p.t === 1)?.p20 ?? 0);
  const widthAt30 =
    (result.points.find((p) => p.t === 30)?.p80 ?? 0) -
    (result.points.find((p) => p.t === 30)?.p20 ?? 0);
  // Band at t=30 should be √30 ≈ 5.48x the width at t=1.
  const ratio = widthAt30 / Math.max(widthAt1, 1e-9);
  assert.ok(ratio > 5 && ratio < 6, `ratio was ${ratio}`);
});

test("forecastLinear: history points are included before forecast points", () => {
  const series = Array.from({ length: 10 }, (_, i) => 50 + i);
  const result = forecastLinear(series, { horizon: 5 });
  const historyCount = result.points.filter((p) => p.actual !== undefined).length;
  const forecastCount = result.points.filter((p) => p.p50 !== undefined).length;
  assert.equal(historyCount, 10);
  assert.equal(forecastCount, 5);
  // t=0 is the last history point, t=1..5 are forecast.
  assert.equal(
    result.points[result.points.length - 6].t,
    0,
    "t=0 should be the anchor",
  );
});

test("buildStarTrajectoryPrediction: p20 <= p50 <= p80 and question is well-formed", () => {
  const p = buildStarTrajectoryPrediction({
    repoFullName: "owner/repo",
    sparklineData: Array.from({ length: 30 }, (_, i) => 1000 + i * 20),
    currentStars: 1600,
    horizonDays: 30,
  });
  assert.ok(p.p20 <= p.p50);
  assert.ok(p.p50 <= p.p80);
  assert.match(p.question, /owner\/repo/);
  assert.match(p.question, /30 days/);
  assert.equal(p.subjectType, "repo");
  assert.equal(p.archetype, "star_trajectory");
  assert.equal(p.metric, "stars");
});
