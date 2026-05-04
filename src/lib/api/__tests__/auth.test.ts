// Coverage for verifyAdminAuth + verifyCronAuth happy/sad paths.
//
// Exercises:
//   - verifyCronAuth      → ok / unauthorized / not_configured
//   - verifyAdminAuth     → ok via cookie, ok via bearer, unauthorized,
//                            not_configured
//
// node:test + assert/strict — same pattern as repo-profile.test.ts.
//
// Run:
//   npx tsx --test src/lib/api/__tests__/auth.test.ts

import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

import {
  verifyAdminAuth,
  verifyCronAuth,
  __resetAuthWarningsForTests,
} from "../auth";
import { signAdminSession } from "../admin-session";

const ORIGINAL_ENV = { ...process.env };

function makeRequest(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(
    new Request("http://localhost/api/test", { headers }),
  );
}

function mutableEnv(): Record<string, string | undefined> {
  return process.env as Record<string, string | undefined>;
}

beforeEach(() => {
  // Wipe the auth-related env so each test starts from a known floor.
  delete process.env.CRON_SECRET;
  delete process.env.ADMIN_TOKEN;
  delete process.env.SESSION_SECRET;
  delete mutableEnv().NODE_ENV;
  __resetAuthWarningsForTests();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  __resetAuthWarningsForTests();
});

// ---------------------------------------------------------------------------
// verifyCronAuth
// ---------------------------------------------------------------------------

test("verifyCronAuth: not_configured when CRON_SECRET unset in production", () => {
  mutableEnv().NODE_ENV = "production";
  const verdict = verifyCronAuth(makeRequest());
  assert.equal(verdict.kind, "not_configured");
});

test("verifyCronAuth: ok in dev when CRON_SECRET unset (developer fallback)", () => {
  mutableEnv().NODE_ENV = "development";
  const verdict = verifyCronAuth(makeRequest());
  assert.equal(verdict.kind, "ok");
});

test("verifyCronAuth: ok with raw Authorization secret", () => {
  process.env.CRON_SECRET = "supersecret-123";
  const verdict = verifyCronAuth(
    makeRequest({ authorization: "supersecret-123" }),
  );
  assert.equal(verdict.kind, "ok");
});

test("verifyCronAuth: ok with Bearer-prefixed Authorization secret", () => {
  process.env.CRON_SECRET = "supersecret-123";
  const verdict = verifyCronAuth(
    makeRequest({ authorization: "Bearer supersecret-123" }),
  );
  assert.equal(verdict.kind, "ok");
});

test("verifyCronAuth: unauthorized when Authorization missing", () => {
  process.env.CRON_SECRET = "supersecret-123";
  const verdict = verifyCronAuth(makeRequest());
  assert.equal(verdict.kind, "unauthorized");
});

test("verifyCronAuth: unauthorized on wrong secret (raw)", () => {
  process.env.CRON_SECRET = "supersecret-123";
  const verdict = verifyCronAuth(
    makeRequest({ authorization: "wrong-token" }),
  );
  assert.equal(verdict.kind, "unauthorized");
});

test("verifyCronAuth: unauthorized on wrong secret (Bearer)", () => {
  process.env.CRON_SECRET = "supersecret-123";
  const verdict = verifyCronAuth(
    makeRequest({ authorization: "Bearer wrong-token" }),
  );
  assert.equal(verdict.kind, "unauthorized");
});

// ---------------------------------------------------------------------------
// verifyAdminAuth
// ---------------------------------------------------------------------------

test("verifyAdminAuth: not_configured when ADMIN_TOKEN unset and no valid cookie", () => {
  const verdict = verifyAdminAuth(makeRequest());
  assert.equal(verdict.kind, "not_configured");
});

test("verifyAdminAuth: unauthorized when ADMIN_TOKEN set but no Authorization header", () => {
  process.env.ADMIN_TOKEN = "admin-secret-xyz";
  const verdict = verifyAdminAuth(makeRequest());
  assert.equal(verdict.kind, "unauthorized");
});

test("verifyAdminAuth: ok with raw Authorization admin token", () => {
  process.env.ADMIN_TOKEN = "admin-secret-xyz";
  const verdict = verifyAdminAuth(
    makeRequest({ authorization: "admin-secret-xyz" }),
  );
  assert.equal(verdict.kind, "ok");
});

test("verifyAdminAuth: ok with Bearer-prefixed admin token", () => {
  process.env.ADMIN_TOKEN = "admin-secret-xyz";
  const verdict = verifyAdminAuth(
    makeRequest({ authorization: "Bearer admin-secret-xyz" }),
  );
  assert.equal(verdict.kind, "ok");
});

test("verifyAdminAuth: unauthorized on wrong admin token", () => {
  process.env.ADMIN_TOKEN = "admin-secret-xyz";
  const verdict = verifyAdminAuth(
    makeRequest({ authorization: "Bearer not-the-token" }),
  );
  assert.equal(verdict.kind, "unauthorized");
});

test("verifyAdminAuth: ok via valid ss_admin signed cookie (no bearer needed)", () => {
  process.env.SESSION_SECRET = "session-secret-abc";
  process.env.ADMIN_TOKEN = "admin-secret-xyz";
  const cookie = signAdminSession({
    issuedAt: Date.now(),
    username: "operator",
  });
  const verdict = verifyAdminAuth(
    makeRequest({ cookie: `ss_admin=${cookie}` }),
  );
  assert.equal(verdict.kind, "ok");
});

test("verifyAdminAuth: cookie path falls through to bearer when signature invalid", () => {
  process.env.SESSION_SECRET = "session-secret-abc";
  process.env.ADMIN_TOKEN = "admin-secret-xyz";
  // Tampered cookie value — verifyAdminSession returns null, falls through.
  const verdict = verifyAdminAuth(
    makeRequest({
      cookie: "ss_admin=garbage.value",
      authorization: "Bearer admin-secret-xyz",
    }),
  );
  assert.equal(verdict.kind, "ok");
});

test("verifyAdminAuth: tampered cookie with no bearer → unauthorized", () => {
  process.env.SESSION_SECRET = "session-secret-abc";
  process.env.ADMIN_TOKEN = "admin-secret-xyz";
  const verdict = verifyAdminAuth(
    makeRequest({ cookie: "ss_admin=garbage.value" }),
  );
  assert.equal(verdict.kind, "unauthorized");
});
