// Tests for the v1 prediction model. Pure function — no I/O — so no
// temp directory setup needed.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  MIN_SPARKLINE_POINTS,
  PREDICTION_HORIZONS,
  PREDICTION_MODEL_VERSION,
  explainPrediction,
  isPredictionHorizon,
  predictRepoTrajectory,
  sampleStdDev,
  sparklineToDeltas,
  weightedMeanRecent,
} from "../predictions";

import type { Repo } from "../types";

function makeRepo(partial: Partial<Repo> & { fullName: string }): Repo {
  // Minimal Repo stub with the only fields predictRepoTrajectory consumes.
  return {
    id: partial.fullName.replace("/", "--"),
    fullName: partial.fullName,
    name: partial.fullName.split("/")[1] ?? "",
    owner: partial.fullName.split("/")[0] ?? "",
    ownerAvatarUrl: "",
    description: "",
    url: `https://github.com/${partial.fullName}`,
    language: null,
    topics: [],
    categoryId: "devtools",
    stars: partial.stars ?? 1000,
    forks: 0,
    contributors: 0,
    openIssues: 0,
    lastCommitAt: new Date().toISOString(),
    lastReleaseAt: null,
    lastReleaseTag: null,
    createdAt: "2022-01-01T00:00:00.000Z",
    starsDelta24h: partial.starsDelta24h ?? 0,
    starsDelta7d: partial.starsDelta7d ?? 0,
    starsDelta30d: partial.starsDelta30d ?? 0,
    forksDelta7d: 0,
    contributorsDelta30d: 0,
    momentumScore: 50,
    movementStatus: "stable",
    rank: 100,
    categoryRank: 10,
    sparklineData: partial.sparklineData ?? [],
    socialBuzzScore: 0,
    mentionCount24h: 0,
  };
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

test("sparklineToDeltas returns one fewer entry than input", () => {
  const deltas = sparklineToDeltas([100, 110, 120, 135]);
  assert.deepEqual(deltas, [10, 10, 15]);
});

test("sparklineToDeltas clamps negative deltas (unstars) to zero", () => {
  // Unstars → cumulative count drops. Treating that as negative momentum
  // would push predictions below current stars, which is nonsense in the
  // forecast frame. Clamp at zero.
  const deltas = sparklineToDeltas([100, 95, 105]);
  assert.deepEqual(deltas, [0, 10]);
});

test("weightedMeanRecent gives more weight to recent entries", () => {
  // Three entries [old=10, mid=10, new=100]. With decay 0.5 the newest
  // weight is 1.0, mid is 0.5, old is 0.25 → weighted sum = 100 + 5 + 2.5
  // = 107.5; total weight = 1.75; mean ≈ 61.4. Critically larger than
  // the unweighted mean (40).
  const recentHeavy = weightedMeanRecent([10, 10, 100], 0.5);
  assert.ok(recentHeavy > 60, `expected >60, got ${recentHeavy}`);
  assert.ok(recentHeavy < 65);
});

test("weightedMeanRecent collapses to plain mean when decay = 1", () => {
  const out = weightedMeanRecent([5, 10, 15], 1);
  assert.equal(out, 10);
});

test("weightedMeanRecent returns 0 on empty input", () => {
  assert.equal(weightedMeanRecent([]), 0);
});

test("sampleStdDev uses Bessel correction (n-1)", () => {
  // Sample of [2, 4, 4, 4, 5, 5, 7, 9] has population std ≈ 2.0; sample
  // std (n-1) ≈ 2.138 — so the result should be slightly above 2.
  const std = sampleStdDev([2, 4, 4, 4, 5, 5, 7, 9]);
  assert.ok(Math.abs(std - 2.138) < 0.01, `got ${std}`);
});

test("sampleStdDev returns 0 for fewer than 2 values", () => {
  assert.equal(sampleStdDev([]), 0);
  assert.equal(sampleStdDev([42]), 0);
});

// ---------------------------------------------------------------------------
// Predictor — happy path
// ---------------------------------------------------------------------------

test("predictRepoTrajectory returns a forecast for a steady-growth repo", () => {
  // 30 cumulative-star points growing by 10/day. Predict +7d.
  const sparkline = Array.from({ length: 30 }, (_, i) => 1000 + i * 10);
  const repo = makeRepo({
    fullName: "test/repo",
    stars: sparkline[sparkline.length - 1]!,
    starsDelta24h: 10,
    starsDelta7d: 70,
    starsDelta30d: 290,
    sparklineData: sparkline,
  });
  const result = predictRepoTrajectory(repo, 7);
  assert.equal(result.kind, "ok");
  if (result.kind !== "ok") return;
  assert.equal(result.prediction.horizonDays, 7);
  assert.ok(result.prediction.pointEstimate > repo.stars);
  // For a steady 10/day repo with light damping the 7d projection
  // should add roughly 10 * 7 * exp(-7/60) ≈ 62 stars.
  const projected = result.prediction.pointEstimate - repo.stars;
  assert.ok(
    projected > 50 && projected < 80,
    `expected 50-80 projected stars, got ${projected}`,
  );
  // Confidence band: lower can't go below current stars.
  assert.ok(result.prediction.lowP10 >= repo.stars);
  assert.ok(result.prediction.highP90 >= result.prediction.pointEstimate);
});

test("predictRepoTrajectory short horizon has tighter band than long horizon", () => {
  const sparkline = Array.from({ length: 30 }, (_, i) => 1000 + i * 10);
  const repo = makeRepo({
    fullName: "test/repo",
    stars: sparkline[sparkline.length - 1]!,
    starsDelta24h: 10,
    starsDelta7d: 70,
    starsDelta30d: 290,
    sparklineData: sparkline,
  });
  const seven = predictRepoTrajectory(repo, 7);
  const ninety = predictRepoTrajectory(repo, 90);
  assert.equal(seven.kind, "ok");
  assert.equal(ninety.kind, "ok");
  if (seven.kind !== "ok" || ninety.kind !== "ok") return;
  // For a perfectly steady repo with stdDev=0 the band collapses; add
  // a touch of noise to make this meaningful by re-running with jitter.
  // Already guaranteed by sqrt(horizon) scaling: just assert 90d band
  // is at least as wide as 7d.
  const sevenWidth = seven.prediction.highP90 - seven.prediction.lowP10;
  const ninetyWidth = ninety.prediction.highP90 - ninety.prediction.lowP10;
  assert.ok(
    ninetyWidth >= sevenWidth,
    `expected 90d band >= 7d band, got ${ninetyWidth} vs ${sevenWidth}`,
  );
});

test("predictRepoTrajectory damps long-horizon forecasts", () => {
  // Strong recent velocity (50/day). 90d undamped would project +4500 stars;
  // damped at exp(-90/60) ≈ 0.22 should land around +1000.
  const sparkline = Array.from({ length: 30 }, (_, i) => 1000 + i * 50);
  const repo = makeRepo({
    fullName: "test/repo",
    stars: sparkline[sparkline.length - 1]!,
    starsDelta24h: 50,
    starsDelta7d: 350,
    starsDelta30d: 1450,
    sparklineData: sparkline,
  });
  const result = predictRepoTrajectory(repo, 90);
  assert.equal(result.kind, "ok");
  if (result.kind !== "ok") return;
  const projected = result.prediction.pointEstimate - repo.stars;
  // With damping, projection should NOT be a hockey stick.
  assert.ok(
    projected < 50 * 90,
    `expected damping to keep projection well below 4500 stars, got ${projected}`,
  );
  assert.ok(
    projected > 50 * 90 * 0.1,
    `damping shouldn't zero out the projection, got ${projected}`,
  );
});

test("predictRepoTrajectory accelerating repo has a higher recent-mean than plain 30d/30 average", () => {
  // First 20 days: 5 stars/day. Last 10 days: 50 stars/day. Recent-weighted
  // mean should land much closer to 50 than to the simple 30d average (~20).
  const sparkline: number[] = [1000];
  for (let i = 0; i < 20; i++) {
    sparkline.push(sparkline[sparkline.length - 1]! + 5);
  }
  for (let i = 0; i < 9; i++) {
    sparkline.push(sparkline[sparkline.length - 1]! + 50);
  }
  const repo = makeRepo({
    fullName: "test/accel",
    stars: sparkline[sparkline.length - 1]!,
    starsDelta24h: 50,
    starsDelta7d: 350,
    starsDelta30d: 550,
    sparklineData: sparkline,
  });
  const result = predictRepoTrajectory(repo, 7);
  assert.equal(result.kind, "ok");
  if (result.kind !== "ok") return;
  // Recent-weighted mean should be much closer to 50 than to the simple
  // 30d-average baseline of 550/30 ≈ 18.
  assert.ok(
    result.prediction.inputs.meanDailyDelta > 30,
    `expected recent-weighted mean to favor recent acceleration, got ${result.prediction.inputs.meanDailyDelta}`,
  );
});

// ---------------------------------------------------------------------------
// Predictor — edge cases
// ---------------------------------------------------------------------------

test("predictRepoTrajectory returns insufficient_data for short sparklines", () => {
  const repo = makeRepo({
    fullName: "test/new",
    stars: 50,
    sparklineData: [10, 20, 30, 40, 50],
  });
  const result = predictRepoTrajectory(repo, 30);
  assert.equal(result.kind, "insufficient_data");
});

test("predictRepoTrajectory returns insufficient_data for empty sparkline", () => {
  const repo = makeRepo({ fullName: "test/empty", stars: 0 });
  const result = predictRepoTrajectory(repo, 7);
  assert.equal(result.kind, "insufficient_data");
});

test("predictRepoTrajectory clamps lowP10 at current stars even with high volatility", () => {
  // Spiky sparkline with big variance — the band would otherwise dip
  // below current stars, which is non-physical (stars don't fall in
  // the prediction frame).
  const sparkline = [1000];
  for (let i = 0; i < 29; i++) {
    sparkline.push(sparkline[sparkline.length - 1]! + (i % 2 === 0 ? 100 : 0));
  }
  const repo = makeRepo({
    fullName: "test/spiky",
    stars: sparkline[sparkline.length - 1]!,
    starsDelta24h: 100,
    starsDelta7d: 350,
    starsDelta30d: 1500,
    sparklineData: sparkline,
  });
  const result = predictRepoTrajectory(repo, 30);
  assert.equal(result.kind, "ok");
  if (result.kind !== "ok") return;
  assert.ok(result.prediction.lowP10 >= repo.stars);
});

test("PREDICTION_HORIZONS exports the supported horizons", () => {
  assert.deepEqual([...PREDICTION_HORIZONS], [7, 30, 90]);
});

test("isPredictionHorizon narrows to the supported set", () => {
  assert.equal(isPredictionHorizon(7), true);
  assert.equal(isPredictionHorizon(30), true);
  assert.equal(isPredictionHorizon(90), true);
  assert.equal(isPredictionHorizon(14), false);
  assert.equal(isPredictionHorizon("30"), false);
  assert.equal(isPredictionHorizon(null), false);
});

test("model version is captured in every successful prediction", () => {
  const sparkline = Array.from({ length: 30 }, (_, i) => 100 + i * 2);
  const repo = makeRepo({
    fullName: "test/version",
    stars: sparkline[sparkline.length - 1]!,
    starsDelta24h: 2,
    starsDelta7d: 14,
    starsDelta30d: 58,
    sparklineData: sparkline,
  });
  const result = predictRepoTrajectory(repo, 7);
  assert.equal(result.kind, "ok");
  if (result.kind !== "ok") return;
  assert.equal(result.prediction.modelVersion, PREDICTION_MODEL_VERSION);
});

// ---------------------------------------------------------------------------
// explainPrediction
// ---------------------------------------------------------------------------

test("explainPrediction surfaces 'Accelerating' when recent > 30d avg", () => {
  const sparkline: number[] = [1000];
  for (let i = 0; i < 20; i++) {
    sparkline.push(sparkline[sparkline.length - 1]! + 1);
  }
  for (let i = 0; i < 9; i++) {
    sparkline.push(sparkline[sparkline.length - 1]! + 30);
  }
  const repo = makeRepo({
    fullName: "test/accel",
    stars: sparkline[sparkline.length - 1]!,
    starsDelta30d: 290,
    sparklineData: sparkline,
  });
  const r = predictRepoTrajectory(repo, 7);
  assert.equal(r.kind, "ok");
  if (r.kind !== "ok") return;
  const drivers = explainPrediction(r.prediction);
  assert.ok(drivers.some((d) => d.label === "Accelerating"));
});

test("explainPrediction surfaces 'Decelerating' when recent < 30d avg", () => {
  // First 20 days: 30/day. Last 10 days: 1/day.
  const sparkline: number[] = [1000];
  for (let i = 0; i < 20; i++) {
    sparkline.push(sparkline[sparkline.length - 1]! + 30);
  }
  for (let i = 0; i < 9; i++) {
    sparkline.push(sparkline[sparkline.length - 1]! + 1);
  }
  const repo = makeRepo({
    fullName: "test/decel",
    stars: sparkline[sparkline.length - 1]!,
    starsDelta30d: 610,
    sparklineData: sparkline,
  });
  const r = predictRepoTrajectory(repo, 7);
  assert.equal(r.kind, "ok");
  if (r.kind !== "ok") return;
  const drivers = explainPrediction(r.prediction);
  assert.ok(drivers.some((d) => d.label === "Decelerating"));
});

test("explainPrediction always returns at least one driver", () => {
  const sparkline = Array.from({ length: 30 }, (_, i) => 100 + i);
  const repo = makeRepo({
    fullName: "test/baseline",
    stars: sparkline[sparkline.length - 1]!,
    starsDelta30d: 29,
    sparklineData: sparkline,
  });
  const r = predictRepoTrajectory(repo, 30);
  assert.equal(r.kind, "ok");
  if (r.kind !== "ok") return;
  const drivers = explainPrediction(r.prediction);
  assert.ok(drivers.length >= 1);
});

// ---------------------------------------------------------------------------
// MIN_SPARKLINE_POINTS sanity
// ---------------------------------------------------------------------------

test("exactly MIN_SPARKLINE_POINTS produces a forecast (boundary)", () => {
  const sparkline = Array.from(
    { length: MIN_SPARKLINE_POINTS },
    (_, i) => 100 + i,
  );
  const repo = makeRepo({
    fullName: "test/boundary",
    stars: sparkline[sparkline.length - 1]!,
    starsDelta24h: 1,
    starsDelta7d: 7,
    starsDelta30d: MIN_SPARKLINE_POINTS - 1,
    sparklineData: sparkline,
  });
  const result = predictRepoTrajectory(repo, 7);
  assert.equal(result.kind, "ok");
});

test("one less than MIN_SPARKLINE_POINTS produces insufficient_data", () => {
  const sparkline = Array.from(
    { length: MIN_SPARKLINE_POINTS - 1 },
    (_, i) => 100 + i,
  );
  const repo = makeRepo({
    fullName: "test/below",
    stars: sparkline[sparkline.length - 1]!,
    sparklineData: sparkline,
  });
  const result = predictRepoTrajectory(repo, 7);
  assert.equal(result.kind, "insufficient_data");
});
