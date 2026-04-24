// StarScreener — Route-level rate-limit tests for the three endpoints
// migrated off the sync limiter in Wave 8:
//   - POST /api/pipeline/refresh
//   - GET  /api/twitter/leaderboard
//   - GET  /api/twitter/repos/[owner]/[name]
//
// These tests verify the 429 path only: we inject a MemoryRateLimitStore
// pre-filled past the advertised max, issue one request, and assert both
// status=429 and the full 4-header bundle
// (X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, Retry-After).
//
// Running the 2xx path on these routes would require seeding the pipeline
// + twitter store fixtures, which is out of scope for a rate-limit migration.
// Those 2xx paths are covered by the broader pipeline/twitter test suites.
//
// Run:
//   npx tsx --test src/lib/pipeline/__tests__/rate-limit-routes.test.ts

import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";

import {
  _setStoreForTests,
} from "../../api/rate-limit";
import {
  MemoryRateLimitStore,
  _resetFallbackWarningForTests,
} from "../../api/rate-limit-store";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Inject a memory store whose bucket for (ip, windowMs, maxRequests) is
 * already saturated. The next checkRateLimitAsync call will go to count =
 * maxRequests + 1 → allowed=false.
 */
async function primeSaturatedStore(
  ip: string,
  windowMs: number,
  maxRequests: number,
): Promise<MemoryRateLimitStore> {
  const store = new MemoryRateLimitStore();
  const ttlSec = Math.max(1, Math.ceil(windowMs / 1000));
  const key = `rl:${ip}:${windowMs}:${maxRequests}`;
  for (let i = 0; i < maxRequests; i += 1) {
    await store.incrementWithTtl(key, ttlSec);
  }
  _setStoreForTests(store);
  return store;
}

function assert429Headers(res: Response, expectedLimit: number): void {
  assert.equal(res.status, 429, "expected 429 status");
  const limitHeader = res.headers.get("x-ratelimit-limit");
  const remainingHeader = res.headers.get("x-ratelimit-remaining");
  const resetHeader = res.headers.get("x-ratelimit-reset");
  const retryAfterHeader = res.headers.get("retry-after");
  assert.equal(limitHeader, String(expectedLimit), "X-RateLimit-Limit mismatch");
  assert.equal(remainingHeader, "0", "X-RateLimit-Remaining should be 0");
  assert.ok(
    resetHeader !== null && /^\d+$/.test(resetHeader),
    `X-RateLimit-Reset must be unix seconds, got: ${resetHeader}`,
  );
  const resetSec = Number(resetHeader);
  const nowSec = Math.floor(Date.now() / 1000);
  assert.ok(
    resetSec >= nowSec,
    `X-RateLimit-Reset (${resetSec}) should be >= now (${nowSec})`,
  );
  assert.ok(
    retryAfterHeader !== null && /^\d+$/.test(retryAfterHeader),
    `Retry-After must be seconds, got: ${retryAfterHeader}`,
  );
  assert.ok(Number(retryAfterHeader) >= 1, "Retry-After should be >= 1");
}

beforeEach(() => {
  _setStoreForTests(null);
  _resetFallbackWarningForTests();
});

// ---------------------------------------------------------------------------
// POST /api/pipeline/refresh
// ---------------------------------------------------------------------------

test("POST /api/pipeline/refresh: returns 429 with all 4 rate-limit headers when limit exceeded", async () => {
  const ip = "198.51.100.10";
  const windowMs = 60_000;
  const maxRequests = 1;
  await primeSaturatedStore(ip, windowMs, maxRequests);

  const { POST } = await import("../../../app/api/pipeline/refresh/route");
  const req = new Request("http://localhost/api/pipeline/refresh", {
    method: "POST",
    headers: { "x-forwarded-for": ip },
  });
  const res = await POST(req as never);

  assert429Headers(res, maxRequests);
  const body = (await res.json()) as { ok: boolean; error: string; retryAfterSec?: number };
  assert.equal(body.ok, false);
  assert.match(body.error, /rate limited/);
  assert.ok(
    typeof body.retryAfterSec === "number" && body.retryAfterSec >= 1,
    "retryAfterSec should be present and >= 1",
  );
});

