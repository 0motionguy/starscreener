import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
  _resetStarActivityDeltasCacheForTests,
  _seedStarActivityDeltasForTests,
  getStarActivityDeltasCoveragePct,
  getStarActivityDeltasCoverageQuality,
  type StarActivityDeltasFile,
} from "../star-activity-deltas";

afterEach(() => {
  _resetStarActivityDeltasCacheForTests();
});

function seedWithCoverage(
  coverage: StarActivityDeltasFile["coverage"],
): void {
  _seedStarActivityDeltasForTests({
    computedAt: "2026-06-01T00:00:00.000Z",
    coverage,
    repos: {},
  });
}

test("star-activity-deltas coverage quality is full when exact/nearest dominate", () => {
  seedWithCoverage({
    exact: 5154,
    nearest: 32,
    "cold-start": 10,
    "no-history": 0,
  });

  assert.equal(getStarActivityDeltasCoverageQuality(), "full");
  assert.equal(Math.round(getStarActivityDeltasCoveragePct() * 10) / 10, 99.8);
});

test("star-activity-deltas coverage quality remains partial when cold-start dominates", () => {
  seedWithCoverage({
    exact: 10,
    nearest: 0,
    "cold-start": 90,
    "no-history": 0,
  });

  assert.equal(getStarActivityDeltasCoverageQuality(), "partial");
});

test("star-activity-deltas coverage quality is cold before the worker publishes", () => {
  assert.equal(getStarActivityDeltasCoverageQuality(), "cold");
  assert.equal(getStarActivityDeltasCoveragePct(), 0);
});
