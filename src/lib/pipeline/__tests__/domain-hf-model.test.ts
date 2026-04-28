// TrendingRepo Pipeline — HF Model domain scorer tests.

import { test } from "node:test";
import assert from "node:assert/strict";

import { hfModelScorer, type HfModelItem } from "../scoring/domain/hf-model";

function mk(overrides: Partial<HfModelItem> = {}): HfModelItem {
  return {
    domainKey: "hf-model",
    id: "test-model",
    joinKeys: { hfModelId: "org/test-model" },
    downloads7d: 100000,
    likes: 200,
    likes7dAgo: 150,
    derivativeCount: 12,
    spacesUsingThis: 8,
    lastModified: new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString(),
    ...overrides,
  };
}

function weightSum(w: Record<string, number>): number {
  return Object.values(w).reduce((a, b) => a + b, 0);
}

test("hf-model happy path produces score in [0,100], weights sum to 1.0", () => {
  const [s] = hfModelScorer.computeRaw([mk()]);
  assert.ok(s.rawScore >= 0 && s.rawScore <= 100);
  assert.ok(Math.abs(weightSum(s.weights) - 1) < 1e-9);
  assert.equal(s.primaryMetric.name, "downloads_7d");
});

test("hf-model drops likesVelocity7d when likes7dAgo missing", () => {
  const [s] = hfModelScorer.computeRaw([mk({ likes7dAgo: undefined })]);
  assert.equal(s.weights.likesVelocity7d, undefined);
  assert.ok(Math.abs(weightSum(s.weights) - 1) < 1e-9);
});

test("hf-model 5M downloads cap saturates weeklyDownloadsCapped", () => {
  const [s] = hfModelScorer.computeRaw([mk({ downloads7d: 50_000_000 })]);
  assert.ok(s.rawComponents.weeklyDownloadsCapped >= 99.99);
});

test("hf-model recency=0 when lastModified is undefined", () => {
  const [s] = hfModelScorer.computeRaw([mk({ lastModified: undefined })]);
  assert.equal(s.rawComponents.recency, 0);
});

test("hf-model ranking: viral model beats forgotten model", () => {
  const items: HfModelItem[] = [
    mk({
      id: "viral",
      downloads7d: 2_000_000,
      likes: 5000,
      likes7dAgo: 4000,
      derivativeCount: 80,
      spacesUsingThis: 50,
    }),
    mk({
      id: "active",
      downloads7d: 50_000,
      likes: 200,
      likes7dAgo: 180,
      derivativeCount: 10,
      spacesUsingThis: 5,
    }),
    mk({
      id: "stale",
      downloads7d: 100,
      likes: 5,
      likes7dAgo: 5,
      derivativeCount: 0,
      spacesUsingThis: 0,
      lastModified: new Date(
        Date.now() - 200 * 24 * 3600 * 1000,
      ).toISOString(),
    }),
    mk({
      id: "no-likes-history",
      downloads7d: 5000,
      likes7dAgo: undefined,
      derivativeCount: 1,
    }),
    mk({
      id: "shrunken",
      downloads7d: 100,
      likes: 50,
      likes7dAgo: 200, // negative growth
      derivativeCount: 0,
      spacesUsingThis: 0,
    }),
  ];
  const scored = hfModelScorer.computeRaw(items);
  const byId = Object.fromEntries(scored.map((s) => [s.item.id, s.rawScore]));
  assert.ok(byId["viral"] > byId["active"]);
  assert.ok(byId["active"] > byId["stale"]);
  for (const v of Object.values(byId)) {
    assert.ok(v >= 0 && v <= 100);
  }
});
