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
  _resetDataStoreForTests,
  _dataStoreTestHooks,
  closeDataStore,
  createDataStore,
  getDataStore,
  type UpstashClientLike,
} from "../data-store";

// ---------------------------------------------------------------------------
// Fake Upstash client
// ---------------------------------------------------------------------------

class FakeRedis implements UpstashClientLike {
  public store = new Map<string, string>();
  public failNextWith: Error | null = null;
  public setCalls: Array<{
    key: string;
    value: string;
    opts?: { ex?: number; nx?: boolean };
  }> = [];

  async get(key: string): Promise<unknown> {
    if (this.failNextWith) {
      const err = this.failNextWith;
      this.failNextWith = null;
      throw err;
    }
    return this.store.has(key) ? this.store.get(key) : null;
  }

  async set(
    key: string,
    value: string,
    opts?: { ex?: number; nx?: boolean },
  ): Promise<unknown> {
    if (this.failNextWith) {
      const err = this.failNextWith;
      this.failNextWith = null;
      throw err;
    }
    this.setCalls.push({ key, value, opts });
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
  env?: Record<string, string | undefined>;
} = {}) {
  const withRedis = opts.withRedis !== false;
  const baseEnv = withRedis
    ? {
        UPSTASH_REDIS_REST_URL: "https://fake",
        UPSTASH_REDIS_REST_TOKEN: "fake-token",
      }
    : {};
  return createDataStore({
    env: { ...baseEnv, ...(opts.env ?? {}) },
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

test("write({mirrorToFile:true}) skips disk snapshot when Redis is healthy", async () => {
  const store = buildStore();
  await store.write("snap", { v: 1 }, { mirrorToFile: true });
  const path = join(tmpDir, "snap.json");
  assert.equal(existsSync(path), false, "expected mirror file to be skipped");
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

test("read() marks redis payload without meta as not fresh", async () => {
  const store = buildStore();
  fake.store.set("ss:data:v1:meta-skew", JSON.stringify({ ok: true }));
  const result = await store.read<{ ok: boolean }>("meta-skew");
  assert.equal(result.source, "redis");
  assert.equal(result.fresh, false);
  assert.equal(result.ageMs, Number.MAX_SAFE_INTEGER);
  assert.equal(result.writtenAt, undefined);
});

test("writtenAt() ignores meta when redis payload is missing", async () => {
  const store = buildStore();
  fake.store.set("ss:meta:v1:payload-skew", new Date().toISOString());
  const ts = await store.writtenAt("payload-skew");
  assert.equal(ts, null);
});

test("write() trims key and uses namespaced payload/meta redis keys", async () => {
  const store = buildStore();
  await store.write("  spaced-key  ", { ok: true });

  const keys = fake.setCalls.map((c) => c.key);
  assert.ok(keys.includes("ss:data:v1:spaced-key"));
  assert.ok(keys.includes("ss:meta:v1:spaced-key"));
});

test("write() rejects invalid key literals null/undefined and blank keys", async () => {
  const store = buildStore();

  await assert.rejects(() => store.write("null", { x: 1 }), /invalid key/i);
  await assert.rejects(() => store.write("undefined", { x: 1 }), /invalid key/i);
  await assert.rejects(() => store.write("   ", { x: 1 }), /invalid key/i);
});

test("write() applies default TTL when omitted", async () => {
  const store = buildStore();
  await store.write("ttl-default", { v: 1 });
  const payloadCall = fake.setCalls.find((c) => c.key === "ss:data:v1:ttl-default");
  const metaCall = fake.setCalls.find((c) => c.key === "ss:meta:v1:ttl-default");
  assert.deepEqual(payloadCall?.opts, { ex: 86400 });
  assert.deepEqual(metaCall?.opts, { ex: 86400 });
});

test("write() with ttlSeconds=0 disables redis EX ttl", async () => {
  const store = buildStore();
  await store.write("ttl-none", { v: 1 }, { ttlSeconds: 0 });
  const payloadCall = fake.setCalls.find((c) => c.key === "ss:data:v1:ttl-none");
  const metaCall = fake.setCalls.find((c) => c.key === "ss:meta:v1:ttl-none");
  assert.equal(payloadCall?.opts, undefined);
  assert.equal(metaCall?.opts, undefined);
});

test("write() with positive ttlSeconds forwards EX ttl to redis", async () => {
  const store = buildStore();
  await store.write("ttl-custom", { v: 1 }, { ttlSeconds: 123 });
  const payloadCall = fake.setCalls.find((c) => c.key === "ss:data:v1:ttl-custom");
  const metaCall = fake.setCalls.find((c) => c.key === "ss:meta:v1:ttl-custom");
  assert.deepEqual(payloadCall?.opts, { ex: 123 });
  assert.deepEqual(metaCall?.opts, { ex: 123 });
});

test("write() stores provenance metadata as JSON when provenance fields are present", async () => {
  const store = buildStore();
  await store.write(
    "prov",
    { ok: true },
    { writer: "collector", runId: "run-1", commit: "abc123" },
  );
  const meta = fake.store.get("ss:meta:v1:prov");
  assert.ok(meta);
  const parsed = JSON.parse(meta ?? "{}") as {
    writtenAt?: string;
    writer?: string;
    runId?: string;
    commit?: string;
  };
  assert.equal(typeof parsed.writtenAt, "string");
  assert.equal(parsed.writer, "collector");
  assert.equal(parsed.runId, "run-1");
  assert.equal(parsed.commit, "abc123");
});

test("read() returns missing when redis payload is invalid JSON and no other tier has data", async () => {
  const store = buildStore();
  fake.store.set("ss:data:v1:bad-json", "{");
  fake.store.set("ss:meta:v1:bad-json", new Date().toISOString());
  const result = await store.read("bad-json");
  assert.equal(result.source, "missing");
  assert.equal(result.data, null);
});

test("writtenAt() parses JSON metadata written by provenance-capable writers", async () => {
  const store = buildStore();
  fake.store.set("ss:data:v1:meta-json", JSON.stringify({ ok: true }));
  fake.store.set(
    "ss:meta:v1:meta-json",
    JSON.stringify({
      writtenAt: "2026-05-04T10:11:12.000Z",
      writer: "collector",
    }),
  );
  const ts = await store.writtenAt("meta-json");
  assert.equal(ts, "2026-05-04T10:11:12.000Z");
});

test("writtenAt() falls back to file timestamp when redis keys are missing", async () => {
  const store = buildStore({ withRedis: false });
  await store.write("file-ts", { ok: true }, { mirrorToFile: true });
  const ts = await store.writtenAt("file-ts");
  assert.ok(ts && ts.startsWith("20"), `expected file fallback ISO timestamp, got: ${ts}`);
});

test("writtenAt() returns null when redis payload is missing even if memory was warmed", async () => {
  const store = buildStore();
  await store.write("mem-ts", { ok: true });
  await fake.del("ss:data:v1:mem-ts", "ss:meta:v1:mem-ts");
  const ts = await store.writtenAt("mem-ts");
  assert.equal(ts, null);
});

test("getDataStore() returns singleton instance and closeDataStore() resets it", async () => {
  _resetDataStoreForTests();
  const a = getDataStore();
  const b = getDataStore();
  assert.equal(a, b);
  await closeDataStore();
  const c = getDataStore();
  assert.notEqual(c, a);
  await closeDataStore();
  _resetDataStoreForTests();
});

test("parsePayload() handles object, valid string JSON, invalid JSON, and nullish", () => {
  assert.deepEqual(_dataStoreTestHooks.parsePayload('{"a":1}'), { a: 1 });
  assert.deepEqual(_dataStoreTestHooks.parsePayload({ b: 2 }), { b: 2 });
  assert.equal(_dataStoreTestHooks.parsePayload("{"), null);
  assert.equal(_dataStoreTestHooks.parsePayload(null), null);
  assert.equal(_dataStoreTestHooks.parsePayload(undefined), null);
});

test("parseWrittenAt() handles raw ISO, JSON metadata, object metadata, and invalid shapes", () => {
  assert.equal(
    _dataStoreTestHooks.parseWrittenAt("2026-05-04T10:00:00.000Z"),
    "2026-05-04T10:00:00.000Z",
  );
  assert.equal(
    _dataStoreTestHooks.parseWrittenAt(
      JSON.stringify({ writtenAt: "2026-05-04T10:01:00.000Z", writer: "w" }),
    ),
    "2026-05-04T10:01:00.000Z",
  );
  assert.equal(
    _dataStoreTestHooks.parseWrittenAt({ writtenAt: "2026-05-04T10:02:00.000Z" }),
    "2026-05-04T10:02:00.000Z",
  );
  assert.equal(_dataStoreTestHooks.parseWrittenAt(""), null);
  assert.equal(_dataStoreTestHooks.parseWrittenAt({ wrong: true }), null);
});

test("safeStat() returns null for missing files and mtime for existing files", () => {
  const existing = join(tmpDir, "stat-check.json");
  writeFileSync(existing, "{}");
  const stat = _dataStoreTestHooks.safeStat(existing);
  assert.ok(stat && stat.mtimeMs > 0);
  assert.equal(_dataStoreTestHooks.safeStat(join(tmpDir, "missing.json")), null);
});

test("resolveWriteProvenance() derives writer/run/commit from env with commit truncation", () => {
  const derived = _dataStoreTestHooks.resolveWriteProvenance(
    {},
    {
      GITHUB_WORKFLOW: "ci",
      GITHUB_RUN_ID: "run-123",
      GITHUB_SHA: "abcdef1234567890",
    },
  );
  assert.equal(derived.writer, "github-actions:ci");
  assert.equal(derived.runId, "run-123");
  assert.equal(derived.commit, "abcdef1");
});

test("defaultRedisFactory() rejects Upstash REST URL without token", () => {
  assert.throws(
    () => _dataStoreTestHooks.defaultRedisFactory("https://example.upstash.io"),
    /UPSTASH_REDIS_REST_TOKEN/i,
  );
});

test("write() auto-populates provenance from GitHub Actions env when options are omitted", async () => {
  const store = buildStore({
    env: {
      GITHUB_WORKFLOW: "Collect Twitter Signals",
      GITHUB_RUN_ID: "25200000001",
      GITHUB_SHA: "1234567890abcdef1234567890abcdef12345678",
    },
  });
  await store.write("prov-auto", { ok: true });

  const meta = fake.store.get("ss:meta:v1:prov-auto");
  assert.ok(meta);
  const parsed = JSON.parse(meta ?? "{}") as {
    writtenAt?: string;
    writer?: string;
    runId?: string;
    commit?: string;
  };
  assert.equal(typeof parsed.writtenAt, "string");
  assert.equal(parsed.writer, "github-actions:Collect Twitter Signals");
  assert.equal(parsed.runId, "25200000001");
  assert.equal(parsed.commit, "1234567");
});
