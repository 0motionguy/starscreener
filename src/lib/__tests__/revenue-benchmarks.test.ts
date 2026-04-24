// Tests for the bucketed-revenue estimator fallback ladder. The relaxation
// order is load-bearing — if we drop "exact" to "category_only" without
// trying "ignored_ph" and "ignored_stars" first, we silently lose precision
// for founders who know their category and band but aren't on ProductHunt.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  estimateMrrFromBuckets,
  type RevenueBenchmarkBucket,
} from "../revenue-benchmarks";

function bucket(
  partial: Partial<RevenueBenchmarkBucket> & {
    category: string;
    starBand: string;
  },
): RevenueBenchmarkBucket {
  return {
    category: partial.category,
    starBand: partial.starBand,
    phLaunched: partial.phLaunched ?? false,
    n: partial.n ?? 10,
    p25: partial.p25 ?? 1_000,
    p50: partial.p50 ?? 5_000,
    p75: partial.p75 ?? 25_000,
  };
}

test("empty buckets → fallback=none", () => {
  const result = estimateMrrFromBuckets([], {
    category: "AI",
    starBand: "500-2K",
    phLaunched: true,
  });
  assert.equal(result.fallback, "none");
  assert.equal(result.range, null);
});

test("exact match wins over broader buckets", () => {
  const result = estimateMrrFromBuckets(
    [
      bucket({ category: "AI", starBand: "500-2K", phLaunched: true, n: 10 }),
      bucket({ category: "AI", starBand: "500-2K", phLaunched: false, n: 100 }),
    ],
    { category: "AI", starBand: "500-2K", phLaunched: true },
  );
  assert.equal(result.fallback, "exact");
  assert.equal(result.bucket?.n, 10);
});

test("fallback to ignored_ph when no ph match", () => {
  const result = estimateMrrFromBuckets(
    [
      bucket({ category: "AI", starBand: "500-2K", phLaunched: false, n: 50 }),
    ],
    { category: "AI", starBand: "500-2K", phLaunched: true },
  );
  assert.equal(result.fallback, "ignored_ph");
  assert.ok(result.range);
});

test("fallback to ignored_stars when star band is missing", () => {
  const result = estimateMrrFromBuckets(
    [
      bucket({ category: "AI", starBand: "50K+", phLaunched: true, n: 20 }),
      bucket({ category: "AI", starBand: "10K-50K", phLaunched: true, n: 20 }),
    ],
    { category: "AI", starBand: "500-2K", phLaunched: true },
  );
  assert.equal(result.fallback, "ignored_stars");
  assert.ok(result.range);
});

test("fallback to category_only when both ph and stars have to be relaxed", () => {
  const result = estimateMrrFromBuckets(
    [
      bucket({ category: "AI", starBand: "50K+", phLaunched: false, n: 20 }),
    ],
    { category: "AI", starBand: "500-2K", phLaunched: true },
  );
  assert.equal(result.fallback, "category_only");
  assert.ok(result.range);
});

test("fallback=none when no bucket matches the category", () => {
  const result = estimateMrrFromBuckets(
    [
      bucket({ category: "Analytics", starBand: "500-2K", phLaunched: true }),
    ],
    { category: "AI", starBand: "500-2K", phLaunched: true },
  );
  assert.equal(result.fallback, "none");
  assert.equal(result.range, null);
});

test("weighted aggregation when category-only relaxation pulls multiple buckets", () => {
  // No bucket matches the exact star band. Relaxing ph first keeps zero
  // matches too (every remaining bucket has ph=false vs requested ph=true
  // but that's still zero because star is wrong). So we land on
  // ignored_stars, which drops the star constraint — both buckets match
  // and we weight-average by n.
  const result = estimateMrrFromBuckets(
    [
      bucket({
        category: "AI",
        starBand: "10K-50K",
        phLaunched: true,
        n: 10,
        p50: 1_000,
      }),
      bucket({
        category: "AI",
        starBand: "50K+",
        phLaunched: true,
        n: 90,
        p50: 10_000,
      }),
    ],
    { category: "AI", starBand: "500-2K", phLaunched: true },
  );
  assert.equal(result.fallback, "ignored_stars");
  // n=100, weighted p50 = (10*1000 + 90*10000) / 100 = 9100.
  assert.equal(result.bucket?.p50, 9_100);
});
