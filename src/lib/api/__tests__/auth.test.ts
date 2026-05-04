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
  adminAuthFailureResponse,
  internalAgentAuthFailureResponse,
  userAuthFailureResponse,
  verifyAdminAuth,
  verifyCronAuth,
  __resetAuthSentryCaptureForTests,
  __setAuthSentryCaptureForTests,
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
  __resetAuthSentryCaptureForTests();
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

test("adminAuthFailureResponse: unauthorized emits quarantine-tagged Sentry event", async () => {
  const sentryCalls: Array<{ error: unknown; context: unknown }> = [];
  __setAuthSentryCaptureForTests(((
    error: unknown,
    context?: unknown,
  ) => {
    sentryCalls.push({ error, context: context ?? null });
    return "evt-unauth";
  }) as Parameters<typeof __setAuthSentryCaptureForTests>[0]);

  const response = adminAuthFailureResponse({ kind: "unauthorized" });
  assert.ok(response);
  assert.equal(response!.status, 401);
  assert.equal(sentryCalls.length, 1);
  const tags = (sentryCalls[0].context as { tags?: Record<string, string> } | null)?.tags;
  assert.equal(tags?.source, "admin");
  assert.equal(tags?.category, "quarantine");
  assert.equal(tags?.auth_surface, "admin");
});

test("adminAuthFailureResponse: not_configured emits fatal-tagged Sentry event", async () => {
  const sentryCalls: Array<{ error: unknown; context: unknown }> = [];
  __setAuthSentryCaptureForTests(((
    error: unknown,
    context?: unknown,
  ) => {
    sentryCalls.push({ error, context: context ?? null });
    return "evt-missing-admin-token";
  }) as Parameters<typeof __setAuthSentryCaptureForTests>[0]);

  const response = adminAuthFailureResponse({ kind: "not_configured" });
  assert.ok(response);
  assert.equal(response!.status, 503);
  assert.equal(sentryCalls.length, 1);
  const tags = (sentryCalls[0].context as { tags?: Record<string, string> } | null)?.tags;
  assert.equal(tags?.source, "admin");
  assert.equal(tags?.category, "fatal");
  assert.equal(tags?.auth_surface, "admin");
});

test("userAuthFailureResponse: unauthorized emits quarantine-tagged Sentry event", () => {
  const sentryCalls: Array<{ error: unknown; context: unknown }> = [];
  __setAuthSentryCaptureForTests(((error: unknown, context?: unknown) => {
    sentryCalls.push({ error, context: context ?? null });
    return "evt-user-unauth";
  }) as Parameters<typeof __setAuthSentryCaptureForTests>[0]);

  const response = userAuthFailureResponse({ kind: "unauthorized" });
  assert.ok(response);
  assert.equal(response!.status, 401);
  assert.equal(sentryCalls.length, 1);
  const tags = (sentryCalls[0].context as { tags?: Record<string, string> } | null)?.tags;
  assert.equal(tags?.source, "auth");
  assert.equal(tags?.category, "quarantine");
  assert.equal(tags?.auth_surface, "user");
});

test("userAuthFailureResponse: not_configured emits fatal-tagged Sentry event", () => {
  const sentryCalls: Array<{ error: unknown; context: unknown }> = [];
  __setAuthSentryCaptureForTests(((error: unknown, context?: unknown) => {
    sentryCalls.push({ error, context: context ?? null });
    return "evt-user-config";
  }) as Parameters<typeof __setAuthSentryCaptureForTests>[0]);

  const response = userAuthFailureResponse({ kind: "not_configured" });
  assert.ok(response);
  assert.equal(response!.status, 503);
  assert.equal(sentryCalls.length, 1);
  const tags = (sentryCalls[0].context as { tags?: Record<string, string> } | null)?.tags;
  assert.equal(tags?.source, "auth");
  assert.equal(tags?.category, "fatal");
  assert.equal(tags?.auth_surface, "user");
});

test("internalAgentAuthFailureResponse: unauthorized emits quarantine-tagged Sentry event", () => {
  const sentryCalls: Array<{ error: unknown; context: unknown }> = [];
  __setAuthSentryCaptureForTests(((error: unknown, context?: unknown) => {
    sentryCalls.push({ error, context: context ?? null });
    return "evt-agent-unauth";
  }) as Parameters<typeof __setAuthSentryCaptureForTests>[0]);

  const response = internalAgentAuthFailureResponse({ kind: "unauthorized" });
  assert.ok(response);
  assert.equal(response!.status, 401);
  assert.equal(sentryCalls.length, 1);
  const tags = (sentryCalls[0].context as { tags?: Record<string, string> } | null)?.tags;
  assert.equal(tags?.source, "auth");
  assert.equal(tags?.category, "quarantine");
  assert.equal(tags?.auth_surface, "internal-agent");
});

test("internalAgentAuthFailureResponse: not_configured emits fatal-tagged Sentry event", () => {
  const sentryCalls: Array<{ error: unknown; context: unknown }> = [];
  __setAuthSentryCaptureForTests(((error: unknown, context?: unknown) => {
    sentryCalls.push({ error, context: context ?? null });
    return "evt-agent-config";
  }) as Parameters<typeof __setAuthSentryCaptureForTests>[0]);

  const response = internalAgentAuthFailureResponse({ kind: "not_configured" });
  assert.ok(response);
  assert.equal(response!.status, 503);
  assert.equal(sentryCalls.length, 1);
  const tags = (sentryCalls[0].context as { tags?: Record<string, string> } | null)?.tags;
  assert.equal(tags?.source, "auth");
  assert.equal(tags?.category, "fatal");
  assert.equal(tags?.auth_surface, "internal-agent");
});
