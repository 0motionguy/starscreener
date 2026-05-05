import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { NextRequest } from "next/server";
import { sourceHealthTracker } from "@/lib/source-health-tracker";
import { signAdminSession } from "@/lib/api/admin-session";

const ORIGINAL_ENV = { ...process.env };

function makeRequest(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(
    new Request("http://localhost/api/health/sources", { headers }),
  );
}

afterEach(() => {
  sourceHealthTracker.reset();
  process.env = { ...ORIGINAL_ENV };
});

test("GET /api/health/sources: unauthenticated callers get stripped summary", async () => {
  Object.assign(process.env, { NODE_ENV: "production" });
  process.env.CRON_SECRET = "cron-secret-test-fixture";
  delete process.env.ADMIN_TOKEN;

  const injectedSecret = "Bearer sk-live-agn407-secret";
  const injectedInternalUrl = "https://internal.example.local/admin/token";
  sourceHealthTracker.recordFailure(
    "github",
    `upstream failed ${injectedSecret} ${injectedInternalUrl}`,
  );

  const { GET } = await import("../route");
  const res = await GET(makeRequest());

  assert.equal(res.status, 200);
  const body = (await res.json()) as Record<string, unknown>;
  assert.equal(typeof body.fetchedAt, "string");
  assert.equal("summary" in body, true);
  assert.equal("sources" in body, true);
  assert.equal("options" in body, false);

  const serialized = JSON.stringify(body);
  assert.equal(serialized.includes(injectedSecret), false);
  assert.equal(serialized.includes(injectedInternalUrl), false);
  assert.equal(serialized.includes("sk-live"), false);
  assert.equal(serialized.includes("redis://"), false);
  assert.equal(serialized.includes("admin"), false);
});

test("GET /api/health/sources?detail=1: accepts valid admin cookie auth", async () => {
  Object.assign(process.env, { NODE_ENV: "production" });
  process.env.CRON_SECRET = "cron-secret-test-fixture";
  process.env.ADMIN_TOKEN = "admin-token-test-fixture";
  process.env.SESSION_SECRET = "session-secret-test-fixture";
  const adminCookie = signAdminSession({
    issuedAt: Date.now(),
    username: "sal",
  });

  const { GET } = await import("../route");
  const res = await GET(
    new NextRequest(
      new Request("http://localhost/api/health/sources?detail=1", {
        headers: { cookie: `ss_admin=${adminCookie}` },
      }),
    ),
  );

  assert.notEqual(res.status, 401);
  const body = (await res.json()) as Record<string, unknown>;
  assert.equal("sources" in body, true);
  assert.equal("options" in body, true);
});

test("GET /api/health/sources?detail=1: unauthenticated callers stay on stripped public payload", async () => {
  Object.assign(process.env, { NODE_ENV: "production" });
  process.env.CRON_SECRET = "cron-secret-test-fixture";
  delete process.env.ADMIN_TOKEN;

  const { GET } = await import("../route");
  const res = await GET(
    new NextRequest(
      new Request("http://localhost/api/health/sources?detail=1"),
    ),
  );

  assert.equal(res.status, 200);
  const body = (await res.json()) as Record<string, unknown>;
  assert.equal("summary" in body, true);
  assert.equal("sources" in body, true);
  assert.equal("options" in body, false);
  const sourceView = (body.sources as Record<string, Record<string, unknown>>).github;
  assert.equal("lastFailure" in sourceView, false);
  assert.equal("openedAt" in sourceView, false);
  assert.equal("nextProbeAt" in sourceView, false);
});
