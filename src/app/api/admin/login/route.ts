// POST   /api/admin/login  { username, password }  → set ss_admin cookie
// DELETE /api/admin/login                         → clear ss_admin cookie
//
// Credentials come from ADMIN_USERNAME / ADMIN_PASSWORD env vars. Both are
// compared with timingSafeEqual to blunt remote timing attacks. If either
// env is missing → 503. Password wrong → 401. Success → 7-day HttpOnly
// SameSite=Lax cookie signed with SESSION_SECRET.
//
// The existing Authorization: Bearer <ADMIN_TOKEN> path in verifyAdminAuth()
// is untouched — this endpoint adds a second, friendlier way to authenticate
// without removing the first.

import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import * as Sentry from "@sentry/nextjs";

import { timingSafeEqualStr } from "@/lib/api/auth";
import { parseBody } from "@/lib/api/parse-body";
import {
  ADMIN_SESSION_COOKIE_NAME,
  ADMIN_SESSION_MAX_AGE_SECONDS,
  signAdminSession,
} from "@/lib/api/admin-session";
import { checkRateLimitAsync } from "@/lib/api/rate-limit";
import {
  AdminFatalError,
  AdminQuarantineError,
  engineErrorSentryContext,
} from "@/lib/errors";

export const runtime = "nodejs";

export const dynamic = "force-dynamic";

// Brute-force lockout. 5 attempts per IP per minute. Cross-instance because
// the rate-limit store is Upstash-backed when configured. Audit finding APP-11.
// Unlock behavior: automatic timeout-only reset when the 60s window expires.
const LOGIN_RATE_LIMIT = { windowMs: 60_000, maxRequests: 5 } as const;
// Escalation lockout layered on top of LOGIN_RATE_LIMIT. This catches
// distributed low-and-slow brute-force attempts that stay under 5/min.
// Unlock behavior: automatic timeout-only reset when the 15-minute window expires.
const LOGIN_ESCALATION_RATE_LIMIT = {
  windowMs: 15 * 60_000,
  maxRequests: 20,
} as const;

interface LoginOk {
  ok: true;
  username: string;
}

interface LoginErr {
  ok: false;
  reason:
    | "unauthorized"
    | "not_configured"
    | "bad_request"
    | "rate_limited"
    | "mfa_required";
  error?: string;
}

function rateLimitedResponse(
  retryAfterMs: number,
  message: string,
): NextResponse<LoginErr> {
  return NextResponse.json(
    {
      ok: false,
      reason: "rate_limited",
      error: message,
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(Math.ceil(retryAfterMs / 1000)),
      },
    },
  );
}

function configured(): {
  username: string;
  password: string;
  totpSecret: string;
  sessionSecret: string;
} | null {
  const username = process.env.ADMIN_USERNAME?.trim();
  const password = process.env.ADMIN_PASSWORD?.trim();
  const totpSecret = process.env.ADMIN_TOTP_SECRET?.trim();
  const sessionSecret = process.env.SESSION_SECRET?.trim();
  if (!username || !password || !totpSecret || !sessionSecret) return null;
  return { username, password, totpSecret, sessionSecret };
}

