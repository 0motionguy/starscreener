import assert from "node:assert/strict";
import { test } from "node:test";

import { evaluateSourceFreshness } from "../../source-health";

const NOW = Date.parse("2026-04-22T12:00:00.000Z");

test("evaluateSourceFreshness: marks missed cadence as degraded before stale", () => {
  const result = evaluateSourceFreshness({
    fetchedAt: "2026-04-22T03:30:00.000Z",
    cold: false,
    degradedAfterMs: 8 * 60 * 60 * 1000,
    staleAfterMs: 16 * 60 * 60 * 1000,
    nowMs: NOW,
  });

  assert.equal(result.stale, false);
  assert.equal(result.degraded, true);
  assert.equal(result.ageSeconds, 30_600);
});

test("evaluateSourceFreshness: stale outranks degraded", () => {
  const result = evaluateSourceFreshness({
    fetchedAt: "2026-04-21T18:00:00.000Z",
    cold: false,
    degradedAfterMs: 8 * 60 * 60 * 1000,
    staleAfterMs: 16 * 60 * 60 * 1000,
    nowMs: NOW,
  });

  assert.equal(result.stale, true);
  assert.equal(result.degraded, false);
});

test("evaluateSourceFreshness: cold sources do not produce stale/degraded ages", () => {
  const result = evaluateSourceFreshness({
    fetchedAt: null,
    cold: true,
    degradedAfterMs: 8 * 60 * 60 * 1000,
    staleAfterMs: 16 * 60 * 60 * 1000,
    nowMs: NOW,
  });

  assert.equal(result.stale, false);
  assert.equal(result.degraded, false);
  assert.equal(result.ageSeconds, null);
});

test("evaluateSourceFreshness: future timestamps beyond clock skew are degraded", () => {
  const result = evaluateSourceFreshness({
    fetchedAt: "2026-04-22T12:10:01.000Z",
    cold: false,
    degradedAfterMs: 8 * 60 * 60 * 1000,
    staleAfterMs: 16 * 60 * 60 * 1000,
    nowMs: NOW,
  });

  assert.equal(result.futureSkew, true);
  assert.equal(result.stale, false);
  assert.equal(result.degraded, true);
  assert.equal(result.ageSeconds, 0);
});
