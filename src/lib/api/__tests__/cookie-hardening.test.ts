import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { afterEach, beforeEach, test } from "node:test";
import { NextRequest } from "next/server";

import { POST as issueUserSession } from "@/app/api/auth/session/route";
import {
  DELETE as clearAdminSession,
  POST as issueAdminSession,
} from "@/app/api/admin/login/route";

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

function base32Decode(raw: string): Buffer {
  const normalized = raw.toUpperCase().replace(/[\s-]/g, "").replace(/=+$/g, "");
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const ch of normalized) {
    const idx = alphabet.indexOf(ch);
    if (idx === -1) throw new Error("invalid base32 test secret");
    value = (value << 5) | idx;
    bits += 5;
    while (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function totpForNow(secretBase32: string): string {
  const secret = base32Decode(secretBase32);
  const counter = Math.floor(Date.now() / 1000 / 30);
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", secret).update(counterBuf).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const code =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(code % 1_000_000).padStart(6, "0");
}

beforeEach(() => {
  resetAuthEnv();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

test("POST /api/auth/session sets hardened ss_user cookie in production", async () => {
  mutableEnv().NODE_ENV = "production";
  mutableEnv().SESSION_SECRET = "session-secret-cookie-hardening-test";

  const request = new NextRequest("http://localhost/api/auth/session", {
    method: "POST",
  });
  const response = await issueUserSession(request);
  assert.equal(response.status, 200);

  const setCookie = response.headers.get("set-cookie") ?? "";
  assert.match(setCookie, /ss_user=/);
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=Lax/i);
  assert.match(setCookie, /Secure/i);
});

test("POST /api/admin/login sets hardened ss_admin cookie in production", async () => {
  mutableEnv().NODE_ENV = "production";
  mutableEnv().SESSION_SECRET = "session-secret-cookie-hardening-test";
  mutableEnv().ADMIN_USERNAME = "operator";
  mutableEnv().ADMIN_PASSWORD = "super-secret-password";
  const totpSecret = "JBSWY3DPEHPK3PXP";
  mutableEnv().ADMIN_TOTP_SECRET = totpSecret;
  const otp = totpForNow(totpSecret);

  const request = new NextRequest("http://localhost/api/admin/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      username: "operator",
      password: "super-secret-password",
      otp,
    }),
  });
  const response = await issueAdminSession(request);
  assert.equal(response.status, 200);

  const setCookie = response.headers.get("set-cookie") ?? "";
  assert.match(setCookie, /ss_admin=/);
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=Lax/i);
  assert.match(setCookie, /Secure/i);
});

test("POST /api/admin/login returns 401 when MFA code is wrong", async () => {
  mutableEnv().NODE_ENV = "production";
  mutableEnv().SESSION_SECRET = "session-secret-cookie-hardening-test";
  mutableEnv().ADMIN_USERNAME = "operator";
  mutableEnv().ADMIN_PASSWORD = "super-secret-password";
  mutableEnv().ADMIN_TOTP_SECRET = "JBSWY3DPEHPK3PXP";

  const request = new NextRequest("http://localhost/api/admin/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      username: "operator",
      password: "super-secret-password",
      otp: "000000",
    }),
  });
  const response = await issueAdminSession(request);
  assert.equal(response.status, 401);
  const body = (await response.json()) as { ok: false; reason: string };
  assert.equal(body.ok, false);
  assert.equal(body.reason, "mfa_required");
});

test("POST /api/admin/login applies escalation lockout after sustained attempts", async () => {
  mutableEnv().NODE_ENV = "production";
  mutableEnv().SESSION_SECRET = "session-secret-cookie-hardening-test";
  mutableEnv().ADMIN_USERNAME = "operator";
  mutableEnv().ADMIN_PASSWORD = "super-secret-password";
  mutableEnv().ADMIN_TOTP_SECRET = "JBSWY3DPEHPK3PXP";
  const clientIp = "198.51.100.21";

  let lastStatus = 0;
  let lastBody: { ok: false; reason: string; error?: string } | null = null;
  for (let i = 0; i < 21; i += 1) {
    const request = new NextRequest("http://localhost/api/admin/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": clientIp,
      },
      body: JSON.stringify({
        username: "operator",
        password: "wrong-password",
        otp: "000000",
      }),
    });
    const response = await issueAdminSession(request);
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

test("POST /api/admin/login applies brute-force per-minute lockout", async () => {
  mutableEnv().NODE_ENV = "production";
  mutableEnv().SESSION_SECRET = "session-secret-cookie-hardening-test";
  mutableEnv().ADMIN_USERNAME = "operator";
  mutableEnv().ADMIN_PASSWORD = "super-secret-password";
  mutableEnv().ADMIN_TOTP_SECRET = "JBSWY3DPEHPK3PXP";
  const clientIp = "198.51.100.22";

  let first429:
    | {
        status: number;
        body: { ok: false; reason: string; error?: string };
        retryAfter: string | null;
      }
    | null = null;

  for (let i = 0; i < 6; i += 1) {
    const request = new NextRequest("http://localhost/api/admin/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": clientIp,
      },
      body: JSON.stringify({
        username: "operator",
        password: "wrong-password",
        otp: "000000",
      }),
    });
    const response = await issueAdminSession(request);
    if (response.status === 429) {
      first429 = {
        status: response.status,
        body: (await response.json()) as {
          ok: false;
          reason: string;
          error?: string;
        },
        retryAfter: response.headers.get("Retry-After"),
      };
      break;
    }
  }

  assert.ok(first429, "expected brute-force lockout to trigger by attempt 6");
  assert.equal(first429.status, 429);
  assert.equal(first429.body.ok, false);
  assert.equal(first429.body.reason, "rate_limited");
  assert.equal(
    first429.body.error,
    "too many login attempts; try again shortly",
  );
  assert.ok(
    first429.retryAfter !== null && Number(first429.retryAfter) >= 1,
    "expected Retry-After header with positive seconds",
  );
});

test("DELETE /api/admin/login clears ss_admin with hardened attributes", async () => {
  mutableEnv().NODE_ENV = "production";
  const response = await clearAdminSession();
  assert.equal(response.status, 200);

  const setCookie = response.headers.get("set-cookie") ?? "";
  assert.match(setCookie, /ss_admin=/);
  assert.match(setCookie, /Max-Age=0/i);
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=Lax/i);
  assert.match(setCookie, /Secure/i);
});