function base32Decode(raw: string): Buffer | null {
  const normalized = raw.toUpperCase().replace(/[\s-]/g, "");
  if (!/^[A-Z2-7]+=*$/.test(normalized)) return null;
  const clean = normalized.replace(/=+$/g, "");
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const ch of clean) {
    const idx = alphabet.indexOf(ch);
    if (idx === -1) return null;
    value = (value << 5) | idx;
    bits += 5;
    while (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return bytes.length > 0 ? Buffer.from(bytes) : null;
}

function hotp(secret: Buffer, counter: number): string {
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

function timingSafeCodeEq(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function verifyTotp(secretRaw: string, providedRaw: string, nowMs = Date.now()): boolean {
  const secret = base32Decode(secretRaw);
  if (!secret) return false;
  const provided = providedRaw.trim();
  if (!/^\d{6}$/.test(provided)) return false;
  const step = 30;
  const ctr = Math.floor(nowMs / 1000 / step);
  for (const delta of [-1, 0, 1]) {
    if (timingSafeCodeEq(hotp(secret, ctr + delta), provided)) return true;
  }
  return false;
}

export async function POST(
  request: NextRequest,
): Promise<NextResponse<LoginOk | LoginErr>> {
  // Secondary lockout window. Keep this BEFORE config/credential checks so
  // attackers cannot bypass by probing malformed bodies or missing envs.
  const escalationRate = await checkRateLimitAsync(
    request,
    LOGIN_ESCALATION_RATE_LIMIT,
  );
  if (!escalationRate.allowed) {
    const err = new AdminQuarantineError(
      "admin login denied: escalation lockout triggered",
    );
    const context = engineErrorSentryContext(err, {
      auth_surface: "admin-login",
      lockout_tier: "escalation",
    });
    Sentry.captureException(err, {
      tags: context.tags,
      extra: context.extra,
    });
    return rateLimitedResponse(
      escalationRate.retryAfterMs,
      "admin login temporarily locked; try again later",
    );
  }

  // Rate-limit BEFORE config gate so probing a misconfigured deploy still
  // counts toward the per-IP budget. The constant-time comparison below
  // already protects timing; this protects volume.
  const rate = await checkRateLimitAsync(request, LOGIN_RATE_LIMIT);
  if (!rate.allowed) {
    const err = new AdminQuarantineError("admin login denied: rate limited");
    const context = engineErrorSentryContext(err, {
      auth_surface: "admin-login",
    });
    Sentry.captureException(err, {
      tags: context.tags,
      extra: context.extra,
    });
    return rateLimitedResponse(
      rate.retryAfterMs,
      "too many login attempts; try again shortly",
    );
  }

  const config = configured();
  if (!config) {
    const err = new AdminFatalError(
      "admin login blocked: ADMIN_USERNAME/ADMIN_PASSWORD/ADMIN_TOTP_SECRET/SESSION_SECRET missing",
    );
    const context = engineErrorSentryContext(err, {
      auth_surface: "admin-login",
    });
    Sentry.captureException(err, {
      tags: context.tags,
      extra: context.extra,
    });
    return NextResponse.json(
      {
        ok: false,
        reason: "not_configured",
        error:
          "admin login not configured (set ADMIN_USERNAME, ADMIN_PASSWORD, ADMIN_TOTP_SECRET, SESSION_SECRET in .env.local)",
      },
      { status: 503 },
    );
  }

  const LoginSchema = z.object({
    username: z.string().min(1).transform((s) => s.trim()),
    password: z.string().min(1),
    otp: z.string().min(1),
  });
  const parsed = await parseBody(request, LoginSchema, {
    publicMessage: "username, password, and otp are required",
    includeDetails: false,
  });
  if (!parsed.ok) {
    // parseBody returns the canonical { ok:false, error } envelope; admin
    // login wants { ok:false, reason, error } so the dashboard can branch
    // on `reason`. Read the underlying body, re-shape minimally.
    const status = parsed.response.status;
    return NextResponse.json(
      {
        ok: false,
        reason: "bad_request",
        error:
          status === 400
            ? "username, password, and otp are required"
            : "body must be valid JSON",
      },
      { status: 400 },
    );
  }
  const { username: providedUsername, password: providedPassword, otp: providedOtp } =
    parsed.data;

  // Always run BOTH comparisons even if the first mismatches, so a wrong
  // username can't be distinguished from a wrong password by response time.
  const userOk = timingSafeEqualStr(providedUsername, config.username);
  const passOk = timingSafeEqualStr(providedPassword, config.password);
  if (!userOk || !passOk) {
    const err = new AdminQuarantineError("admin login denied: unauthorized");
    const context = engineErrorSentryContext(err, {
      auth_surface: "admin-login",
    });
    Sentry.captureException(err, {
      tags: context.tags,
      extra: context.extra,
    });
    return NextResponse.json(
      { ok: false, reason: "unauthorized" },
      { status: 401 },
    );
  }

  if (!verifyTotp(config.totpSecret, providedOtp)) {
    const err = new AdminQuarantineError("admin login denied: invalid mfa");
    const context = engineErrorSentryContext(err, {
      auth_surface: "admin-login",
    });
    Sentry.captureException(err, {
      tags: context.tags,
      extra: context.extra,
    });
    return NextResponse.json(
      { ok: false, reason: "mfa_required", error: "invalid MFA code" },
      { status: 401 },
    );
  }

  const token = signAdminSession({
    issuedAt: Date.now(),
    username: config.username,
  });

  const response = NextResponse.json<LoginOk>({
    ok: true,
    username: config.username,
  });
  response.cookies.set({
    name: ADMIN_SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ADMIN_SESSION_MAX_AGE_SECONDS,
  });
  return response;
}

export async function DELETE(): Promise<NextResponse<{ ok: true }>> {
  const response = NextResponse.json({ ok: true as const });
  response.cookies.set({
    name: ADMIN_SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}
