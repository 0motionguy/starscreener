// StarScreener Pipeline — withRecomputeLock() tests.
//
// Phase 2 P-112 (F-RACE-001). The lock must:
//   1. Run the first caller's fn exactly once.
//   2. Coalesce concurrent callers onto the same inFlight promise — they
//      all receive the same return value; fn is NOT invoked again.
//   3. Release after settle so a later, non-concurrent caller runs fresh.
//   4. Release even if fn throws, so subsequent callers aren't wedged.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  withRecomputeLock,
  __resetRecomputeLockForTests,
} from "../locks";

test("first caller runs fn and returns its value", async () => {
  __resetRecomputeLockForTests();
  let calls = 0;
  const v = await withRecomputeLock(async () => {
    calls += 1;
    return 42;
  });
  assert.equal(v, 42);
  assert.equal(calls, 1);
});

test("concurrent callers coalesce onto one fn invocation", async () => {
  __resetRecomputeLockForTests();
  let calls = 0;
  const fn = async (): Promise<string> => {
    calls += 1;
    // Give the microtask queue a turn so other concurrent calls have a
    // chance to attach to the inFlight promise.
    await new Promise((r) => setTimeout(r, 10));
    return "ok";
  };

  const results = await Promise.all([
    withRecomputeLock(fn),
    withRecomputeLock(fn),
    withRecomputeLock(fn),
    withRecomputeLock(fn),
  ]);

  // Exactly one underlying invocation.
  assert.equal(calls, 1);
  // Every caller got the same return value.
  assert.deepEqual(results, ["ok", "ok", "ok", "ok"]);
});

test("sequential callers (non-concurrent) each trigger their own fn", async () => {
  __resetRecomputeLockForTests();
  let calls = 0;
  const fn = async (): Promise<number> => {
    calls += 1;
    return calls;
  };

  const a = await withRecomputeLock(fn);
  const b = await withRecomputeLock(fn);
  const c = await withRecomputeLock(fn);
  assert.deepEqual([a, b, c], [1, 2, 3]);
  assert.equal(calls, 3);
});

test("lock releases on throw; next caller runs fresh", async () => {
  __resetRecomputeLockForTests();
  let calls = 0;
  const bad = async (): Promise<never> => {
    calls += 1;
    throw new Error("boom");
  };
  await assert.rejects(withRecomputeLock(bad), /boom/);

  const good = async (): Promise<string> => {
    calls += 1;
    return "recovered";
  };
  const v = await withRecomputeLock(good);
  assert.equal(v, "recovered");
  assert.equal(calls, 2);
});

test("concurrent callers all see the same rejection when fn throws", async () => {
  __resetRecomputeLockForTests();
  let calls = 0;
  const bad = async (): Promise<never> => {
    calls += 1;
    await new Promise((r) => setTimeout(r, 10));
    throw new Error("concurrent boom");
  };
  const outcomes = await Promise.allSettled([
    withRecomputeLock(bad),
    withRecomputeLock(bad),
    withRecomputeLock(bad),
  ]);
  // fn ran once.
  assert.equal(calls, 1);
  // All three callers observe the rejection.
  for (const o of outcomes) {
    assert.equal(o.status, "rejected");
    if (o.status === "rejected") {
      assert.match(String(o.reason), /concurrent boom/);
    }
  }
});