// ---------------------------------------------------------------------------
// GET /api/twitter/leaderboard
// ---------------------------------------------------------------------------

test("GET /api/twitter/leaderboard: returns 429 with all 4 rate-limit headers when limit exceeded", async () => {
  const ip = "198.51.100.20";
  const windowMs = 60_000;
  const maxRequests = 60;
  await primeSaturatedStore(ip, windowMs, maxRequests);

  const { GET } = await import("../../../app/api/twitter/leaderboard/route");
  const req = new Request(
    "http://localhost/api/twitter/leaderboard?mode=trending&limit=10",
    {
      method: "GET",
      headers: { "x-forwarded-for": ip },
    },
  );
  // NextRequest is structurally compatible for the code under test — we
  // only exercise .nextUrl.searchParams + .headers, both of which Request
  // synthesizes via Next's own wrapping internally when the handler runs.
  // In direct invocation we rely on NextRequest coercion, which works
  // because NextRequest(request) accepts a plain Request.
  const { NextRequest } = await import("next/server");
  const res = await GET(new NextRequest(req) as never);

  assert429Headers(res, maxRequests);
  const body = (await res.json()) as { error: string };
  assert.match(body.error, /rate limit exceeded/);
});

// ---------------------------------------------------------------------------
// GET /api/twitter/repos/[owner]/[name]
// ---------------------------------------------------------------------------

test("GET /api/twitter/repos/[owner]/[name]: returns 429 with all 4 rate-limit headers when limit exceeded", async () => {
  const ip = "198.51.100.30";
  const windowMs = 60_000;
  const maxRequests = 60;
  await primeSaturatedStore(ip, windowMs, maxRequests);

  const { GET } = await import(
    "../../../app/api/twitter/repos/[owner]/[name]/route"
  );
  const req = new Request(
    "http://localhost/api/twitter/repos/vercel/next.js",
    {
      method: "GET",
      headers: { "x-forwarded-for": ip },
    },
  );
  const { NextRequest } = await import("next/server");
  const res = await GET(new NextRequest(req) as never, {
    params: Promise.resolve({ owner: "vercel", name: "next.js" }),
  });

  assert429Headers(res, maxRequests);
  const body = (await res.json()) as { error: string };
  assert.match(body.error, /rate limit exceeded/);
});

// ---------------------------------------------------------------------------
// Memory fallback path still works when no store is injected (i.e. when
// Upstash env is unset in dev/preview). We don't need to set env vars here
// — _setStoreForTests(null) reverts to the default getStore() path, which
// calls createStore() with process.env. In the test process neither Upstash
// env var is set, so it falls back to memory and the limiter still fires.
// ---------------------------------------------------------------------------

test("memory fallback: refresh route still enforces 429 without Upstash env", async () => {
  // Leave _setStoreForTests(null) from beforeEach. Issue 2 back-to-back
  // requests from the same IP — max=1 so the second must be blocked.
  const { POST } = await import("../../../app/api/pipeline/refresh/route");
  const ip = "198.51.100.40";

  const req1 = new Request("http://localhost/api/pipeline/refresh", {
    method: "POST",
    headers: { "x-forwarded-for": ip },
  });
  // The first call may succeed (if pipeline ready) or 500 (if pipeline
  // fixtures missing). Either way it consumes the single available token.
  // Swallow and move on — we're testing the limiter, not the pipeline.
  try {
    await POST(req1 as never);
  } catch {
    // ignore
  }

  const req2 = new Request("http://localhost/api/pipeline/refresh", {
    method: "POST",
    headers: { "x-forwarded-for": ip },
  });
  const res = await POST(req2 as never);
  assert429Headers(res, 1);
});
