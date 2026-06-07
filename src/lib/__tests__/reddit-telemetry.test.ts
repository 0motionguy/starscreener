import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { _setRedisForTests } from "../redis";
import {
  isUserAgentQuarantined,
  quarantineUserAgent,
  recordRedditCall,
} from "../pool/reddit-telemetry";

class FakeRedis {
  readonly hashes = new Map<string, Record<string, string>>();
  readonly strings = new Map<string, string>();
  readonly expirations = new Map<string, number>();
  readonly exat = new Map<string, number>();

  async get(key: string): Promise<string | null> {
    return this.strings.get(key) ?? null;
  }

  async set(
    key: string,
    value: string,
    mode?: "EX" | "PX" | "EXAT" | "PXAT",
    ttl?: number,
  ): Promise<"OK"> {
    this.strings.set(key, value);
    if (mode === "EXAT" && typeof ttl === "number") {
      this.exat.set(key, ttl);
    }
    return "OK";
  }

  async hincrby(key: string, field: string, increment: number): Promise<number> {
    const hash = this.hashes.get(key) ?? {};
    const next = Number(hash[field] ?? "0") + increment;
    hash[field] = String(next);
    this.hashes.set(key, hash);
    return next;
  }

  async hset(key: string, field: string, value: string | number): Promise<number> {
    const hash = this.hashes.get(key) ?? {};
    const existed = Object.hasOwn(hash, field);
    hash[field] = String(value);
    this.hashes.set(key, hash);
    return existed ? 0 : 1;
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    return { ...(this.hashes.get(key) ?? {}) };
  }

  async expire(key: string, seconds: number): Promise<number> {
    this.expirations.set(key, seconds);
    return 1;
  }
}

afterEach(() => {
  _setRedisForTests(null);
});

function usageKey(fingerprint: string): string {
  const hourBucket = new Date().toISOString().slice(0, 13).replace("T", "-");
  return `pool:reddit:usage:${fingerprint}:${hourBucket}`;
}

test("recordRedditCall marks 403s as blocked telemetry", async () => {
  const fake = new FakeRedis();
  _setRedisForTests(fake);

  await recordRedditCall({
    userAgentFingerprint: "ua-a",
    statusCode: 403,
    responseTimeMs: 42,
    operation: "reddit_search_mentions",
    success: false,
  });

  const hash = await fake.hgetall(usageKey("ua-a"));
  assert.equal(hash.requests, "1");
  assert.equal(hash.fail, "1");
  assert.equal(hash.blocked, "1");
  assert.equal(hash.lastStatusCode, "403");
  assert.match(hash.lastBlockedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(fake.expirations.get(usageKey("ua-a")), 60 * 60 * 25);
});

test("recordRedditCall marks 429s as rate-limited telemetry", async () => {
  const fake = new FakeRedis();
  _setRedisForTests(fake);

  await recordRedditCall({
    userAgentFingerprint: "ua-b",
    statusCode: 429,
    responseTimeMs: 75,
    operation: "reddit_search_mentions",
    success: false,
  });

  const hash = await fake.hgetall(usageKey("ua-b"));
  assert.equal(hash.requests, "1");
  assert.equal(hash.fail, "1");
  assert.equal(hash.rateLimited, "1");
  assert.equal(hash.lastStatusCode, "429");
  assert.match(hash.last429At, /^\d{4}-\d{2}-\d{2}T/);
});

test("quarantineUserAgent stores reddit UA quarantine until absolute timestamp", async () => {
  const fake = new FakeRedis();
  _setRedisForTests(fake);

  await quarantineUserAgent({
    userAgentFingerprint: "ua-c",
    reason: "blocked",
    untilTimestamp: 1_800_000_000,
  });

  const key = "pool:reddit:quarantine:ua-c";
  assert.equal(await isUserAgentQuarantined("ua-c"), true);
  assert.equal(fake.exat.get(key), 1_800_000_000);
  assert.deepEqual(JSON.parse(fake.strings.get(key) ?? "{}"), {
    userAgentFingerprint: "ua-c",
    reason: "blocked",
    untilTimestamp: 1_800_000_000,
  });
});
