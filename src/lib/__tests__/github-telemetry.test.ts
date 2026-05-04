import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { _setRedisForTests } from "../redis";
import {
  githubKeyFingerprint,
  isKeyQuarantined,
  quarantineKey,
  recordGithubCall,
} from "../pool/github-telemetry";
import { githubFetch } from "../github-fetch";
import type { GitHubTokenPool, TokenState } from "../github-token-pool";

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
  globalThis.fetch = ORIGINAL_FETCH;
});

const ORIGINAL_FETCH = globalThis.fetch;

class FakePool implements GitHubTokenPool {
  readonly token = "tok-a-aaaaaaaaaaaaaaaaabcd";
  readonly rateLimitRecords: Array<{ remaining: number; resetUnixSec: number }> = [];
  quarantineCalls = 0;

  getNextToken(): string {
    return this.token;
  }

  recordRateLimit(_token: string, remaining: number, resetUnixSec: number): void {
    void _token;
    this.rateLimitRecords.push({ remaining, resetUnixSec });
  }

  quarantine(): void {
    this.quarantineCalls += 1;
  }

  snapshot(): readonly TokenState[] {
    return [];
  }

  hydrationStatus(): { enabled: boolean; started: boolean; completed: boolean } {
    return { enabled: false, started: false, completed: false };
  }

  size(): number {
    return 1;
  }
}

test("recordGithubCall writes hourly usage counters", async () => {
  const fake = new FakeRedis();
  _setRedisForTests(fake);

  await recordGithubCall({
    keyFingerprint: "abcd",
    statusCode: 200,
    rateLimitRemaining: 4999,
    rateLimitReset: 1_800_000_000,
    responseTimeMs: 123,
    operation: "fetch_repo_metadata",
    success: true,
  });

  const hourBucket = new Date().toISOString().slice(0, 13).replace("T", "-");
  const key = `pool:github:usage:abcd:${hourBucket}`;
  assert.deepEqual(await fake.hgetall(key), {
    requests: "1",
    success: "1",
    lastRateLimitRemaining: "4999",
    lastRateLimitReset: "1800000000",
    lastStatusCode: "200",
    lastResponseMs: "123",
    lastOperation: "fetch_repo_metadata",
    lastCallAt: (await fake.hgetall(key)).lastCallAt,
  });
  assert.match((await fake.hgetall(key)).lastCallAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(fake.expirations.get(key), 60 * 60 * 25);
});

test("recordGithubCall increments fail counter when the call is not successful", async () => {
  const fake = new FakeRedis();
  _setRedisForTests(fake);

  await recordGithubCall({
    keyFingerprint: "wxyz",
    statusCode: 503,
    rateLimitRemaining: null,
    rateLimitReset: null,
    responseTimeMs: 50,
    operation: "rate_limit",
    success: false,
  });

  const hourBucket = new Date().toISOString().slice(0, 13).replace("T", "-");
  const hash = await fake.hgetall(`pool:github:usage:wxyz:${hourBucket}`);
  assert.equal(hash.requests, "1");
  assert.equal(hash.fail, "1");
  assert.equal(hash.lastStatusCode, "503");
  assert.equal(hash.lastRateLimitRemaining, undefined);
});

test("githubKeyFingerprint distinguishes different tokens with the same suffix", () => {
  const first = githubKeyFingerprint("tok-a-aaaaaaaaaaaaaaaaabcd");
  const second = githubKeyFingerprint("tok-b-bbbbbbbbbbbbbbbbabcd");

  assert.notEqual(first, second);
  assert.match(first, /^abcd-[0-9a-f]{8}$/);
  assert.match(second, /^abcd-[0-9a-f]{8}$/);
});

test("quarantineKey stores fingerprint quarantine until an absolute unix timestamp", async () => {
  const fake = new FakeRedis();
  _setRedisForTests(fake);

  await quarantineKey({
    keyFingerprint: "abcd",
    reason: "rate_limit",
    untilTimestamp: 1_800_000_000,
  });

  const key = "pool:github:quarantine:abcd";
  assert.equal(await isKeyQuarantined("abcd"), true);
  assert.equal(fake.exat.get(key), 1_800_000_000);
  assert.deepEqual(JSON.parse(fake.strings.get(key) ?? "{}"), {
    keyFingerprint: "abcd",
    reason: "rate_limit",
    untilTimestamp: 1_800_000_000,
  });
});

test("githubFetch records usage telemetry for a successful response", async () => {
  const fake = new FakeRedis();
  const pool = new FakePool();
  _setRedisForTests(fake);
  globalThis.fetch = (async () =>
    new Response("{}", {
      status: 200,
      headers: {
        "x-ratelimit-remaining": "4998",
        "x-ratelimit-reset": "1800000000",
      },
    })) as typeof fetch;

  const result = await githubFetch("/rate_limit", {
    pool,
  });

  assert.equal(result?.response.status, 200);
  assert.deepEqual(pool.rateLimitRecords, [
    { remaining: 4998, resetUnixSec: 1_800_000_000 },
  ]);
  const hourBucket = new Date().toISOString().slice(0, 13).replace("T", "-");
  const fingerprint = githubKeyFingerprint(pool.token);
  const hash = await fake.hgetall(`pool:github:usage:${fingerprint}:${hourBucket}`);
  assert.equal(hash.requests, "1");
  assert.equal(hash.success, "1");
  assert.equal(hash.lastOperation, "rate_limit");
});

test("githubFetch quarantines invalid tokens by fingerprint after 401", async () => {
  const fake = new FakeRedis();
  const pool = new FakePool();
  _setRedisForTests(fake);
  globalThis.fetch = (async () =>
    new Response("{}", {
      status: 401,
      headers: {
        "x-ratelimit-remaining": "4998",
        "x-ratelimit-reset": "1800000000",
      },
    })) as typeof fetch;

  const result = await githubFetch("/rate_limit", {
    pool,
  });

  assert.equal(result?.response.status, 401);
  assert.equal(pool.quarantineCalls, 4);
  const fingerprint = githubKeyFingerprint(pool.token);
  assert.equal(await isKeyQuarantined(fingerprint), true);
  assert.match(
    fake.strings.get(`pool:github:quarantine:${fingerprint}`) ?? "",
    /invalid_token/,
  );
});
