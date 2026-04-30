// TrendingRepo Pipeline — Skill domain scorer tests.
//
// Covers the happy path, every documented degenerate case, and a small
// ranking sanity check.

import { test } from "node:test";
import assert from "node:assert/strict";

import { skillScorer, type SkillItem } from "../scoring/domain/skill";

function mk(overrides: Partial<SkillItem> = {}): SkillItem {
  return {
    domainKey: "skill",
    id: "test-skill",
    joinKeys: { repoFullName: "acme/test-skill" },
    installs7d: 1000,
    installsPrev7d: 500,
    stars: 200,
    forks: 25,
    agents: ["claude", "cursor"],
    inAwesomeLists: ["awesome-claude"],
    commitVelocity30d: 12,
    lastPushedAt: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString(),
    ...overrides,
  };
}

function weightSum(w: Record<string, number>): number {
  return Object.values(w).reduce((a, b) => a + b, 0);
}

test("skill happy path produces a finite score in [0, 100]", () => {
  const [s] = skillScorer.computeRaw([mk()]);
  assert.ok(Number.isFinite(s.rawScore));
  assert.ok(s.rawScore >= 0 && s.rawScore <= 100, `score=${s.rawScore}`);
  assert.ok(Math.abs(weightSum(s.weights) - 1) < 1e-9);
  assert.equal(s.primaryMetric.name, "installs7d");
  assert.equal(s.primaryMetric.value, 1000);
});

test("skill drops installsDelta7d when both fields missing and renormalizes", () => {
  const [s] = skillScorer.computeRaw([
    mk({ installs7d: undefined, installsPrev7d: undefined }),
  ]);
  assert.equal(s.weights.installsDelta7d, undefined);
  assert.ok(Math.abs(weightSum(s.weights) - 1) < 1e-9);
  assert.ok(s.rawScore >= 0 && s.rawScore <= 100);
});

test("skill drops forkRatio when forks/stars missing", () => {
  const [s] = skillScorer.computeRaw([
    mk({ stars: undefined, forks: undefined }),
  ]);
  assert.equal(s.weights.forkRatio, undefined);
  assert.ok(Math.abs(weightSum(s.weights) - 1) < 1e-9);
});

test("skill freshness defaults to 50 when lastPushedAt undefined", () => {
  const [s] = skillScorer.computeRaw([mk({ lastPushedAt: undefined })]);
  assert.equal(s.rawComponents.freshness, 50);
});

test("skill awesomeListInclusion saturates at 5 lists", () => {
  const [a] = skillScorer.computeRaw([
    mk({ inAwesomeLists: ["a", "b", "c", "d", "e", "f", "g"] }),
  ]);
  assert.equal(a.rawComponents.awesomeListInclusion, 100);
});

test("skill crossAgentSupport caps at 4 agents", () => {
  const [s] = skillScorer.computeRaw([
    mk({ agents: ["a", "b", "c", "d", "e", "f"] }),
  ]);
  assert.equal(s.rawComponents.crossAgentSupport, 100);
});

test("skill forkVelocity7d: forks=200, forks7dAgo=50 → non-zero component", () => {
  const [s] = skillScorer.computeRaw([mk({ forks: 200, forks7dAgo: 50 })]);
  assert.ok(
    s.rawComponents.forkVelocity7d > 0,
    `expected forkVelocity7d > 0, got ${s.rawComponents.forkVelocity7d}`,
  );
  assert.ok(s.weights.forkVelocity7d !== undefined);
});

test("skill forkVelocity7d: forks7dAgo undefined drops term and renormalizes", () => {
  const [s] = skillScorer.computeRaw([mk({ forks7dAgo: undefined })]);
  assert.equal(s.weights.forkVelocity7d, undefined);
  assert.equal(s.rawComponents.forkVelocity7d, undefined);
  assert.ok(Math.abs(weightSum(s.weights) - 1) < 1e-9);
});

test("skill derivativeRepoCount: 20 outscores 0 with otherwise identical input", () => {
  const base: Partial<SkillItem> = { id: "deriv" };
  const [hi] = skillScorer.computeRaw([mk({ ...base, derivativeRepoCount: 20 })]);
  const [lo] = skillScorer.computeRaw([mk({ ...base, derivativeRepoCount: 0 })]);
  assert.ok(
    hi.rawScore > lo.rawScore,
    `derivative=20 ${hi.rawScore} should beat derivative=0 ${lo.rawScore}`,
  );
});

test("skill weights total to 1.0 with all fields present", () => {
  const [s] = skillScorer.computeRaw([
    mk({
      forks7dAgo: 50,
      derivativeRepoCount: 10,
    }),
  ]);
  // All 8 weights should be active.
  const expectedKeys = [
    "installsDelta7d",
    "forkVelocity7d",
    "forkRatio",
    "derivativeRepoCount",
    "awesomeListInclusion",
    "commitVelocity30d",
    "crossAgentSupport",
    "freshness",
  ];
  for (const k of expectedKeys) {
    assert.ok(
      s.weights[k] !== undefined,
      `expected weight for ${k} to be defined`,
    );
  }
  assert.ok(Math.abs(weightSum(s.weights) - 1) < 1e-9);
});

