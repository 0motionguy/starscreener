// Regression tests for `DataStore.writtenAtMany` — the batch reader that
// fixes the /api/worker/health N+1 sidecar GET pattern (AGN-468 / audit-08
// A.5). These tests assert:
//
//   1. With ~30 slugs, the underlying Redis client sees ONE MGET per key
//      family (payload + meta = 2 round trips) instead of 30×2 = 60 GETs.
//   2. A failing MGET (Redis transport blip) degrades to per-key fallback
//      so /api/worker/health stays green-shaped instead of 500-ing.
//   3. A client without `mget` (legacy fakes / Upstash REST) silently uses
//      the per-key path and still returns correct timestamps.
//   4. Eviction-race guard: if payload key is missing but meta is set,
//      the slug is reported as null (matches single-key writtenAt()).
//   5. Per-key parsing is byte-identical to single-key writtenAt() for
//      bare-ISO and provenance-JSON meta shapes.
//
// File-fallback path is exercised by the existing data-store.test.ts.

import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

import {
  createDataStore,
  type RedisClientLike,
} from "../data-store";

// ---------------------------------------------------------------------------
// Fake Redis variants
// ---------------------------------------------------------------------------

interface CountingRedis extends RedisClientLike {
  store: Map<string, string>;
  getCalls: number;
  mgetCalls: number;
  mgetKeyLog: string[][];
  failMgetOnceWith: Error | null;
}

function makeMgetRedis(): CountingRedis {
  const store = new Map<string, string>();
  const r: CountingRedis = {
    store,
    getCalls: 0,
    mgetCalls: 0,
    mgetKeyLog: [],
    failMgetOnceWith: null,
    async get(key: string) {
      r.getCalls += 1;
      return store.has(key) ? store.get(key)! : null;
    },
    async set(key: string, value: string) {
      store.set(key, value);
      return "OK";
    },
    async del(...keys: string[]) {
      let n = 0;
      for (const k of keys) if (store.delete(k)) n += 1;
      return n;
    },
    async mget(...keys: string[]) {
      r.mgetCalls += 1;
      r.mgetKeyLog.push([...keys]);
      if (r.failMgetOnceWith) {
        const err = r.failMgetOnceWith;
        r.failMgetOnceWith = null;
        throw err;
      }
      return keys.map((k) => (store.has(k) ? store.get(k)! : null));
    },
  };
  return r;
}

// Legacy client without mget — exercises the per-key fallback path.
function makeLegacyRedis(): CountingRedis {
  const r = makeMgetRedis();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (r as any).mget;
  return r;
}

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "ss-data-store-batch-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function buildStore(redis: RedisClientLike) {
  return createDataStore({
    env: { REDIS_URL: "redis://test" },
    redisFactory: () => redis,
    dataDir: tmpDir,
    disableFileMirror: true,
    onFallback: () => {},
  });
}

// 30+ slugs roughly mirroring the SLUG_TABLE shape from
// src/app/api/worker/health/route.ts. Exact strings don't matter — what
// matters is N >= 30 to prove fan-out scales.
const FLEET_SLUGS = Array.from({ length: 33 }, (_, i) => `slug-${i.toString().padStart(2, "0")}`);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("writtenAtMany() collapses 33 slugs into a single MGET pair (no N+1)", async () => {
  const fake = makeMgetRedis();
  const store = buildStore(fake);
  // Pre-seed every slug with payload + meta so all 33 are valid hits.
  const ts = new Date("2026-05-04T10:00:00.000Z").toISOString();
  for (const slug of FLEET_SLUGS) {
    fake.store.set(`ss:data:v1:${slug}`, JSON.stringify({ ok: true }));
    fake.store.set(`ss:meta:v1:${slug}`, ts);
  }

  const map = await store.writtenAtMany(FLEET_SLUGS);

  // Behaviour: every slug returned with the seeded timestamp.
  assert.equal(map.size, FLEET_SLUGS.length);
  for (const slug of FLEET_SLUGS) {
    assert.equal(map.get(slug), ts, `slug ${slug} should report seeded ts`);
  }

  // Round-trip count: 2 MGETs total (payload family + meta family),
  // ZERO single-key GETs. Pre-fix this would have been 33 × 2 = 66 GETs.
  assert.equal(fake.mgetCalls, 2, "expected exactly 2 MGET round trips");
  assert.equal(fake.getCalls, 0, "expected zero single-key GETs");

  // Each MGET must contain exactly the 33 namespaced keys, in slug order.
  assert.deepEqual(
    fake.mgetKeyLog[0],
    FLEET_SLUGS.map((s) => `ss:data:v1:${s}`),
  );
  assert.deepEqual(
    fake.mgetKeyLog[1],
    FLEET_SLUGS.map((s) => `ss:meta:v1:${s}`),
  );
});

