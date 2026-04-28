// TrendingRepo Pipeline — arXiv paper domain scorer tests.

import { test } from "node:test";
import assert from "node:assert/strict";

import { arxivScorer, type ArxivPaperItem } from "../scoring/domain/arxiv";

function mk(overrides: Partial<ArxivPaperItem> = {}): ArxivPaperItem {
  return {
    domainKey: "arxiv",
    id: "2305.12345",
    joinKeys: { arxivId: "2305.12345" },
    citationVelocity: 3,
    citationCount: 18,
    linkedRepoMomentum: 65,
    socialMentions: 8,
    hfAdoptionCount: 3,
    daysSincePublished: 30,
    ...overrides,
  };
}

function weightSum(w: Record<string, number>): number {
  return Object.values(w).reduce((a, b) => a + b, 0);
}

test("arxiv default weights sum to 1.0", () => {
  const sum = Object.values(arxivScorer.defaultWeights).reduce(
    (a, b) => a + b,
    0,
  );
  assert.ok(Math.abs(sum - 1) < 1e-9, `defaultWeights sum=${sum}`);
});

test("arxiv happy path", () => {
  const [s] = arxivScorer.computeRaw([mk()]);
  assert.ok(s.rawScore >= 0 && s.rawScore <= 100);
  assert.ok(Math.abs(weightSum(s.weights) - 1) < 1e-9);
  assert.equal(s.primaryMetric.name, "citationCount");
});

test("arxiv drops linkedRepoMomentum when undefined", () => {
  const [s] = arxivScorer.computeRaw([
    mk({ linkedRepoMomentum: undefined, daysSincePublished: 10 }),
  ]);
  assert.equal(s.weights.linkedRepoMomentum, undefined);
  // coldStartBoost requires linkedRepoMomentum, so it must also drop
  assert.equal(s.weights.coldStartBoost, undefined);
  assert.ok(Math.abs(weightSum(s.weights) - 1) < 1e-9);
});

test("arxiv coldStartBoost active only within 14 days AND with linkedRepoMomentum", () => {
  const [recent] = arxivScorer.computeRaw([
    mk({ daysSincePublished: 7, linkedRepoMomentum: 80 }),
  ]);
  assert.ok(recent.weights.coldStartBoost !== undefined);
  assert.ok(recent.rawComponents.coldStartBoost > 0);

  const [old] = arxivScorer.computeRaw([
    mk({ daysSincePublished: 30, linkedRepoMomentum: 80 }),
  ]);
  assert.equal(old.weights.coldStartBoost, undefined);
});

test("arxiv handles all-zero inputs without NaN", () => {
  const [s] = arxivScorer.computeRaw([
    mk({
      citationVelocity: 0,
      socialMentions: 0,
      hfAdoptionCount: 0,
      daysSincePublished: 999,
      linkedRepoMomentum: 0,
    }),
  ]);
  assert.ok(Number.isFinite(s.rawScore));
  assert.ok(s.rawScore >= 0);
});

test("arxiv ranking: hot paper with linked code beats forgotten preprint", () => {
  const items: ArxivPaperItem[] = [
    mk({
      id: "hot",
      citationVelocity: 25,
      citationCount: 120,
      linkedRepoMomentum: 90,
      socialMentions: 50,
      hfAdoptionCount: 12,
      daysSincePublished: 7,
    }),
    mk({
      id: "decent",
      citationVelocity: 4,
      citationCount: 20,
      linkedRepoMomentum: 50,
      socialMentions: 5,
      hfAdoptionCount: 2,
      daysSincePublished: 60,
    }),
    mk({
      id: "forgotten",
      citationVelocity: 0,
      citationCount: 1,
      linkedRepoMomentum: undefined,
      socialMentions: 0,
      hfAdoptionCount: 0,
      daysSincePublished: 365,
    }),
    mk({
      id: "fresh-no-repo",
      citationVelocity: 0,
      citationCount: 0,
      linkedRepoMomentum: undefined,
      socialMentions: 1,
      hfAdoptionCount: 0,
      daysSincePublished: 5,
    }),
    mk({
      id: "cited-paper-no-buzz",
      citationVelocity: 6,
      citationCount: 80,
      linkedRepoMomentum: 30,
      socialMentions: 0,
      hfAdoptionCount: 1,
      daysSincePublished: 200,
    }),
  ];
  const scored = arxivScorer.computeRaw(items);
  const byId = Object.fromEntries(scored.map((s) => [s.item.id, s.rawScore]));
  assert.ok(byId["hot"] > byId["decent"]);
  assert.ok(byId["decent"] > byId["forgotten"]);
  for (const v of Object.values(byId)) {
    assert.ok(v >= 0 && v <= 100);
  }
});
