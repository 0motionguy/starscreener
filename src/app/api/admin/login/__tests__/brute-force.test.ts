import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { NextRequest } from "next/server";

import { POST as issueAdminSession } from "@/app/api/admin/login/route";

const ORIGINAL_ENV = { ...process.env };

function mutableEnv(): Record<string, string | undefined> {
  return process.env as Record<string, string | undefined>;
}

function resetAuthEnv(): void {
  delete mutableEnv().SESSION_SECRET;
  delete mutableEnv().ADMIN_USERNAME;
  delete mutableEnv().ADMIN_PASSWORD;
  delete mutableEnv().ADMIN_TOTP_SECRET;
  delete mutableEnv().NODE_ENV;
}

beforeEach(() => {
  resetAuthEnv();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

function makeBadLoginRequest(ip: string): NextRequest {
  return new NextRequest("http://localhost/api/admin/login", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": ip,
    },
    body: JSON.stringify({
      username: "operator",
      password: "wrong-password",
      otp: "000000",
    }),
  });
}

test("POST /api/admin/login locks brute-force bursts at 5/min per IP", async () => {
  mutableEnv().NODE_ENV = "production";
  mutableEnv().SESSION_SECRET = "session-secret-cookie-hardening-test";
  mutableEnv().ADMIN_USERNAME = "operator";
  mutableEnv().ADMIN_PASSWORD = "super-secret-password";
  mutableEnv().ADMIN_TOTP_SECRET = "JBSWY3DPEHPK3PXP";

  const ip = "198.51.100.31";
  let responseStatus = 0;
  let responseBody: { ok: false; reason: string; error?: string } | null = null;
  let retryAfter: string | null = null;

  for (let i = 0; i < 6; i += 1) {
    const response = await issueAdminSession(makeBadLoginRequest(ip));
    responseStatus = response.status;
    responseBody = (await response.json()) as {
      ok: false;
      reason: string;
      error?: string;
    };
    retryAfter = response.headers.get("Retry-After");
    if (responseStatus === 429) break;
  }

  assert.equal(responseStatus, 429);
  assert.equal(responseBody?.ok, false);
  assert.equal(responseBody?.reason, "rate_limited");
  assert.equal(responseBody?.error, "too many login attempts; try again shortly");
  assert.ok(retryAfter !== null && Number(retryAfter) >= 1);
});

test("POST /api/admin/login applies escalation lockout by attempt 21", async () => {
  mutableEnv().NODE_ENV = "production";
  mutableEnv().SESSION_SECRET = "session-secret-cookie-hardening-test";
  mutableEnv().ADMIN_USERNAME = "operator";
  mutableEnv().ADMIN_PASSWORD = "super-secret-password";
  mutableEnv().ADMIN_TOTP_SECRET = "JBSWY3DPEHPK3PXP";

  const ip = "198.51.100.32";
  let lastStatus = 0;
  let lastBody: { ok: false; reason: string; error?: string } | null = null;

  for (let i = 0; i < 21; i += 1) {
    const response = await issueAdminSession(makeBadLoginRequest(ip));
    lastStatus = response.status;
    lastBody = (await response.json()) as {
      ok: false;
      reason: string;
      error?: string;
    };
  }

  assert.equal(lastStatus, 429);
  assert.equal(lastBody?.ok, false);
  assert.equal(lastBody?.reason, "rate_limited");
  assert.equal(lastBody?.error, "admin login temporarily locked; try again later");
});
