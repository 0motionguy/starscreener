// TrendingRepo Pipeline — HF Space domain scorer tests.

import { test } from "node:test";
import assert from "node:assert/strict";

import { hfSpaceScorer, type HfSpaceItem } from "../scoring/domain/hf-space";

function mk(overrides: Partial<HfSpaceItem> = {}): HfSpaceItem {
  return {
    domainKey: "hf-space",
    id: "test-space",
    joinKeys: {},
    apiCalls7d: 50000,
    likes: 80,
    likes7dAgo: 60,
    modelCount: 3,
    modelsUsed: ["a", "b", "c"],
    avgModelMomentum: 70,
    lastModified: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString(),
    ...overrides,
  };
}

function weightSum(w: Record<string, number>): number {
  return Object.values(w).reduce((a, b) => a + b, 0);
}

test("hf-space happy path", () => {
  const [s] = hfSpaceScorer.computeRaw([mk()]);
  assert.ok(s.rawScore >= 0 && s.rawScore <= 100);
  assert.ok(Math.abs(weightSum(s.weights) - 1) < 1e-9);
  assert.equal(s.primaryMetric.name, "api_calls_7d");
});

test("hf-space drops likesVelocity7d when both likes missing", () => {
  const [s] = hfSpaceScorer.computeRaw([
    mk({ likes: undefined, likes7dAgo: undefined }),
  ]);
  assert.equal(s.weights.likesVelocity7d, undefined);
  assert.ok(Math.abs(weightSum(s.weights) - 1) < 1e-9);
});

test("hf-space modelCount saturates at 5+ models", () => {
  const [s] = hfSpaceScorer.computeRaw([mk({ modelCount: 12 })]);
  assert.equal(s.rawComponents.modelCount, 100);
});

test("hf-space avgModelMomentum is clamped to 0..100", () => {
  const [a] = hfSpaceScorer.computeRaw([mk({ avgModelMomentum: -10 })]);
  const [b] = hfSpaceScorer.computeRaw([mk({ avgModelMomentum: 250 })]);
  assert.equal(a.rawComponents.avgModelMomentum, 0);
  assert.equal(b.rawComponents.avgModelMomentum, 100);
});

test("hf-space ranking: viral demo beats abandoned space", () => {
  const items: HfSpaceItem[] = [
    mk({
      id: "viral",
      apiCalls7d: 500_000,
      likes: 2000,
      likes7dAgo: 1500,
      modelCount: 8,
      avgModelMomentum: 90,
    }),
    mk({
      id: "decent",
      apiCalls7d: 5000,
      likes: 50,
      likes7dAgo: 45,
      modelCount: 2,
      avgModelMomentum: 50,
    }),
    mk({
      id: "stale",
      apiCalls7d: 10,
      likes: 0,
      likes7dAgo: 0,
      modelCount: 0,
      avgModelMomentum: 0,
      lastModified: new Date(
        Date.now() - 200 * 24 * 3600 * 1000,
      ).toISOString(),
    }),
    mk({
      id: "no-likes",
      apiCalls7d: 1000,
      likes: undefined,
      likes7dAgo: undefined,
      modelCount: 1,
      avgModelMomentum: 30,
    }),
    mk({
      id: "fresh-zero-traffic",
      apiCalls7d: 5,
      likes: 2,
      likes7dAgo: 1,
      modelCount: 1,
      avgModelMomentum: 20,
    }),
  ];
  const scored = hfSpaceScorer.computeRaw(items);
  const byId = Object.fromEntries(scored.map((s) => [s.item.id, s.rawScore]));
  assert.ok(byId["viral"] > byId["decent"]);
  assert.ok(byId["decent"] > byId["stale"]);
  for (const v of Object.values(byId)) {
    assert.ok(v >= 0 && v <= 100);
  }
});
