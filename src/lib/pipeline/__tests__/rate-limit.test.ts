// StarScreener — Rate-limit tests (memory path).
//
// Exercises both the legacy synchronous `checkRateLimit` and the new
// `checkRateLimitAsync` against the in-memory store. Upstash-specific
// behaviour is covered in `rate-limit-upstash.test.ts`.

import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";

import {
  _resetRateLimitForTests,
  _setStoreForTests,
  checkRateLimit,
  checkRateLimitAsync,
} from "../../api/rate-limit";
import {
  MemoryRateLimitStore,
  createStore,
  _resetFallbackWarningForTests,
} from "../../api/rate-limit-store";

function mkRequest(ip: string): Request {
  return new Request("https://example.test/route", {
    headers: { "x-forwarded-for": ip },
  });
}

beforeEach(() => {
  _resetRateLimitForTests();
  _setStoreForTests(null);
  _resetFallbackWarningForTests();
});

// ---------------------------------------------------------------------------
// Synchronous path — legacy back-compat
// ---------------------------------------------------------------------------

test("checkRateLimit: allows first N calls under max", () => {
  const req = mkRequest("10.0.0.1");
  for (let i = 0; i < 3; i += 1) {
    const r = checkRateLimit(req, { windowMs: 60_000, maxRequests: 3 });
    assert.equal(r.allowed, true, `call ${i + 1} should be allowed`);
  }
});

test("checkRateLimit: blocks after max is exceeded", () => {
  const req = mkRequest("10.0.0.2");
  for (let i = 0; i < 3; i += 1) {
    checkRateLimit(req, { windowMs: 60_000, maxRequests: 3 });
  }
  const blocked = checkRateLimit(req, { windowMs: 60_000, maxRequests: 3 });
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);
  assert.ok(blocked.resetAt > Date.now());
});

test("checkRateLimit: independent buckets per IP", () => {
  const a = mkRequest("10.0.0.3");
  const b = mkRequest("10.0.0.4");
  for (let i = 0; i < 3; i += 1) {
    checkRateLimit(a, { windowMs: 60_000, maxRequests: 3 });
  }
  assert.equal(
    checkRateLimit(a, { windowMs: 60_000, maxRequests: 3 }).allowed,
    false,
  );
  assert.equal(
    checkRateLimit(b, { windowMs: 60_000, maxRequests: 3 }).allowed,
    true,
  );
});

// ---------------------------------------------------------------------------
// Async path — memory store
// ---------------------------------------------------------------------------

test("checkRateLimitAsync: memory store allows first 3 calls when max=3", async () => {
  const store = new MemoryRateLimitStore();
  const req = mkRequest("10.0.1.1");
  for (let i = 0; i < 3; i += 1) {
    const r = await checkRateLimitAsync(
      req,
      { windowMs: 60_000, maxRequests: 3 },
      store,
    );
    assert.equal(r.allowed, true, `call ${i + 1} should pass`);
    assert.equal(r.count, i + 1);
  }
});

test("checkRateLimitAsync: memory store blocks the 4th call", async () => {
  const store = new MemoryRateLimitStore();
  const req = mkRequest("10.0.1.2");
  for (let i = 0; i < 3; i += 1) {
    await checkRateLimitAsync(
      req,
      { windowMs: 60_000, maxRequests: 3 },
      store,
    );
  }
  const blocked = await checkRateLimitAsync(
    req,
    { windowMs: 60_000, maxRequests: 3 },
    store,
  );
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.count, 4);
  assert.ok(blocked.retryAfterMs > 0);
});

test("checkRateLimitAsync: memory store resets counter after TTL expires", async () => {
  let now = 1_000_000;
  const store = new MemoryRateLimitStore(() => now);
  const req = mkRequest("10.0.1.3");

  for (let i = 0; i < 3; i += 1) {
    await checkRateLimitAsync(
      req,
      { windowMs: 60_000, maxRequests: 3 },
      store,
    );
  }
  const blocked = await checkRateLimitAsync(
    req,
    { windowMs: 60_000, maxRequests: 3 },
    store,
  );
  assert.equal(blocked.allowed, false);

  // Jump past the window.
  now += 61_000;

  const reopened = await checkRateLimitAsync(
    req,
    { windowMs: 60_000, maxRequests: 3 },
    store,
  );
  assert.equal(reopened.allowed, true, "counter should reset after TTL");
  assert.equal(reopened.count, 1);
});

test("checkRateLimitAsync: memory store TTL is set only on the first increment", async () => {
  // Assert against the store directly since checkRateLimitAsync mixes the
  // store's clock (injected) with real Date.now for its resetAt field.
  // This test is about the TTL semantics the store guarantees.
  let now = 1_000_000;
  const store = new MemoryRateLimitStore(() => now);

  const first = await store.incrementWithTtl("rl:one", 60);
  assert.equal(first.count, 1);
  assert.equal(first.ttlRemainingMs, 60_000);

  now += 20_000;
  const second = await store.incrementWithTtl("rl:one", 60);
  assert.equal(second.count, 2);
  assert.equal(
    second.ttlRemainingMs,
    40_000,
    "TTL should count down from the first increment, not reset",
  );
});

test("checkRateLimitAsync: independent keys per IP + window + max", async () => {
  const store = new MemoryRateLimitStore();
  const a = mkRequest("10.0.2.1");
  const b = mkRequest("10.0.2.2");

  for (let i = 0; i < 3; i += 1) {
    await checkRateLimitAsync(
      a,
      { windowMs: 60_000, maxRequests: 3 },
      store,
    );
  }
  const aBlocked = await checkRateLimitAsync(
    a,
    { windowMs: 60_000, maxRequests: 3 },
    store,
  );
  assert.equal(aBlocked.allowed, false);

  const bAllowed = await checkRateLimitAsync(
    b,
    { windowMs: 60_000, maxRequests: 3 },
    store,
  );
  assert.equal(bAllowed.allowed, true);
});

// ---------------------------------------------------------------------------
// Factory — `createStore()` chooses memory when env is unset
// ---------------------------------------------------------------------------

test("createStore: falls back to memory when UPSTASH env vars missing", () => {
  const store = createStore({ env: {} });
  assert.equal(store.constructor.name, "MemoryRateLimitStore");
});

test("createStore: falls back to memory when only URL is set", () => {
  const store = createStore({
    env: { UPSTASH_REDIS_REST_URL: "https://example.com" },
  });
  assert.equal(store.constructor.name, "MemoryRateLimitStore");
});

test("createStore: production fallback emits a one-shot warning", () => {
  const reasons: string[] = [];
  const store = createStore({
    env: { NODE_ENV: "production" },
    onFallback: (reason) => {
      reasons.push(reason);
    },
  });
  assert.equal(store.constructor.name, "MemoryRateLimitStore");
  assert.deepEqual(reasons, ["env-missing"]);
});
