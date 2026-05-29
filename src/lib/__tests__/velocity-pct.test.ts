// Tests for src/lib/velocity-pct.ts — the shared period-start star-velocity %.
//
// The base must be the count at the START of the window (stars - delta), not the
// current total. This pins that contract + the null/edge cases the display
// surfaces depend on (flat delta, young/explosive base collapse, negatives).

import { test } from "node:test";
import assert from "node:assert/strict";

import { velocityPct, formatVelocityPct } from "../velocity-pct";

test("velocityPct measures growth against the period-start base (stars - delta)", () => {
  // 100 → 200 over the window: +100 stars on a base of 100 → +100%.
  assert.equal(velocityPct(100, 200), 100);
  // Big repo: 10,000 stars, +100 in window → base 9,900 → ~1.0101%.
  assert.ok(Math.abs(velocityPct(100, 10_000)! - (100 / 9_900) * 100) < 1e-9);
});

test("velocityPct returns null for a flat (zero) delta", () => {
  assert.equal(velocityPct(0, 1_000), null);
});

test("velocityPct returns null when the base collapses (young/explosive repo)", () => {
  // Gained ~all of its stars in the window → base < 1 → null (no "+93,700%").
  assert.equal(velocityPct(937, 937), null);
  assert.equal(velocityPct(50, 50), null);
});

test("velocityPct handles a negative delta against the (larger) base", () => {
  // 900 now, dropped 100 → base 1,000 → -10%.
  assert.equal(velocityPct(-100, 900), -10);
});

test("velocityPct guards non-finite inputs", () => {
  assert.equal(velocityPct(Number.NaN, 100), null);
  assert.equal(velocityPct(10, Number.NaN), null);
});

test("formatVelocityPct signs + 1-decimal, empty string when null", () => {
  assert.equal(formatVelocityPct(100, 200), "+100.0%");
  assert.equal(formatVelocityPct(-100, 900), "-10.0%");
  assert.equal(formatVelocityPct(0, 1_000), "");
  assert.equal(formatVelocityPct(937, 937), "");
});
