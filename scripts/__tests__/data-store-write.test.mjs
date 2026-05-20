// SCR-11: smoke tests for scripts/_data-store-write.mjs.
//
// The writer is wired into every collector via dual-write — file landing
// stays on disk, payload also lands in Redis when env is set. This test
// covers the no-env "graceful skip" path that lets local dev + CI keep
// working without Redis credentials, plus the explicit-disable escape
// hatch. The Redis-write path itself is exercised end-to-end by
// `npm run verify:data-store` against a live store.

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  writeDataStore,
  readDataStoreMany,
  writeDataStoreMany,
  verifyMetaLanded,
  _resetForTests,
  closeDataStore,
} from "../_data-store-write.mjs";

function withClearedEnv(fn) {
  const prior = {
    REDIS_URL: process.env.REDIS_URL,
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
    DATA_STORE_DISABLE: process.env.DATA_STORE_DISABLE,
  };
  delete process.env.REDIS_URL;
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  delete process.env.DATA_STORE_DISABLE;
  return Promise.resolve(fn()).finally(() => {
    for (const [k, v] of Object.entries(prior)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });
}

test("writeDataStore: skips cleanly when no Redis env is set", async () => {
  await withClearedEnv(async () => {
    _resetForTests();
    const result = await writeDataStore("scr11-test-slug", { sample: 1 });
    assert.equal(result.source, "skipped");
    assert.match(
      result.writtenAt,
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
      "writtenAt should be ISO-formatted",
    );
  });
});

test("writeDataStore: respects DATA_STORE_DISABLE escape hatch", async () => {
  await withClearedEnv(async () => {
    _resetForTests();
    process.env.DATA_STORE_DISABLE = "1";
    const result = await writeDataStore("scr11-disabled", { x: "y" });
    assert.equal(result.source, "skipped");
    assert.ok(result.writtenAt);
  });
});

test("writeDataStore: DATA_STORE_DISABLE accepts 'true' as well", async () => {
  await withClearedEnv(async () => {
    _resetForTests();
    process.env.DATA_STORE_DISABLE = "true";
    const result = await writeDataStore("scr11-disabled-true", []);
    assert.equal(result.source, "skipped");
  });
});

test("writeDataStore: returns a fresh writtenAt on each call", async () => {
  await withClearedEnv(async () => {
    _resetForTests();
    const a = await writeDataStore("scr11-ts-a", { i: 1 });
    // Sleep one ms so ISO seconds-fraction differs even on fast clocks.
    await new Promise((r) => setTimeout(r, 2));
    const b = await writeDataStore("scr11-ts-b", { i: 2 });
    assert.notEqual(a.writtenAt, b.writtenAt);
  });
});

test("writeDataStore: handles non-trivial payload shapes without throwing", async () => {
  await withClearedEnv(async () => {
    _resetForTests();
    // Mirror the actual collector payload shape (nested objects + arrays of
    // refs). The writer JSON-serializes this verbatim — the test confirms
    // there's no hidden circular-ref guard or shape filtering.
    const payload = {
      fetchedAt: new Date().toISOString(),
      items: [
        { id: "a", refs: [1, 2, 3] },
        { id: "b", meta: { language: "TypeScript", stars: 1234 } },
      ],
      stats: { total: 2, latest: { id: "b" } },
    };
    const result = await writeDataStore("scr11-payload", payload);
    assert.equal(result.source, "skipped");
  });
});

test("writeDataStore: stamps lastRefreshedAt on tracked-repo records", async () => {
  await withClearedEnv(async () => {
    _resetForTests();
    // Mixed payload — tracked repos (owner/name + id+stars) interleaved with
    // posts (no fullName, no stars) that should NOT be stamped.
    const payload = {
      fetchedAt: new Date().toISOString(),
      profiles: [
        { fullName: "vercel/next.js", rank: 1 },
        { repo_name: "facebook/react", stars: "200000" },
      ],
      // Stripe-shaped post — fewer "tracked repo" markers, leave alone.
      posts: [
        { id: 1, title: "Show HN: foo", url: "https://example.com" },
      ],
      meta: { count: 3 },
    };
    await writeDataStore("scr11-stamp-test", payload);
    assert.ok(
      typeof payload.profiles[0].lastRefreshedAt === "string",
      "profiles[0] should be stamped",
    );
    assert.ok(
      typeof payload.profiles[1].lastRefreshedAt === "string",
      "profiles[1] should be stamped",
    );
    assert.equal(
      payload.posts[0].lastRefreshedAt,
      undefined,
      "posts (no fullName/stars) should NOT be stamped",
    );
  });
});

test("writeDataStore: stampPerRecord:false opt-out preserves payload", async () => {
  await withClearedEnv(async () => {
    _resetForTests();
    const payload = { profiles: [{ fullName: "owner/repo" }] };
    await writeDataStore("scr11-stamp-opt-out", payload, {
      stampPerRecord: false,
    });
    assert.equal(
      payload.profiles[0].lastRefreshedAt,
      undefined,
      "stampPerRecord:false should leave payload unmodified",
    );
  });
});

test("writeDataStore: rejects invalid keys (blank/null/undefined literals)", async () => {
  await withClearedEnv(async () => {
    _resetForTests();
    await assert.rejects(
      () => writeDataStore("   ", { x: 1 }),
      /invalid key/i,
    );
    await assert.rejects(
      () => writeDataStore("null", { x: 1 }),
      /invalid key/i,
    );
    await assert.rejects(
      () => writeDataStore("undefined", { x: 1 }),
      /invalid key/i,
    );
  });
});

// ---------------------------------------------------------------------------
// B.15 Arc 2 — batched helper tests
// ---------------------------------------------------------------------------
//
// `readDataStoreMany` + `writeDataStoreMany` are the Upstash-quota fix shipped
// 2026-05-15 (incident-driven). These tests cover the no-Redis-env path
// (returns aligned nulls / skipped result) — the same graceful-skip
// discipline the single-write tests above exercise. End-to-end pipeline
// behavior is verified via the integration smoke against live Redis.

test("readDataStoreMany: returns aligned nulls when Redis disabled", async () => {
  await withClearedEnv(async () => {
    _resetForTests();
    process.env.DATA_STORE_DISABLE = "1";
    try {
      const result = await readDataStoreMany(["a", "b", "c"]);
      assert.deepEqual(result, [null, null, null]);
    } finally {
      delete process.env.DATA_STORE_DISABLE;
    }
  });
});

test("readDataStoreMany: empty input returns empty array", async () => {
  await withClearedEnv(async () => {
    _resetForTests();
    const result = await readDataStoreMany([]);
    assert.deepEqual(result, []);
  });
});

test("readDataStoreMany: handles non-array input gracefully", async () => {
  await withClearedEnv(async () => {
    _resetForTests();
    // @ts-expect-error — intentionally passing invalid type
    const result = await readDataStoreMany(null);
    assert.deepEqual(result, []);
  });
});

test("readDataStoreMany: maps invalid slugs to null without crashing", async () => {
  await withClearedEnv(async () => {
    _resetForTests();
    process.env.DATA_STORE_DISABLE = "1";
    try {
      const result = await readDataStoreMany(["valid", "", "null", "undefined", "also-valid"]);
      // No Redis configured, so all entries collapse to null. The point of
      // this test is that the invalid keys don't throw — they just yield
      // null in their aligned slot.
      assert.equal(result.length, 5);
      for (const cell of result) assert.equal(cell, null);
    } finally {
      delete process.env.DATA_STORE_DISABLE;
    }
  });
});

test("writeDataStoreMany: empty input returns skipped result", async () => {
  await withClearedEnv(async () => {
    _resetForTests();
    const result = await writeDataStoreMany([]);
    assert.equal(result.source, "skipped");
    assert.deepEqual(result.results, []);
    assert.match(result.writtenAt, /^\d{4}-\d{2}-\d{2}T/);
  });
});

test("writeDataStoreMany: returns skipped when Redis disabled, with per-entry markers", async () => {
  await withClearedEnv(async () => {
    _resetForTests();
    process.env.DATA_STORE_DISABLE = "1";
    try {
      const result = await writeDataStoreMany([
        { key: "alpha", value: { n: 1 } },
        { key: "beta", value: { n: 2 } },
        { key: "gamma", value: { n: 3 } },
      ]);
      assert.equal(result.source, "skipped");
      assert.equal(result.results.length, 3);
      for (const r of result.results) {
        assert.equal(r.ok, false);
        assert.match(r.error, /disabled/i);
      }
    } finally {
      delete process.env.DATA_STORE_DISABLE;
    }
  });
});

test("writeDataStoreMany: non-array input collapses to skipped/empty", async () => {
  await withClearedEnv(async () => {
    _resetForTests();
    // @ts-expect-error — intentionally passing invalid type
    const result = await writeDataStoreMany(undefined);
    assert.equal(result.source, "skipped");
    assert.deepEqual(result.results, []);
  });
});

// ---------------------------------------------------------------------------
// M-15 — verifyMetaLanded (silent-write guard)
// ---------------------------------------------------------------------------
//
// The "happy path" (meta exists + writtenAt matches) is exercised end-to-end
// against live Redis via `npm run verify:data-store`. Unit coverage here is
// scoped to the no-Redis-env skip path and the argument-validation rails.

test("verifyMetaLanded: no-op when Redis disabled (env-missing)", async () => {
  await withClearedEnv(async () => {
    _resetForTests();
    // No throw expected — verifyMetaLanded matches writeDataStore's
    // "skipped" contract so the script keeps working in local dev without
    // Redis creds.
    await verifyMetaLanded("scr11-noop-noenv", new Date().toISOString());
  });
});

test("verifyMetaLanded: no-op when DATA_STORE_DISABLE=1", async () => {
  await withClearedEnv(async () => {
    _resetForTests();
    process.env.DATA_STORE_DISABLE = "1";
    try {
      await verifyMetaLanded("scr11-noop-disabled", new Date().toISOString());
    } finally {
      delete process.env.DATA_STORE_DISABLE;
    }
  });
});

test("verifyMetaLanded: rejects empty/blank key", async () => {
  await withClearedEnv(async () => {
    _resetForTests();
    await assert.rejects(
      () => verifyMetaLanded("", "2026-01-01T00:00:00.000Z"),
      /verifyMetaLanded: key/i,
    );
    await assert.rejects(
      () => verifyMetaLanded("   ", "2026-01-01T00:00:00.000Z"),
      /verifyMetaLanded: key/i,
    );
  });
});

test("verifyMetaLanded: rejects empty expectedWrittenAt", async () => {
  await withClearedEnv(async () => {
    _resetForTests();
    await assert.rejects(
      () => verifyMetaLanded("scr11-verify-needs-ts", ""),
      /verifyMetaLanded: expectedWrittenAt/i,
    );
  });
});

// Cleanup after the suite — the disabled-cache state shouldn't leak to other
// tests in the runner (they each call _resetForTests anyway, but be explicit).
test.after(async () => {
  _resetForTests();
  await closeDataStore();
});
