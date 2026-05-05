import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = global.fetch;

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  process.env.ADMIN_TOKEN = "admin-token-test-fixture";
  process.env.CRON_SECRET = "cron-secret-test-fixture";
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  global.fetch = ORIGINAL_FETCH;
});

function makePostRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/admin/queues/repo", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.ADMIN_TOKEN}`,
    },
    body: JSON.stringify(body),
  });
}

test("POST /api/admin/queues/repo masks internal fetch error details", async () => {
  global.fetch = (async () => {
    throw new Error("sensitive: token=ghp_very_secret_value");
  }) as typeof global.fetch;

  const { POST } = await import("../route");
  const res = await POST(makePostRequest({ drain: true }));
  const body = (await res.json()) as { ok: boolean; error: string };

  assert.equal(res.status, 500);
  assert.equal(body.ok, false);
  assert.equal(body.error, "drain call failed");
  assert.equal(body.error.includes("ghp_very_secret_value"), false);
});
