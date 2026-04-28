// TrendingRepo Pipeline — shadow-mode harness tests.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  applyCutoverGate,
  buildShadowReport,
  CUTOVER_SPEARMAN_MIN,
  CUTOVER_TOP10_OVERLAP_MIN,
  kendallTau,
  spearmanRho,
  topNOverlap,
} from "../shadow-mode";
import type { ShadowReport } from "../shadow-mode";

// ---------------------------------------------------------------------------
// spearmanRho
// ---------------------------------------------------------------------------

test("spearmanRho: identical inputs → 1.0", () => {
  const xs = [1, 2, 3, 4, 5];
  assert.equal(spearmanRho(xs, xs), 1);
});

test("spearmanRho: reversed inputs → -1.0", () => {
  const xs = [1, 2, 3, 4, 5];
  const ys = [5, 4, 3, 2, 1];
  assert.equal(spearmanRho(xs, ys), -1);
});

test("spearmanRho: uncorrelated near 0", () => {
  // Manually constructed near-zero pair.
  const xs = [1, 2, 3, 4, 5, 6];
  const ys = [3, 1, 4, 6, 2, 5];
  const rho = spearmanRho(xs, ys);
  assert.ok(rho > -0.5 && rho < 0.5, `expected near 0 got ${rho}`);
});

test("spearmanRho: handles tied ranks without NaN", () => {
  const xs = [1, 2, 2, 3];
  const ys = [4, 5, 5, 6];
  const rho = spearmanRho(xs, ys);
  assert.ok(Number.isFinite(rho));
  assert.ok(rho > 0.9, `expected strong positive got ${rho}`);
});

test("spearmanRho: empty / single → 0", () => {
  assert.equal(spearmanRho([], []), 0);
  assert.equal(spearmanRho([1], [1]), 0);
});

test("spearmanRho: zero-variance series → 0 (no NaN)", () => {
  const xs = [1, 1, 1, 1];
  const ys = [1, 2, 3, 4];
  assert.equal(spearmanRho(xs, ys), 0);
});

// ---------------------------------------------------------------------------
// kendallTau
// ---------------------------------------------------------------------------

test("kendallTau: identical → 1.0", () => {
  const xs = [1, 2, 3, 4, 5];
  assert.equal(kendallTau(xs, xs), 1);
});

test("kendallTau: reversed → -1.0", () => {
  const xs = [1, 2, 3, 4, 5];
  const ys = [5, 4, 3, 2, 1];
  assert.equal(kendallTau(xs, ys), -1);
});

test("kendallTau: handles ties", () => {
  const xs = [1, 2, 2, 3];
  const ys = [1, 2, 2, 3];
  const tau = kendallTau(xs, ys);
  assert.ok(Number.isFinite(tau));
  assert.ok(tau > 0.9);
});

// ---------------------------------------------------------------------------
// topNOverlap
// ---------------------------------------------------------------------------

test("topNOverlap: full overlap → 1.0", () => {
  const a = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const b = [{ id: "c" }, { id: "b" }, { id: "a" }];
  assert.equal(topNOverlap(a, b, (x) => x.id), 1);
});

test("topNOverlap: disjoint → 0", () => {
  const a = [{ id: "a" }, { id: "b" }];
  const b = [{ id: "c" }, { id: "d" }];
  assert.equal(topNOverlap(a, b, (x) => x.id), 0);
});

test("topNOverlap: partial → fraction", () => {
  const a = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
  const b = [{ id: "a" }, { id: "x" }, { id: "c" }, { id: "y" }];
  assert.equal(topNOverlap(a, b, (x) => x.id), 0.5);
});

test("topNOverlap: empty input → 0", () => {
  assert.equal(topNOverlap([], [], (x: { id: string }) => x.id), 0);
});

test("topNOverlap: respects N parameter", () => {
  const a = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const b = [{ id: "a" }, { id: "z" }, { id: "y" }];
  assert.equal(topNOverlap(a, b, (x) => x.id, 1), 1);
  assert.equal(topNOverlap(a, b, (x) => x.id, 3), 1 / 3);
});

// ---------------------------------------------------------------------------
// buildShadowReport
// ---------------------------------------------------------------------------

test("buildShadowReport: identical inputs → high rho, full overlap, no churn", () => {
  const ranking = Array.from({ length: 12 }, (_, i) => ({
    id: `item-${i}`,
    title: `Item ${i}`,
    momentum: 100 - i * 5,
  }));
  const report = buildShadowReport("skill", ranking, ranking);
  assert.equal(report.domainKey, "skill");
  assert.equal(report.prodTop50.length, 12);
  assert.equal(report.shadowTop50.length, 12);
  assert.ok(report.spearmanRho > 0.99);
  assert.ok(report.kendallTau > 0.99);
  assert.equal(report.setOverlapTop50, 1);
  assert.equal(report.top10Churn, 0);
  assert.equal(report.rankChanges.length, 0);
  assert.ok(report.cutoverGatePass);
});

