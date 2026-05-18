// Security coverage for checkRateLimitAsync subject keying.
//
// Run:
//   npx tsx --test src/lib/api/__tests__/rate-limit-subject.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";

import { checkRateLimitAsync } from "../rate-limit";
import type {
  RateLimitIncrementResult,
  RateLimitStore,
} from "../rate-limit-store";

class CapturingRateLimitStore implements RateLimitStore {
  readonly keys: string[] = [];
  private readonly counts = new Map<string, number>();

  async incrementWithTtl(
    key: string,
    ttlSec: number,
  ): Promise<RateLimitIncrementResult> {
    this.keys.push(key);
    const count = (this.counts.get(key) ?? 0) + 1;
    this.counts.set(key, count);
    return { count, ttlRemainingMs: ttlSec * 1000 };
  }

  async reset(key: string): Promise<void> {
    this.counts.delete(key);
  }
}

function makeRequest(headers: Record<string, string> = {}): Request {
  return new Request("https://trendingrepo.com/api/test", { headers });
}

test("checkRateLimitAsync: subject uses independent buckets on the same IP", async () => {
  const store = new CapturingRateLimitStore();
  const request = makeRequest({ "x-forwarded-for": "198.51.100.10" });
  const options = { windowMs: 60_000, maxRequests: 1 };

  const firstA = await checkRateLimitAsync(
    request,
    { ...options, subject: "profile-a" },
    store,
  );
  const secondA = await checkRateLimitAsync(
    request,
    { ...options, subject: "profile-a" },
    store,
  );
  const firstB = await checkRateLimitAsync(
    request,
    { ...options, subject: "profile-b" },
    store,
  );

  assert.equal(firstA.allowed, true);
  assert.equal(secondA.allowed, false);
  assert.equal(firstB.allowed, true);
  assert.deepEqual(store.keys, [
    "rl:u:profile-a:60000:1",
    "rl:u:profile-a:60000:1",
    "rl:u:profile-b:60000:1",
  ]);
});

test("checkRateLimitAsync: same subject shares a bucket across different IPs", async () => {
  const store = new CapturingRateLimitStore();
  const options = { windowMs: 60_000, maxRequests: 1, subject: "profile-a" };

  const first = await checkRateLimitAsync(
    makeRequest({ "x-forwarded-for": "198.51.100.10" }),
    options,
    store,
  );
  const second = await checkRateLimitAsync(
    makeRequest({ "x-forwarded-for": "198.51.100.11" }),
    options,
    store,
  );

  assert.equal(first.allowed, true);
  assert.equal(second.allowed, false);
  assert.deepEqual(store.keys, [
    "rl:u:profile-a:60000:1",
    "rl:u:profile-a:60000:1",
  ]);
});

test("checkRateLimitAsync: blank subject falls back to the Vercel client IP", async () => {
  const store = new CapturingRateLimitStore();
  const request = makeRequest({
    "x-vercel-forwarded-for": "203.0.113.9, 203.0.113.10",
    "x-forwarded-for": "198.51.100.99",
  });

  const result = await checkRateLimitAsync(
    request,
    { windowMs: 1_000, maxRequests: 2, subject: "   " },
    store,
  );

  assert.equal(result.allowed, true);
  assert.deepEqual(store.keys, ["rl:203.0.113.9:1000:2"]);
});

test("checkRateLimitAsync: IP fallback uses the leftmost x-forwarded-for segment", async () => {
  const store = new CapturingRateLimitStore();
  const request = makeRequest({
    "x-forwarded-for": "198.51.100.20, 198.51.100.21",
  });

  await checkRateLimitAsync(
    request,
    { windowMs: 1_000, maxRequests: 2 },
    store,
  );

  assert.deepEqual(store.keys, ["rl:198.51.100.20:1000:2"]);
});

test("checkRateLimitAsync: missing IP headers share the unknown bucket", async () => {
  const store = new CapturingRateLimitStore();
  const options = { windowMs: 60_000, maxRequests: 1 };

  const first = await checkRateLimitAsync(makeRequest(), options, store);
  const second = await checkRateLimitAsync(makeRequest(), options, store);

  assert.equal(first.allowed, true);
  assert.equal(second.allowed, false);
  assert.deepEqual(store.keys, ["rl:unknown:60000:1", "rl:unknown:60000:1"]);
});

test("checkRateLimitAsync: trims non-blank subjects before keying", async () => {
  const store = new CapturingRateLimitStore();
  const request = makeRequest({ "x-forwarded-for": "198.51.100.10" });

  await checkRateLimitAsync(
    request,
    { windowMs: 1_000, maxRequests: 2, subject: "  profile-123  " },
    store,
  );

  assert.deepEqual(store.keys, ["rl:u:profile-123:1000:2"]);
});

test("checkRateLimitAsync: IP-shaped subjects cannot collide with IP buckets", async () => {
  const store = new CapturingRateLimitStore();
  const ip = "198.51.100.10";
  const request = makeRequest({ "x-forwarded-for": ip });
  const options = { windowMs: 60_000, maxRequests: 1 };

  await checkRateLimitAsync(request, options, store);
  const blockedIp = await checkRateLimitAsync(request, options, store);
  const subjectAllowed = await checkRateLimitAsync(
    request,
    { ...options, subject: ip },
    store,
  );

  assert.equal(blockedIp.allowed, false);
  assert.equal(subjectAllowed.allowed, true);
  assert.deepEqual(store.keys, [
    "rl:198.51.100.10:60000:1",
    "rl:198.51.100.10:60000:1",
    "rl:u:198.51.100.10:60000:1",
  ]);
});
