import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

const ORIGINAL_ENV = { ...process.env };

function makeRequest(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(
    new Request("http://localhost/api/admin/pool-state", { headers }),
  );
}

beforeEach(() => {
  delete process.env.ADMIN_TOKEN;
  delete process.env.CRON_SECRET;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

test("GET /api/admin/pool-state: 503 when ADMIN_TOKEN is not configured", async () => {
  const { GET } = await import("../route");
  const res = await GET(makeRequest());

  assert.equal(res.status, 503);
  const body = (await res.json()) as { ok: boolean; error: string; code: string };
  assert.equal(body.ok, false);
  assert.match(body.error, /ADMIN_TOKEN unset/);
  assert.equal(body.code, "NOT_CONFIGURED");
});

test("GET /api/admin/pool-state: 401 when ADMIN_TOKEN is configured but auth is missing", async () => {
  process.env.ADMIN_TOKEN = "admin-token-test-fixture";
  const { GET } = await import("../route");
  const res = await GET(makeRequest());

  assert.equal(res.status, 401);
  const body = (await res.json()) as { ok: boolean; error: string; code: string };
  assert.equal(body.ok, false);
  assert.equal(body.error, "unauthorized");
  assert.equal(body.code, "UNAUTHORIZED");
});

test("GET /api/admin/pool-state: 401 on wrong bearer token", async () => {
  process.env.ADMIN_TOKEN = "admin-token-test-fixture";
  const { GET } = await import("../route");
  const res = await GET(
    makeRequest({ authorization: "Bearer definitely-wrong-token" }),
  );

  assert.equal(res.status, 401);
  const body = (await res.json()) as { ok: boolean; error: string; code: string };
  assert.equal(body.ok, false);
  assert.equal(body.error, "unauthorized");
  assert.equal(body.code, "UNAUTHORIZED");
});

test("GET /api/admin/pool-state: CRON_SECRET is never accepted as admin auth", async () => {
  process.env.ADMIN_TOKEN = "admin-token-test-fixture";
  process.env.CRON_SECRET = "cron-secret-test-fixture";
  const { GET } = await import("../route");
  const res = await GET(
    makeRequest({ authorization: "Bearer cron-secret-test-fixture" }),
  );

  assert.equal(res.status, 401);
  const body = (await res.json()) as { ok: boolean; error: string; code: string };
  assert.equal(body.ok, false);
  assert.equal(body.error, "unauthorized");
  assert.equal(body.code, "UNAUTHORIZED");
});