test("buildShadowReport: rankChanges sorted by abs(delta) desc", () => {
  const prod = [
    { id: "a", title: "A", momentum: 100 },
    { id: "b", title: "B", momentum: 90 },
    { id: "c", title: "C", momentum: 80 },
    { id: "d", title: "D", momentum: 70 },
    { id: "e", title: "E", momentum: 60 },
  ];
  // Reverse the order in shadow so deltas are large + symmetric.
  const shadow = [
    { id: "e", title: "E", momentum: 100 },
    { id: "d", title: "D", momentum: 90 },
    { id: "c", title: "C", momentum: 80 },
    { id: "b", title: "B", momentum: 70 },
    { id: "a", title: "A", momentum: 60 },
  ];
  const report = buildShadowReport("mcp", prod, shadow);
  assert.ok(report.rankChanges.length > 0);
  for (let i = 1; i < report.rankChanges.length; i++) {
    assert.ok(
      Math.abs(report.rankChanges[i - 1].delta) >=
        Math.abs(report.rankChanges[i].delta),
    );
  }
  // Reversed → strong negative correlation.
  assert.ok(report.spearmanRho < -0.9);
});

test("buildShadowReport: greenfield domain (hf-model) gate passes regardless", () => {
  const prod = [{ id: "a", title: "A", momentum: 50 }];
  const shadow = [{ id: "b", title: "B", momentum: 50 }];
  const report = buildShadowReport("hf-model", prod, shadow);
  assert.equal(report.cutoverGatePass, true);
  assert.match(report.cutoverGateReason, /greenfield|gate N\/A/i);
});

// ---------------------------------------------------------------------------
// applyCutoverGate
// ---------------------------------------------------------------------------

function makeReport(overrides: Partial<ShadowReport>): ShadowReport {
  const base: ShadowReport = {
    domainKey: "skill",
    prodTop50: Array.from({ length: 10 }, (_, i) => ({
      id: `p-${i}`,
      title: `P${i}`,
      momentum: 100 - i,
      rank: i + 1,
    })),
    shadowTop50: Array.from({ length: 10 }, (_, i) => ({
      id: `p-${i}`,
      title: `P${i}`,
      momentum: 100 - i,
      rank: i + 1,
    })),
    spearmanRho: 0.7,
    kendallTau: 0.6,
    setOverlapTop50: 1,
    top10Churn: 0,
    rankChanges: [],
    generatedAt: new Date().toISOString(),
    cutoverGatePass: false,
    cutoverGateReason: "",
  };
  return { ...base, ...overrides };
}

test("applyCutoverGate: pass case (Spearman 0.7, full overlap)", () => {
  const r = makeReport({ spearmanRho: 0.7 });
  const verdict = applyCutoverGate(r);
  assert.equal(verdict.pass, true);
  assert.match(verdict.reason, /Spearman/);
});

test("applyCutoverGate: fail case (Spearman 0.3)", () => {
  const r = makeReport({ spearmanRho: 0.3 });
  const verdict = applyCutoverGate(r);
  assert.equal(verdict.pass, false);
  assert.match(verdict.reason, /Spearman/);
});

test("applyCutoverGate: edge case (Spearman exactly 0.6) passes", () => {
  const r = makeReport({ spearmanRho: CUTOVER_SPEARMAN_MIN });
  const verdict = applyCutoverGate(r);
  assert.equal(verdict.pass, true);
});

test("applyCutoverGate: fail when top-10 overlap < 5", () => {
  // Construct shadow top-10 where only 4 items overlap with prod top-10.
  const prodTop50 = Array.from({ length: 10 }, (_, i) => ({
    id: `p-${i}`,
    title: `P${i}`,
    momentum: 100 - i,
    rank: i + 1,
  }));
  const shadowTop50 = [
    ...prodTop50.slice(0, 4), // 4 shared
    ...Array.from({ length: 6 }, (_, i) => ({
      id: `x-${i}`,
      title: `X${i}`,
      momentum: 50 - i,
      rank: i + 5,
    })),
  ];
  const r = makeReport({ spearmanRho: 0.8, prodTop50, shadowTop50 });
  const verdict = applyCutoverGate(r);
  assert.equal(verdict.pass, false);
  assert.match(verdict.reason, /top-10 overlap/);
  // Sanity check: the constant matches the message.
  assert.ok(verdict.reason.includes(`< ${CUTOVER_TOP10_OVERLAP_MIN}`));
});

test("applyCutoverGate: greenfield arxiv → pass (N/A)", () => {
  const r = makeReport({ domainKey: "arxiv", spearmanRho: 0 });
  const verdict = applyCutoverGate(r);
  assert.equal(verdict.pass, true);
  assert.match(verdict.reason, /greenfield|gate N\/A/i);
});

test("applyCutoverGate: empty rankings → pass with explanation", () => {
  const r = makeReport({ prodTop50: [], shadowTop50: [] });
  const verdict = applyCutoverGate(r);
  assert.equal(verdict.pass, true);
  assert.match(verdict.reason, /empty/i);
});
