// AGN-671 — single-flight read coalescing in DefaultDataStore.
//
// The data-store sits behind every reader module. Cold reader fan-out (a
// single SSR request that wakes 5+ readers, all of which call
// `store.read("trending")` near-simultaneously after a memory-tier miss)
// previously issued one Redis GET pair per caller. That stampede is what
// this test pins down: 100 concurrent reads of the same stale key MUST
// collapse to ONE upstream Redis call.

import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { createDataStore, type UpstashClientLike } from "../data-store";

// ---------------------------------------------------------------------------
// Slow fake Redis: counts get/set calls and lets us stall the first GET
// long enough to ensure all 100 callers queue up behind the same in-flight
// promise.
// ---------------------------------------------------------------------------

class SlowFakeRedis implements UpstashClientLike {
  public store = new Map<string, string>();
  public getCalls = 0;
  public getDelayMs = 50;

  async get(key: string): Promise<unknown> {
    this.getCalls += 1;
    if (this.getDelayMs > 0) {
      await new Promise((r) => setTimeout(r, this.getDelayMs));
    }
    return this.store.has(key) ? this.store.get(key) : null;
  }

  async set(key: string, value: string): Promise<unknown> {
    this.store.set(key, value);
    return "OK";
  }

  async del(...keys: string[]): Promise<number> {
    let n = 0;
    for (const k of keys) if (this.store.delete(k)) n += 1;
    return n;
  }
}

let tmpDir: string;
let fake: SlowFakeRedis;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "ss-singleflight-"));
  fake = new SlowFakeRedis();
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function buildStore() {
  return createDataStore({
    env: {
      UPSTASH_REDIS_REST_URL: "https://fake",
      UPSTASH_REDIS_REST_TOKEN: "fake-token",
    },
    upstashFactory: () => fake,
    dataDir: tmpDir,
    onFallback: () => {},
  });
}

test("100 concurrent reads of the same key issue exactly 1 upstream pair", async () => {
  const store = buildStore();
  // Seed Redis so the read path actually exercises the GET — empty Redis
  // would short-circuit through file/memory tiers and miss the point.
  await store.write("trending", { rank: [1, 2, 3] });
  // `write` itself does no GETs in the current implementation, but reset
  // the counter to make the assertion unambiguous.
  fake.getCalls = 0;

  const results = await Promise.all(
    Array.from({ length: 100 }, () =>
      store.read<{ rank: number[] }>("trending"),
    ),
  );

  // read() issues TWO concurrent GETs (payload + meta) per uncoalesced
  // call. With single-flight, exactly one caller does that work, so we
  // expect exactly 2 GETs total — not 200.
  assert.equal(
    fake.getCalls,
    2,
    `expected exactly 2 GETs (payload+meta) for the single-flight read; got ${fake.getCalls}`,
  );

  // Every caller must observe the same payload.
  for (const r of results) {
    assert.equal(r.source, "redis");
    assert.deepEqual(r.data, { rank: [1, 2, 3] });
  }
});

test("sequential reads still issue fresh GETs (no cross-call caching)", async () => {
  const store = buildStore();
  await store.write("seq", { v: 1 });
  fake.getCalls = 0;

  await store.read("seq");
  await store.read("seq");
  await store.read("seq");

  // Three sequential calls -> three independent (payload+meta) probes.
  // Single-flight only spans CONCURRENT calls; it must not leak across
  // settled promises (would defeat the freshness contract).
  assert.equal(
    fake.getCalls,
    6,
    `expected 6 GETs (3 sequential reads × 2 keys each); got ${fake.getCalls}`,
  );
});

test("concurrent reads of DIFFERENT keys do not coalesce", async () => {
  const store = buildStore();
  await store.write("k1", { v: 1 });
  await store.write("k2", { v: 2 });
  fake.getCalls = 0;

  await Promise.all([store.read("k1"), store.read("k2"), store.read("k1")]);

  // k1 coalesces (1 read worth = 2 GETs), k2 stands alone (2 GETs) -> 4.
  assert.equal(
    fake.getCalls,
    4,
    `expected 4 GETs (k1 coalesced + k2 standalone); got ${fake.getCalls}`,
  );
});

test("in-flight map clears after settle so retries hit upstream", async () => {
  const store = buildStore();
  await store.write("retry", { v: 1 });
  fake.getCalls = 0;

  // First wave coalesces.
  await Promise.all([store.read("retry"), store.read("retry")]);
  const afterFirst = fake.getCalls;
  assert.equal(afterFirst, 2, "first wave should be 1 coalesced read = 2 GETs");

  // Second wave (after the first settled) must also coalesce on its own,
  // not piggyback on the previous (already-resolved) promise.
  await Promise.all([store.read("retry"), store.read("retry")]);
  assert.equal(
    fake.getCalls,
    4,
    `second wave should add 2 more GETs (1 coalesced read); got ${fake.getCalls - afterFirst}`,
  );
});

test("concurrent callers each get an independent result envelope", async () => {
  const store = buildStore();
  await store.write("iso", { v: 1 });
  fake.getCalls = 0;

  const [a, b] = await Promise.all([store.read("iso"), store.read("iso")]);
  // Same Redis call serviced both, but each caller's envelope is its own
  // object so a downstream mutation can't bleed across callers.
  assert.notEqual(a, b, "expected each caller to get its own result envelope");
  assert.deepEqual(a.data, b.data, "payload references should match");
  assert.equal(a.source, b.source);
});