test("writtenAtMany() degrades per-slug when MGET throws (one bad slug doesn't fail the response)", async () => {
  const fake = makeMgetRedis();
  const store = buildStore(fake);
  const ts = new Date().toISOString();
  for (const slug of FLEET_SLUGS) {
    fake.store.set(`ss:data:v1:${slug}`, JSON.stringify({ ok: true }));
    fake.store.set(`ss:meta:v1:${slug}`, ts);
  }
  // Simulate transport blip on the first MGET — implementation should
  // catch and fall back to per-key writtenAt() for every slug.
  fake.failMgetOnceWith = new Error("ETIMEDOUT");

  const map = await store.writtenAtMany(FLEET_SLUGS);

  assert.equal(map.size, FLEET_SLUGS.length, "every slug should still be in the map");
  // Per-key fallback issues 2 GETs per slug (payload + meta inside the
  // single-key writtenAt path). What matters: the response shape survived.
  for (const slug of FLEET_SLUGS) {
    assert.equal(map.get(slug), ts, `slug ${slug} should still resolve via fallback`);
  }
  assert.ok(fake.getCalls > 0, "fallback path should issue per-key GETs");
});

test("writtenAtMany() works without mget capability (legacy client)", async () => {
  const fake = makeLegacyRedis();
  const store = buildStore(fake);
  const ts = new Date().toISOString();
  fake.store.set("ss:data:v1:a", JSON.stringify({ ok: true }));
  fake.store.set("ss:meta:v1:a", ts);
  fake.store.set("ss:data:v1:b", JSON.stringify({ ok: true }));
  fake.store.set("ss:meta:v1:b", ts);

  const map = await store.writtenAtMany(["a", "b", "missing"]);

  assert.equal(map.get("a"), ts);
  assert.equal(map.get("b"), ts);
  assert.equal(map.get("missing"), null);
  assert.equal(fake.mgetCalls, 0, "should not have called mget on legacy client");
  assert.ok(fake.getCalls >= 4, "should fall back to per-key GETs");
});

test("writtenAtMany() returns null when payload missing even if meta present (eviction-race guard)", async () => {
  const fake = makeMgetRedis();
  const store = buildStore(fake);
  // Meta is set but payload was evicted — same race as single-key writtenAt.
  fake.store.set("ss:meta:v1:orphan", new Date().toISOString());

  const map = await store.writtenAtMany(["orphan"]);

  assert.equal(map.get("orphan"), null);
});

test("writtenAtMany() parses both bare-ISO and provenance-JSON meta shapes", async () => {
  const fake = makeMgetRedis();
  const store = buildStore(fake);
  const isoTs = "2026-05-04T11:11:11.000Z";
  const jsonTs = "2026-05-04T22:22:22.000Z";

  fake.store.set("ss:data:v1:iso", JSON.stringify({ x: 1 }));
  fake.store.set("ss:meta:v1:iso", isoTs);

  fake.store.set("ss:data:v1:json", JSON.stringify({ x: 2 }));
  fake.store.set(
    "ss:meta:v1:json",
    JSON.stringify({ writtenAt: jsonTs, writer: "worker", runId: "r-1" }),
  );

  const map = await store.writtenAtMany(["iso", "json"]);

  assert.equal(map.get("iso"), isoTs);
  assert.equal(map.get("json"), jsonTs);
});

test("writtenAtMany([]) short-circuits without touching Redis", async () => {
  const fake = makeMgetRedis();
  const store = buildStore(fake);

  const map = await store.writtenAtMany([]);

  assert.equal(map.size, 0);
  assert.equal(fake.mgetCalls, 0);
  assert.equal(fake.getCalls, 0);
});
