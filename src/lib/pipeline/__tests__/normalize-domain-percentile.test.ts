// StarScreener Pipeline — domainPercentileRank tests.
//
// Locks the cross-domain normalization contract from the trending-engine
// rebuild plan (§2): per-domain raw 0..100 scores collapse to a comparable
// 0..100 momentum array, with bootstrap-blend behavior for small corpora.

import { test } from "node:test";
import assert from "node:assert/strict";

import { domainPercentileRank } from "../scoring/normalize";

// ---------------------------------------------------------------------------
// Pure percentile mode (N >= bootstrapN)
// ---------------------------------------------------------------------------

test("domainPercentileRank: N >= bootstrapN produces pure percentile output", () => {
  const input = Array.from({ length: 250 }, (_, i) => i * 0.4);
  const out = domainPercentileRank(input);

  assert.equal(out.length, 250);

  // Strictly monotonic ascending (all inputs unique and increasing).
  for (let i = 1; i < out.length; i += 1) {
    assert.ok(
      out[i] > out[i - 1],
      `expected out[${i}]=${out[i]} > out[${i - 1}]=${out[i - 1]}`,
    );
  }

  // Bottom: nothing strictly less than 0 -> 0.
  assert.equal(out[0], 0);

  // Top: 249 of 250 strictly less than the max -> 99.6.
  assert.ok(Math.abs(out[out.length - 1] - 99.6) < 1e-9);

  // Middle: ~50.
  assert.ok(Math.abs(out[125] - 50) < 1);
});

// ---------------------------------------------------------------------------
// Bootstrap blend mode (N < bootstrapN)
// ---------------------------------------------------------------------------

test("domainPercentileRank: small corpus blends toward absolute value", () => {
  const out = domainPercentileRank([10, 50, 90]);
  // blend = 3/200 = 0.015, inv = 0.985.
  // For value 90: pct = 2/3 * 100 = 66.6667, abs = 90.
  // expected = 66.6667 * 0.015 + 90 * 0.985 = 1.0 + 88.65 = 89.65.
  assert.ok(Math.abs(out[2] - 89.65) < 0.01);

  // For value 10: pct = 0, abs = 10. expected = 10 * 0.985 = 9.85.
  assert.ok(Math.abs(out[0] - 9.85) < 0.01);

  // For value 50: pct = 1/3 * 100 = 33.3333, abs = 50.
  // expected = 33.3333 * 0.015 + 50 * 0.985 = 0.5 + 49.25 = 49.75.
  assert.ok(Math.abs(out[1] - 49.75) < 0.01);

  // Sanity: top item near 90 (its abs), NOT near 100 (pure-pct top).
  assert.ok(out[2] < 95);
  assert.ok(out[2] > 85);
});

// ---------------------------------------------------------------------------
// Crossover at exactly bootstrapN
// ---------------------------------------------------------------------------

test("domainPercentileRank: at N == bootstrapN switches to pure percentile", () => {
  const input = Array.from({ length: 200 }, (_, i) => i * 0.5);
  const out = domainPercentileRank(input);

  assert.equal(out.length, 200);
  // Pure pct: top has 199 strictly below -> 99.5.
  assert.ok(Math.abs(out[out.length - 1] - 99.5) < 1e-9);
  // Bottom: 0.
  assert.equal(out[0], 0);
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

test("domainPercentileRank: empty input returns []", () => {
  assert.deepEqual(domainPercentileRank([]), []);
});

test("domainPercentileRank: single item returns clamped abs", () => {
  assert.deepEqual(domainPercentileRank([42]), [42]);
  assert.deepEqual(domainPercentileRank([-5]), [0]);
  assert.deepEqual(domainPercentileRank([250]), [100]);
});

test("domainPercentileRank: all-identical inputs give same value to all", () => {
  const out = domainPercentileRank([55, 55, 55, 55]);
  assert.equal(out.length, 4);
  // All identical -> percentile 0 for everyone (no value strictly less).
  // blend = 4/200 = 0.02, inv = 0.98. expected = 0*0.02 + 55*0.98 = 53.9.
  for (const v of out) {
    assert.ok(Math.abs(v - 53.9) < 0.01, `expected ~53.9, got ${v}`);
  }
});

test("domainPercentileRank: NaN/Infinity treated as 0", () => {
  const out = domainPercentileRank([NaN, Infinity, -Infinity, 50]);
  assert.equal(out.length, 4);
  // After sanitization: [0, 0, 0, 50].
  // For 50: pct = 3/4 * 100 = 75, abs = 50. blend = 4/200 = 0.02.
  // expected = 75 * 0.02 + 50 * 0.98 = 1.5 + 49 = 50.5.
  assert.ok(Math.abs(out[3] - 50.5) < 0.01);
  // The three sanitized-to-0 entries: pct = 0, abs = 0 -> 0.
  assert.equal(out[0], 0);
  assert.equal(out[1], 0);
  assert.equal(out[2], 0);
});

test("domainPercentileRank: custom bootstrapN switches mode", () => {
  const input = Array.from({ length: 50 }, (_, i) => i);
  const out = domainPercentileRank(input, { bootstrapN: 10 });

  // 50 >= 10 -> pure percentile.
  assert.equal(out[0], 0);
  // Top: 49/50 * 100 = 98.
  assert.ok(Math.abs(out[out.length - 1] - 98) < 1e-9);
  // Strictly monotonic.
  for (let i = 1; i < out.length; i += 1) {
    assert.ok(out[i] > out[i - 1]);
  }
});
