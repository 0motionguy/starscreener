import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

import { __resetMiddlewareRateLimitForTests, middleware } from "@/middleware";

function makeRequest(pathname: string, forwardedFor = "198.51.100.7"): NextRequest {
  return new NextRequest(`https://trendingrepo.com${pathname}`, {
    headers: { "x-forwarded-for": forwardedFor },
  });
}

test("middleware rate-limits /api/admin after the fixed-window threshold", async () => {
  __resetMiddlewareRateLimitForTests();

  let lastStatus = 200;
  for (let i = 0; i < 61; i += 1) {
    const response = await middleware(makeRequest("/api/admin/stats"));
    lastStatus = response.status;
  }

  assert.equal(lastStatus, 429);
});

test("middleware enforces /api/pipeline and /api/worker independently", async () => {
  __resetMiddlewareRateLimitForTests();

  let pipelineStatus = 200;
  for (let i = 0; i < 91; i += 1) {
    pipelineStatus = (await middleware(makeRequest("/api/pipeline/status"))).status;
  }
  assert.equal(pipelineStatus, 429);

  let workerStatus = 200;
  for (let i = 0; i < 121; i += 1) {
    workerStatus = (await middleware(makeRequest("/api/worker/sync"))).status;
  }
  assert.equal(workerStatus, 429);
});

test("middleware blocks known blocklist IP on protected routes", async () => {
  __resetMiddlewareRateLimitForTests();
  const originalFetch = global.fetch;
  global.fetch = (async () =>
    new Response("167.94.138.0/24 AS398324 CENSYS\n", { status: 200 })) as typeof fetch;
  try {
    const response = await middleware(makeRequest("/api/admin/stats", "167.94.138.44"));
    assert.equal(response.status, 403);
  } finally {
    global.fetch = originalFetch;
  }
});

test("middleware skips non-targeted paths", async () => {
  __resetMiddlewareRateLimitForTests();
  const response = await middleware(makeRequest("/api/health"));
  assert.equal(response.status, 200);
});
