// StarScreener — Portal rate-limit (token bucket) tests.

import { beforeEach, test } from "node:test";
import { strict as assert } from "node:assert";

import {
  _overrideConfigForTests,
  _resetBucketsForTests,
  consumeToken,
} from "../rate-limit";

beforeEach(() => {
  _resetBucketsForTests();
  // Restore defaults between tests in case a test tuned them.
  _overrideConfigForTests("unauth", {
    capacity: 10,
    refillPerWindowMs: 10,
    windowMs: 60_000,
  });
  _overrideConfigForTests("auth", {
    capacity: 1000,
    refillPerWindowMs: 1000,
    windowMs: 60_000,
  });
});

test("unauth bucket allows 10 calls then blocks", () => {
  const now = Date.now();
  for (let i = 0; i < 10; i++) {
    const r = consumeToken("ip:1.2.3.4", false, now);
    assert.equal(r.ok, true, `call ${i + 1} should pass`);
  }
  const blocked = consumeToken("ip:1.2.3.4", false, now);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.remaining, 0);
  assert.ok(blocked.reset_at_ms > now);
});

test("auth bucket allows 1000 calls where unauth would block", () => {
  const now = Date.now();
  for (let i = 0; i < 15; i++) {
    const r = consumeToken("k:secret", true, now);
    assert.equal(r.ok, true);
  }
});

test("bucket refills over time", () => {
  // Tight window to keep the test fast.
  _overrideConfigForTests("unauth", {
    capacity: 2,
    refillPerWindowMs: 2,
    windowMs: 1_000,
  });
  _resetBucketsForTests();

  const t0 = 1_000_000;
  assert.equal(consumeToken("ip:x", false, t0).ok, true);
  assert.equal(consumeToken("ip:x", false, t0).ok, true);
  assert.equal(consumeToken("ip:x", false, t0).ok, false);

  // After one window (1000 ms) capacity worth of tokens refills.
  const t1 = t0 + 1_000;
  assert.equal(consumeToken("ip:x", false, t1).ok, true);
});

test("different keys have independent buckets", () => {
  const now = Date.now();
  for (let i = 0; i < 10; i++) consumeToken("ip:a", false, now);
  assert.equal(consumeToken("ip:a", false, now).ok, false);
  assert.equal(consumeToken("ip:b", false, now).ok, true);
});
