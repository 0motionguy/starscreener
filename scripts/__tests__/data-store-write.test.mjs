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

// Cleanup after the suite — the disabled-cache state shouldn't leak to other
// tests in the runner (they each call _resetForTests anyway, but be explicit).
test.after(async () => {
  _resetForTests();
  await closeDataStore();
});
