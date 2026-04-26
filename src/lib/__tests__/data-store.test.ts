// StarScreener — data-store smoke tests.
//
// Verifies the three-tier fallback (Redis → file → memory) behaves as the
// jsdoc on data-store.ts promises:
//   1. read() never throws and never returns null when ANY tier has data
//   2. read() reports the right `source` and `fresh` flag per tier
//   3. write() routes to Redis + memory; mirrorToFile is opt-in
//   4. write() throws when there is no durable destination at all
//   5. Redis errors degrade silently (memory + file still work)
//
// The Upstash client is faked end-to-end so these tests run with no SDK and
// no network. The data dir is a per-test tmp directory so tests don't touch
// the real data/ snapshots.

import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import {
  createDataStore,
  type UpstashClientLike,
} from "../data-store";

// ---------------------------------------------------------------------------
// Fake Upstash client
// ---------------------------------------------------------------------------

class FakeRedis implements UpstashClientLike {
  public store = new Map<string, string>();
  public failNextWith: Error | null = null;

  async get(key: string): Promise<unknown> {
    if (this.failNextWith) {
      const err = this.failNextWith;
      this.failNextWith = null;
      throw err;
    }
    return this.store.has(key) ? this.store.get(key) : null;
  }

  async set(key: string, value: string): Promise<unknown> {
    if (this.failNextWith) {
      const err = this.failNextWith;
      this.failNextWith = null;
      throw err;
    }
    this.store.set(key, value);
    return "OK";
  }

  async del(...keys: string[]): Promise<number> {
    let n = 0;
    for (const k of keys) {
      if (this.store.delete(k)) n += 1;
    }
    return n;
  }
}

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

let tmpDir: string;
let fake: FakeRedis;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "ss-data-store-"));
  fake = new FakeRedis();
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function buildStore(opts: {
  withRedis?: boolean;
  disableFileMirror?: boolean;
} = {}) {
  const withRedis = opts.withRedis !== false;
  return createDataStore({
    env: withRedis
      ? {
          UPSTASH_REDIS_REST_URL: "https://fake",
          UPSTASH_REDIS_REST_TOKEN: "fake-token",
        }
      : {},
    upstashFactory: () => fake,
    dataDir: tmpDir,
    disableFileMirror: opts.disableFileMirror ?? false,
    onFallback: () => {},
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("read() returns missing when no tier has data", async () => {
  const store = buildStore();
  const result = await store.read("nope");
  assert.equal(result.source, "missing");
  assert.equal(result.data, null);
  assert.equal(result.fresh, false);
});

test("write() routes to Redis and memory; read() returns redis tier", async () => {
  const store = buildStore();
  await store.write("trending", { hello: "world" });

  // Redis got the payload + meta
  assert.equal(fake.store.size, 2);
  const result = await store.read<{ hello: string }>("trending");
  assert.equal(result.source, "redis");
  assert.equal(result.fresh, true);
  assert.deepEqual(result.data, { hello: "world" });
  assert.ok(result.writtenAt, "writtenAt should be set on redis hit");
});

test("read() falls back to file when Redis returns null", async () => {
  const store = buildStore();
  // Redis empty; seed a file
  writeFileSync(join(tmpDir, "trending.json"), JSON.stringify({ from: "file" }));
  const result = await store.read<{ from: string }>("trending");
  assert.equal(result.source, "file");
  assert.equal(result.fresh, false);
  assert.deepEqual(result.data, { from: "file" });
});

test("read() falls back to memory when Redis errors AND no file", async () => {
  const store = buildStore();
  // Prime memory by doing a successful write
  await store.write("warm", { warm: true });
  // Now make Redis error on next read
  fake.failNextWith = new Error("simulated redis outage");
  const result = await store.read<{ warm: boolean }>("warm");
  // Either redis-error swallowed and we fall through to file (missing), then
  // memory hits with last-known-good
  assert.equal(result.source, "memory");
  assert.equal(result.fresh, false);
  assert.deepEqual(result.data, { warm: true });
});

test("read() prefers Redis when both Redis and file are populated", async () => {
  const store = buildStore();
  writeFileSync(join(tmpDir, "trending.json"), JSON.stringify({ from: "stale-file" }));
  await store.write("trending", { from: "fresh-redis" });
  const result = await store.read<{ from: string }>("trending");
  assert.equal(result.source, "redis");
  assert.deepEqual(result.data, { from: "fresh-redis" });
});

test("write({mirrorToFile:true}) snapshots to disk", async () => {
  const store = buildStore();
  await store.write("snap", { v: 1 }, { mirrorToFile: true });
  const path = join(tmpDir, "snap.json");
  assert.ok(existsSync(path), "expected mirror file to be written");
  const raw = readFileSync(path, "utf8");
  assert.deepEqual(JSON.parse(raw), { v: 1 });
});

test("write() with no Redis and no mirrorToFile throws", async () => {
  const store = buildStore({ withRedis: false });
  await assert.rejects(
    () => store.write("doomed", { x: 1 }),
    /no destination/i,
  );
});

test("write() with no Redis but mirrorToFile true succeeds", async () => {
  const store = buildStore({ withRedis: false });
  await store.write("file-only", { from: "disk" }, { mirrorToFile: true });
  const path = join(tmpDir, "file-only.json");
  assert.ok(existsSync(path));
  // Subsequent read serves from file (no Redis) and is marked stale.
  const result = await store.read<{ from: string }>("file-only");
  assert.equal(result.source, "file");
  assert.equal(result.fresh, false);
  assert.deepEqual(result.data, { from: "disk" });
});

test("read() handles Upstash returning a parsed object (not a string)", async () => {
  // Some @upstash/redis client versions auto-decode JSON-looking values back
  // into objects. Our parser must be tolerant of both shapes.
  const store = buildStore();
  // Pre-seed Redis with an OBJECT instead of a JSON string.
  fake.store.set("ss:data:v1:obj", JSON.stringify({ shape: "string" }));
  fake.store.set("ss:meta:v1:obj", new Date().toISOString());
  const r1 = await store.read<{ shape: string }>("obj");
  assert.equal(r1.source, "redis");
  assert.equal(r1.data?.shape, "string");

  // Now with a literal object as Redis would return after auto-decoding.
  // We cheat by overriding fake.get for one call.
  const origGet = fake.get.bind(fake);
  fake.get = async (key: string) => {
    if (key === "ss:data:v1:obj2") return { shape: "object" };
    if (key === "ss:meta:v1:obj2") return new Date().toISOString();
    return origGet(key);
  };
  const r2 = await store.read<{ shape: string }>("obj2");
  assert.equal(r2.source, "redis");
  assert.equal(r2.data?.shape, "object");
});

test("reset() clears Redis + memory tiers", async () => {
  const store = buildStore();
  await store.write("doomed", { x: 1 });
  assert.equal(fake.store.size, 2);
  await store.reset("doomed");
  assert.equal(fake.store.size, 0);
  // Memory cleared too
  const r = await store.read("doomed");
  assert.equal(r.source, "missing");
});

test("writtenAt() returns the meta timestamp from Redis when present", async () => {
  const store = buildStore();
  await store.write("x", { v: 1 });
  const ts = await store.writtenAt("x");
  assert.ok(ts && ts.startsWith("20"), `expected ISO timestamp, got: ${ts}`);
});

test("ageMs is non-negative and reflects time since write", async () => {
  const store = buildStore();
  await store.write("agecheck", { v: 1 });
  await new Promise((r) => setTimeout(r, 5));
  const result = await store.read("agecheck");
  assert.ok(result.ageMs >= 0, "ageMs should be non-negative");
});
