// TrendingRepo Pipeline — HF Dataset domain scorer tests.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  hfDatasetScorer,
  type HfDatasetItem,
} from "../scoring/domain/hf-dataset";

function mk(overrides: Partial<HfDatasetItem> = {}): HfDatasetItem {
  return {
    domainKey: "hf-dataset",
    id: "test-dataset",
    joinKeys: {},
    downloads7d: 50000,
    likes: 100,
    likes7dAgo: 80,
    citationCount: 25,
    lastModified: new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString(),
    ...overrides,
  };
}

function weightSum(w: Record<string, number>): number {
  return Object.values(w).reduce((a, b) => a + b, 0);
}

test("hf-dataset happy path: score in range, weights sum to 1", () => {
  const [s] = hfDatasetScorer.computeRaw([mk()]);
  assert.ok(s.rawScore >= 0 && s.rawScore <= 100);
  assert.ok(Math.abs(weightSum(s.weights) - 1) < 1e-9);
  assert.equal(s.primaryMetric.name, "downloads_7d");
});

test("hf-dataset drops likesVelocity7d when likes missing", () => {
  const [s] = hfDatasetScorer.computeRaw([mk({ likes: undefined })]);
  assert.equal(s.weights.likesVelocity7d, undefined);
  assert.ok(Math.abs(weightSum(s.weights) - 1) < 1e-9);
});

test("hf-dataset citationCount=0 still produces a valid score", () => {
  const [s] = hfDatasetScorer.computeRaw([mk({ citationCount: 0 })]);
  assert.equal(s.rawComponents.citationCount, 0);
  assert.ok(s.rawScore >= 0 && s.rawScore <= 100);
});

test("hf-dataset ranking: high downloads + cited beats fresh-but-empty", () => {
  const items: HfDatasetItem[] = [
    mk({
      id: "popular",
      downloads7d: 1_000_000,
      likes: 500,
      likes7dAgo: 400,
      citationCount: 80,
    }),
    mk({
      id: "decent",
      downloads7d: 10_000,
      likes: 50,
      likes7dAgo: 45,
      citationCount: 5,
    }),
    mk({
      id: "tiny",
      downloads7d: 10,
      likes: 1,
      likes7dAgo: 1,
      citationCount: 0,
      lastModified: new Date(
        Date.now() - 200 * 24 * 3600 * 1000,
      ).toISOString(),
    }),
    mk({
      id: "freshly-uploaded",
      downloads7d: 50,
      likes: undefined,
      likes7dAgo: undefined,
      citationCount: 0,
    }),
    mk({
      id: "shrinking",
      downloads7d: 100,
      likes: 5,
      likes7dAgo: 50,
      citationCount: 0,
    }),
  ];
  const scored = hfDatasetScorer.computeRaw(items);
  const byId = Object.fromEntries(scored.map((s) => [s.item.id, s.rawScore]));
  assert.ok(byId["popular"] > byId["decent"]);
  assert.ok(byId["decent"] > byId["tiny"]);
  for (const v of Object.values(byId)) {
    assert.ok(v >= 0 && v <= 100);
  }
});
