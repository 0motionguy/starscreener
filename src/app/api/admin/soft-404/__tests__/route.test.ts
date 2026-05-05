import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { NextRequest } from "next/server";

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = global.fetch;

function makeRequest(path = "/api/admin/soft-404"): NextRequest {
  return new NextRequest(
    new Request(`http://localhost${path}`, {
      headers: { authorization: "Bearer admin-token-test-fixture" },
    }),
  );
}

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV, ADMIN_TOKEN: "admin-token-test-fixture" };
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  global.fetch = ORIGINAL_FETCH;
});

test("GET /api/admin/soft-404 returns ok report when no soft-404 markers are present", async () => {
  global.fetch = async () =>
    new Response("<html><title>Home</title><body>Trending repos dashboard</body></html>", {
      status: 200,
    });

  const { GET } = await import("../route");
  const response = await GET(makeRequest("/api/admin/soft-404?paths=/"));
  const body = (await response.json()) as {
    ok: boolean;
    soft404Count: number;
    routes: Array<{ path: string; soft404: boolean }>;
  };

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.soft404Count, 0);
  assert.equal(body.routes[0]?.path, "/");
  assert.equal(body.routes[0]?.soft404, false);
});

test("GET /api/admin/soft-404 returns SOFT_404_DETECTED on 2xx responses with markers", async () => {
  global.fetch = async () =>
    new Response("<html><body>Page not found</body></html>", { status: 200 });

  const { GET } = await import("../route");
  const response = await GET(makeRequest("/api/admin/soft-404?paths=/ghost"));
  const body = (await response.json()) as { ok: boolean; code?: string; error: string };

  assert.equal(response.status, 503);
  assert.equal(body.ok, false);
  assert.equal(body.code, "SOFT_404_DETECTED");
  assert.equal(body.error, "soft-404 markers detected");
});

test("GET /api/admin/soft-404 returns SOFT_404_PROBE_FAILED on probe fetch failure", async () => {
  global.fetch = async () => {
    throw new Error("network down");
  };

  const { GET } = await import("../route");
  const response = await GET(makeRequest("/api/admin/soft-404?paths=/"));
  const body = (await response.json()) as { ok: boolean; code?: string; error: string };

  assert.equal(response.status, 500);
  assert.equal(body.ok, false);
  assert.equal(body.code, "SOFT_404_PROBE_FAILED");
  assert.equal(body.error, "soft-404 probe failed");
});
