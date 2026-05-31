// StarScreener — POST /api/admin/scan rate-limit envelope test.
//
// The route advertises 8 requests per 60s window. When the bucket is
// saturated, POST must return 429 with a numeric Retry-After header
// (seconds) and the standard { ok: false, error: "rate limited" } body.
//
// Auth runs BEFORE the limiter, so we set ADMIN_TOKEN and pass a matching
// Authorization header — otherwise the request 401s and never reaches the
// rate-limit branch under test.
//
// Pattern follows src/lib/pipeline/__tests__/rate-limit-routes.test.ts:
// inject a MemoryRateLimitStore primed past max, then invoke POST directly.
//
// Run:
//   npx tsx --test src/app/api/admin/scan/__tests__/rate-limit.test.ts

import { beforeEach, after, test } from "node:test";
import assert from "node:assert/strict";

import type { RateLimitStore } from "../../../../../lib/api/rate-limit-store";

const ADMIN_SCAN_WINDOW_MS = 60_000;
const ADMIN_SCAN_MAX = 8;
const ADMIN_TOKEN = "test-admin-token-rate-limit-fixture-32chars";

const previousAdminToken = process.env.ADMIN_TOKEN;
process.env.ADMIN_TOKEN = ADMIN_TOKEN;

async function loadRateLimitHelpers() {
  const rateLimitModule = await import("../../../../../lib/api/rate-limit");
  const storeModule = await import("../../../../../lib/api/rate-limit-store");
  const rateLimitNamespace = rateLimitModule as typeof rateLimitModule & {
    default?: typeof rateLimitModule;
  };
  const storeNamespace = storeModule as typeof storeModule & {
    default?: typeof storeModule;
  };
  const rateLimit = rateLimitNamespace.default ?? rateLimitNamespace;
  const store = storeNamespace.default ?? storeNamespace;
  return {
    _setStoreForTests: rateLimit._setStoreForTests,
    _resetFallbackWarningForTests: store._resetFallbackWarningForTests,
    MemoryRateLimitStore: store.MemoryRateLimitStore,
  };
}

async function primeSaturatedStore(
  ip: string,
  windowMs: number,
  maxRequests: number,
): Promise<RateLimitStore> {
  const { MemoryRateLimitStore, _setStoreForTests } = await loadRateLimitHelpers();
  const store = new MemoryRateLimitStore();
  const ttlSec = Math.max(1, Math.ceil(windowMs / 1000));
  const key = `rl:${ip}:${windowMs}:${maxRequests}`;
  for (let i = 0; i < maxRequests; i += 1) {
    await store.incrementWithTtl(key, ttlSec);
  }
  _setStoreForTests(store);
  return store;
}

beforeEach(async () => {
  const { _setStoreForTests, _resetFallbackWarningForTests } = await loadRateLimitHelpers();
  _setStoreForTests(null);
  _resetFallbackWarningForTests();
});

after(async () => {
  if (previousAdminToken === undefined) {
    delete process.env.ADMIN_TOKEN;
  } else {
    process.env.ADMIN_TOKEN = previousAdminToken;
  }
  const { _setStoreForTests } = await loadRateLimitHelpers();
  _setStoreForTests(null);
});

test("POST /api/admin/scan: returns 429 with Retry-After when rate-limit bucket is saturated", async () => {
  const ip = "198.51.100.50";
  await primeSaturatedStore(ip, ADMIN_SCAN_WINDOW_MS, ADMIN_SCAN_MAX);

  const routeModule = await import("../route");
  const routeNamespace = routeModule as typeof routeModule & {
    default?: typeof routeModule;
  };
  const { POST } = routeNamespace.default ?? routeNamespace;
  const { NextRequest } = await import("next/server");

  const req = new Request("http://localhost/api/admin/scan", {
    method: "POST",
    headers: {
      "x-forwarded-for": ip,
      authorization: `Bearer ${ADMIN_TOKEN}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ source: "hackernews" }),
  });
  const res = await POST(new NextRequest(req) as never);

  assert.equal(res.status, 429, "expected 429 when bucket saturated");

  const retryAfter = res.headers.get("retry-after");
  assert.ok(
    retryAfter !== null && /^\d+$/.test(retryAfter),
    `Retry-After must be integer seconds, got: ${retryAfter}`,
  );
  assert.ok(
    Number(retryAfter) >= 1,
    `Retry-After should be >= 1 second, got: ${retryAfter}`,
  );

  const body = (await res.json()) as { ok: boolean; error: string };
  assert.equal(body.ok, false, "envelope must be { ok: false, ... }");
  assert.match(body.error, /rate limited/, "error string must mention rate limited");
});
