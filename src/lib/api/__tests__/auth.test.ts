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
  verifyInternalAgentAuth,
  __resetAuthSentryCaptureForTests,
  __setAuthSentryMessageCaptureForTests,
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

test("verifyCronAuth: auth matrix", () => {
  type CronCase = {
    name: string;
    nodeEnv?: string;
    cronSecret?: string;
    authorization?: string;
    expected: "ok" | "unauthorized" | "not_configured";
  };

  const cases: CronCase[] = [
    {
      name: "prod + missing CRON_SECRET -> not_configured",
      nodeEnv: "production",
      expected: "not_configured",
    },
    {
      name: "dev + missing CRON_SECRET -> ok (dev fallback)",
      nodeEnv: "development",
      expected: "ok",
    },
    {
      name: "configured + missing header -> unauthorized",
      nodeEnv: "production",
      cronSecret: "cron-matrix-secret",
      expected: "unauthorized",
    },
    {
      name: "configured + raw header -> ok",
      nodeEnv: "production",
      cronSecret: "cron-matrix-secret",
      authorization: "cron-matrix-secret",
      expected: "ok",
    },
    {
      name: "configured + bearer header -> ok",
      nodeEnv: "production",
      cronSecret: "cron-matrix-secret",
      authorization: "Bearer cron-matrix-secret",
      expected: "ok",
    },
    {
      name: "configured + wrong bearer -> unauthorized",
      nodeEnv: "production",
      cronSecret: "cron-matrix-secret",
      authorization: "Bearer wrong",
      expected: "unauthorized",
    },
    {
      name: "configured + bearer prefix without token -> unauthorized",
      nodeEnv: "production",
      cronSecret: "cron-matrix-secret",
      authorization: "Bearer ",
      expected: "unauthorized",
    },
    {
      name: "configured + malformed bearer (no space) -> unauthorized",
      nodeEnv: "production",
      cronSecret: "cron-matrix-secret",
      authorization: "Bearercron-matrix-secret",
      expected: "unauthorized",
    },
    {
      name: "configured + token stuffing attempt -> unauthorized",
      nodeEnv: "production",
      cronSecret: "cron-matrix-secret",
      authorization: "Bearer cron-matrix-secret extra",
      expected: "unauthorized",
    },
  ];

  for (const c of cases) {
    if (c.nodeEnv === undefined) delete mutableEnv().NODE_ENV;
    else mutableEnv().NODE_ENV = c.nodeEnv;
    if (c.cronSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = c.cronSecret;
    const headers = c.authorization
      ? { authorization: c.authorization }
      : undefined;
    const verdict = verifyCronAuth(makeRequest(headers));
    assert.equal(verdict.kind, c.expected, c.name);
  }
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

test("verifyAdminAuth: blocked when caller IP is in ADMIN_IP_BLOCKLIST", () => {
  process.env.ADMIN_TOKEN = "admin-secret-xyz";
  process.env.ADMIN_IP_BLOCKLIST = "198.51.100.7,203.0.113.9";
  const verdict = verifyAdminAuth(
    makeRequest({
      authorization: "Bearer admin-secret-xyz",
      "x-forwarded-for": "198.51.100.7",
    }),
  );
  assert.equal(verdict.kind, "blocked");
  if (verdict.kind === "blocked") {
    assert.equal(verdict.reason, "ip_blocked");
    assert.equal(verdict.ip, "198.51.100.7");
  }
});

test("verifyAdminAuth: auth matrix", () => {
  type AdminCase = {
    name: string;
    adminToken?: string;
    sessionSecret?: string;
    authorization?: string;
    cookie?: string;
    expected: "ok" | "unauthorized" | "not_configured";
  };

  const validCookie = (() => {
    process.env.SESSION_SECRET = "session-matrix-secret";
    return signAdminSession({ issuedAt: Date.now(), username: "matrix-op" });
  })();

  const cases: AdminCase[] = [
    {
      name: "missing ADMIN_TOKEN + no cookie -> not_configured",
      expected: "not_configured",
    },
    {
      name: "configured + missing auth -> unauthorized",
      adminToken: "admin-matrix-token",
      expected: "unauthorized",
    },
    {
      name: "configured + raw token -> ok",
      adminToken: "admin-matrix-token",
      authorization: "admin-matrix-token",
      expected: "ok",
    },
    {
      name: "configured + bearer token -> ok",
      adminToken: "admin-matrix-token",
      authorization: "Bearer admin-matrix-token",
      expected: "ok",
    },
    {
      name: "configured + wrong bearer token -> unauthorized",
      adminToken: "admin-matrix-token",
      authorization: "Bearer wrong",
      expected: "unauthorized",
    },
    {
      name: "configured + bearer prefix without token -> unauthorized",
      adminToken: "admin-matrix-token",
      authorization: "Bearer ",
      expected: "unauthorized",
    },
    {
      name: "configured + malformed bearer (no space) -> unauthorized",
      adminToken: "admin-matrix-token",
      authorization: "Beareradmin-matrix-token",
      expected: "unauthorized",
    },
    {
      name: "configured + token stuffing attempt -> unauthorized",
      adminToken: "admin-matrix-token",
      authorization: "Bearer admin-matrix-token extra",
      expected: "unauthorized",
    },
    {
      name: "valid signed cookie -> ok",
      adminToken: "admin-matrix-token",
      sessionSecret: "session-matrix-secret",
      cookie: `ss_admin=${validCookie}`,
      expected: "ok",
    },
    {
      name: "tampered cookie + no bearer -> unauthorized",
      adminToken: "admin-matrix-token",
      sessionSecret: "session-matrix-secret",
      cookie: "ss_admin=garbage.value",
      expected: "unauthorized",
    },
  ];

  for (const c of cases) {
    if (c.adminToken === undefined) delete process.env.ADMIN_TOKEN;
    else process.env.ADMIN_TOKEN = c.adminToken;
    if (c.sessionSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = c.sessionSecret;

    const headers: Record<string, string> = {};
    if (c.authorization) headers.authorization = c.authorization;
    if (c.cookie) headers.cookie = c.cookie;

    const verdict = verifyAdminAuth(makeRequest(headers));
    assert.equal(verdict.kind, c.expected, c.name);
  }
});

test("verifyAdminAuth: emits masked admin audit event for bearer success", () => {
  process.env.ADMIN_TOKEN = "admin-secret-xyz";
  const sentryMessages: Array<{ message: string; context: unknown }> = [];
  __setAuthSentryMessageCaptureForTests(((
    message: string,
    context?: unknown,
  ) => {
    sentryMessages.push({ message, context: context ?? null });
    return "evt-admin-audit";
  }) as Parameters<typeof __setAuthSentryMessageCaptureForTests>[0]);
  const verdict = verifyAdminAuth(
    makeRequest({ authorization: "Bearer admin-secret-xyz" }),
  );
  assert.equal(verdict.kind, "ok");
  assert.equal(sentryMessages.length, 1);
  const entry = sentryMessages[0];
  assert.equal(entry.message, "admin_auth_audit");
  const tags = (entry.context as { tags?: Record<string, string> } | null)?.tags;
  const extra = (entry.context as { extra?: Record<string, unknown> } | null)?.extra;
  assert.equal(tags?.source, "admin");
  assert.equal(tags?.category, "recoverable");
  assert.equal(tags?.auth_verdict, "ok");
  assert.equal(extra?.actor_masked, "bearer:admi****-xyz");
});

test("verifyAdminAuth: emits quarantine-tagged audit for unauthorized bearer", () => {
  process.env.ADMIN_TOKEN = "admin-secret-xyz";
  const sentryMessages: Array<{ message: string; context: unknown }> = [];
  __setAuthSentryMessageCaptureForTests(((
    message: string,
    context?: unknown,
  ) => {
    sentryMessages.push({ message, context: context ?? null });
    return "evt-admin-audit-deny";
  }) as Parameters<typeof __setAuthSentryMessageCaptureForTests>[0]);
  const verdict = verifyAdminAuth(
    makeRequest({ authorization: "Bearer wrong-secret" }),
  );
  assert.equal(verdict.kind, "unauthorized");
  assert.equal(sentryMessages.length, 1);
  const entry = sentryMessages[0];
  const tags = (entry.context as { tags?: Record<string, string> } | null)?.tags;
  assert.equal(tags?.source, "admin");
  assert.equal(tags?.category, "quarantine");
  assert.equal(tags?.auth_verdict, "unauthorized");
});

test("verifyInternalAgentAuth: accepts legacy single-token principal map", () => {
  process.env.INTERNAL_AGENT_TOKENS_JSON = JSON.stringify({
    "agent-alpha": "alpha-token-v1",
  });
  delete process.env.CRON_SECRET;

  const verdict = verifyInternalAgentAuth(
    makeRequest({ authorization: "Bearer alpha-token-v1" }),
  );
  assert.equal(verdict.kind, "ok");
  if (verdict.kind === "ok") {
    assert.equal(verdict.principal, "agent-alpha");
  }
});

test("verifyInternalAgentAuth: accepts multi-token-per-agent rotation array", () => {
  process.env.INTERNAL_AGENT_TOKENS_JSON = JSON.stringify({
    "agent-rotate": ["new-token-v2", "old-token-v1"],
  });

  const newVerdict = verifyInternalAgentAuth(
    makeRequest({ authorization: "Bearer new-token-v2" }),
  );
  assert.equal(newVerdict.kind, "ok");
  if (newVerdict.kind === "ok") {
    assert.equal(newVerdict.principal, "agent-rotate");
  }

  const oldVerdict = verifyInternalAgentAuth(
    makeRequest({ authorization: "Bearer old-token-v1" }),
  );
  assert.equal(oldVerdict.kind, "ok");
  if (oldVerdict.kind === "ok") {
    assert.equal(oldVerdict.principal, "agent-rotate");
  }
});

test("verifyInternalAgentAuth: rotation drill accepts overlap then revokes old token", () => {
  process.env.INTERNAL_AGENT_TOKENS_JSON = JSON.stringify({
    "agent-drill": ["drill-new-v2", "drill-old-v1"],
  });

  const overlapOld = verifyInternalAgentAuth(
    makeRequest({ authorization: "Bearer drill-old-v1" }),
  );
  const overlapNew = verifyInternalAgentAuth(
    makeRequest({ authorization: "Bearer drill-new-v2" }),
  );
  assert.equal(overlapOld.kind, "ok");
  assert.equal(overlapNew.kind, "ok");

  // Revoke old token by removing it from the configured array.
  process.env.INTERNAL_AGENT_TOKENS_JSON = JSON.stringify({
    "agent-drill": ["drill-new-v2"],
  });

  const revokedOld = verifyInternalAgentAuth(
    makeRequest({ authorization: "Bearer drill-old-v1" }),
  );
  const stillValidNew = verifyInternalAgentAuth(
    makeRequest({ authorization: "Bearer drill-new-v2" }),
  );
  assert.equal(revokedOld.kind, "unauthorized");
  assert.equal(stillValidNew.kind, "ok");
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

test("adminAuthFailureResponse: blocked emits quarantine-tagged Sentry event", async () => {
  const sentryCalls: Array<{ error: unknown; context: unknown }> = [];
  __setAuthSentryCaptureForTests(((
    error: unknown,
    context?: unknown,
  ) => {
    sentryCalls.push({ error, context: context ?? null });
    return "evt-ip-blocked";
  }) as Parameters<typeof __setAuthSentryCaptureForTests>[0]);

  const response = adminAuthFailureResponse({
    kind: "blocked",
    reason: "ip_blocked",
    ip: "198.51.100.7",
  });
  assert.ok(response);
  assert.equal(response!.status, 403);
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