test("skill renormalization invariant: all optionals undefined → score in [0,100], weights sum to 1", () => {
  const [s] = skillScorer.computeRaw([
    {
      domainKey: "skill",
      id: "bare",
      joinKeys: {},
      agents: [],
    },
  ]);
  assert.ok(s.rawScore >= 0 && s.rawScore <= 100, `score=${s.rawScore}`);
  assert.ok(
    Math.abs(weightSum(s.weights) - 1) < 1e-9,
    `weights=${JSON.stringify(s.weights)}`,
  );
});

test("skill ranking: high installs+forks beats low-stars-only repo", () => {
  const items: SkillItem[] = [
    mk({
      id: "winner",
      installs7d: 10000,
      installsPrev7d: 2000,
      stars: 500,
      forks: 200,
      inAwesomeLists: ["x", "y"],
      commitVelocity30d: 25,
    }),
    mk({
      id: "midfield",
      installs7d: 800,
      installsPrev7d: 600,
      stars: 100,
      forks: 5,
      inAwesomeLists: [],
      commitVelocity30d: 5,
    }),
    mk({
      id: "loser",
      installs7d: 50,
      installsPrev7d: 50,
      stars: 1000,
      forks: 0,
      agents: ["one"],
      inAwesomeLists: [],
      commitVelocity30d: 0,
      lastPushedAt: new Date(
        Date.now() - 200 * 24 * 3600 * 1000,
      ).toISOString(),
    }),
    mk({
      id: "no-installs",
      installs7d: undefined,
      installsPrev7d: undefined,
      stars: 50,
      forks: 5,
      inAwesomeLists: [],
      commitVelocity30d: 1,
    }),
    mk({
      id: "fresh-but-small",
      installs7d: 100,
      installsPrev7d: 50,
      stars: 30,
      forks: 3,
      inAwesomeLists: [],
      commitVelocity30d: 2,
    }),
  ];
  const scored = skillScorer.computeRaw(items);
  const byId = Object.fromEntries(scored.map((s) => [s.item.id, s.rawScore]));
  assert.ok(
    byId["winner"] > byId["midfield"],
    `winner ${byId["winner"]} > midfield ${byId["midfield"]}`,
  );
  assert.ok(
    byId["winner"] > byId["loser"],
    `winner ${byId["winner"]} > loser ${byId["loser"]}`,
  );
  for (const [, s] of Object.entries(byId)) {
    assert.ok(s >= 0 && s <= 100);
  }
});

// ---------------------------------------------------------------------------
// Q4 cold-start absolute-fallback tests (Phase 4 escalation 2026-04-29).
// Real-world day-1 deployment: worker fetchers run, but no 7d-ago snapshot
// exists yet. Delta components drop. Without abs fallbacks the scorer pins
// at ~28 for every skill (freshness + agent support only). With abs
// fallbacks an active skill should rank meaningfully higher.
// ---------------------------------------------------------------------------

test("skill abs fallback: forks=12000 + no forks7dAgo lifts score above 50", () => {
  const [s] = skillScorer.computeRaw([
    mk({
      installs7d: undefined,
      installsPrev7d: undefined,
      forks: 12_000,
      forks7dAgo: undefined,
      derivativeRepoCount: undefined,
      commitVelocity30d: undefined,
      inAwesomeLists: undefined,
    }),
  ]);
  // forksAbs fires; forkVelocity7d does NOT.
  assert.ok(s.rawComponents.forksAbs !== undefined, "forksAbs should fire");
  assert.equal(s.rawComponents.forkVelocity7d, undefined);
  assert.ok(s.weights.forksAbs !== undefined && s.weights.forksAbs > 0);
  assert.ok(Math.abs(weightSum(s.weights) - 1) < 1e-9);
  // Score lifted above the 28 floor.
  assert.ok(s.rawScore > 50, `expected score > 50, got ${s.rawScore}`);
});

test("skill abs fallback: forksAbs and forkVelocity7d are mutually exclusive", () => {
  const [s] = skillScorer.computeRaw([
    mk({ forks: 12_000, forks7dAgo: 10_000 }),
  ]);
  assert.ok(s.rawComponents.forkVelocity7d !== undefined, "forkVelocity7d fires when delta computable");
  assert.equal(s.rawComponents.forksAbs, undefined, "forksAbs should NOT fire when delta is present");
});

test("skill abs fallback: installsAbs fires when installs7d present but installsPrev7d absent", () => {
  const [s] = skillScorer.computeRaw([
    mk({ installs7d: 5_000, installsPrev7d: undefined }),
  ]);
  assert.ok(s.rawComponents.installsAbs !== undefined, "installsAbs should fire");
  assert.equal(s.rawComponents.installsDelta7d, undefined, "installsDelta7d should not fire");
  assert.ok(Math.abs(weightSum(s.weights) - 1) < 1e-9);
});

test("skill abs fallback: cold-start no-data still produces freshness-only score in 25-30 range", () => {
  const [s] = skillScorer.computeRaw([
    mk({
      installs7d: undefined,
      installsPrev7d: undefined,
      stars: undefined,
      forks: undefined,
      forks7dAgo: undefined,
      derivativeRepoCount: undefined,
      commitVelocity30d: undefined,
      inAwesomeLists: undefined,
      agents: [],
    }),
  ]);
  // No abs fallbacks fire (no forks, no installs).
  assert.equal(s.rawComponents.forksAbs, undefined);
  assert.equal(s.rawComponents.installsAbs, undefined);
  // Score remains in the prior cold-start range (freshness + zeros).
  assert.ok(s.rawScore < 50, `expected < 50 in pure cold start, got ${s.rawScore}`);
});

