import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CONSENSUS_MAX_SOURCE_SKEW_RATIO,
  CONSENSUS_MIN_ACTIVE_EXTERNAL_SOURCES,
  CONSENSUS_MIN_POOL_ITEMS,
  evaluateConsensusCoverage,
} from "../consensus-coverage";
import type { ConsensusExternalSource } from "../consensus-trending";

function stats(
  active: ConsensusExternalSource[],
): Record<ConsensusExternalSource, { count: number; rows: number }> {
  const activeSet = new Set(active);
  return {
    gh: { count: activeSet.has("gh") ? 100 : 0, rows: activeSet.has("gh") ? 100 : 0 },
    hf: { count: activeSet.has("hf") ? 100 : 0, rows: activeSet.has("hf") ? 100 : 0 },
    hn: { count: activeSet.has("hn") ? 100 : 0, rows: activeSet.has("hn") ? 100 : 0 },
    x: { count: activeSet.has("x") ? 100 : 0, rows: activeSet.has("x") ? 100 : 0 },
    r: { count: activeSet.has("r") ? 100 : 0, rows: activeSet.has("r") ? 100 : 0 },
    pdh: { count: activeSet.has("pdh") ? 100 : 0, rows: activeSet.has("pdh") ? 100 : 0 },
    dev: { count: activeSet.has("dev") ? 100 : 0, rows: activeSet.has("dev") ? 100 : 0 },
    bs: { count: activeSet.has("bs") ? 100 : 0, rows: activeSet.has("bs") ? 100 : 0 },
  };
}

test("passes when all 8 sources are present and pool size meets minimum", () => {
  const coverage = evaluateConsensusCoverage({
    itemCount: CONSENSUS_MIN_POOL_ITEMS,
    sourceStats: stats(["gh", "hf", "hn", "x", "r", "pdh", "dev", "bs"]),
  });

  assert.equal(coverage.starved, false);
  assert.equal(coverage.activeSources, 8);
  assert.deepEqual(coverage.reasons, []);
});

test("gates when active source count drops below threshold", () => {
  const coverage = evaluateConsensusCoverage({
    itemCount: CONSENSUS_MIN_POOL_ITEMS + 20,
    sourceStats: stats(["gh", "hf", "hn", "x"]),
  });

  assert.equal(coverage.starved, true);
  assert.equal(coverage.activeSources, CONSENSUS_MIN_ACTIVE_EXTERNAL_SOURCES - 1);
  assert.ok(
    coverage.reasons.some((r) => r.includes("active external sources")),
    "expected active source count reason",
  );
  assert.ok(
    coverage.reasons.some((r) => r.includes("missing external sources")),
    "expected missing source reason",
  );
  assert.ok(coverage.inactiveSources.includes("pdh"));
});

test("gates when pool size drops below threshold", () => {
  const coverage = evaluateConsensusCoverage({
    itemCount: CONSENSUS_MIN_POOL_ITEMS - 1,
    sourceStats: stats(["gh", "hf", "hn", "x", "r", "pdh", "dev", "bs"]),
  });

  assert.equal(coverage.starved, true);
  assert.ok(
    coverage.reasons.some((r) => r.includes("pool size")),
    "expected pool-size reason",
  );
});

test("accumulates both reasons when both constraints fail", () => {
  const coverage = evaluateConsensusCoverage({
    itemCount: CONSENSUS_MIN_POOL_ITEMS - 10,
    sourceStats: stats(["gh", "hf"]),
  });

  assert.equal(coverage.starved, true);
  assert.ok(coverage.reasons.length >= 2);
});

test("gates when source pool skew is too high", () => {
  const coverage = evaluateConsensusCoverage({
    itemCount: CONSENSUS_MIN_POOL_ITEMS + 50,
    sourceStats: {
      gh: { count: 1000, rows: 1000 },
      hf: { count: 100, rows: 100 },
      hn: { count: 100, rows: 100 },
      x: { count: 100, rows: 100 },
      r: { count: 100, rows: 100 },
      pdh: { count: 10, rows: 10 },
      dev: { count: 100, rows: 100 },
      bs: { count: 100, rows: 100 },
    },
  });

  assert.equal(coverage.starved, true);
  assert.ok(
    coverage.reasons.some((r) =>
      r.includes(`exceeds ${CONSENSUS_MAX_SOURCE_SKEW_RATIO}x`),
    ),
    "expected skew reason",
  );
});
