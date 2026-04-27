// POST /api/auth/session — issue a signed session cookie (ss_user).
// GET  /api/auth/session — report current session state (idempotent probe).
//
// The AlertConfig UI calls POST on mount if no ss_user cookie is present.
// The server signs an HMAC-SHA256 session (see `src/lib/api/session.ts`) and
// sets it as an HttpOnly, SameSite=Lax cookie with a 30-day Max-Age. All
// subsequent /api/pipeline/alerts* calls from the browser automatically
// include the cookie; the userId is derived server-side from the signed
// payload, not from any client-supplied `?userId=` or body field.
//
// Dev fallback: if SESSION_SECRET is unset and we are NOT in production, we
// return `{ ok: true, userId: "local" }` without setting a cookie. The
// AlertConfig UI's existing env-less dev path continues to work unchanged.
//
// Prod enforcement: if SESSION_SECRET is unset in production, POST returns
// 503 (`AUTH_NOT_CONFIGURED`) matching the shape used by verifyUserAuth.
// GET stays idempotent and returns `{ ok: false }` rather than 503 so the
// UI can treat it as "not logged in" without error banners.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  SESSION_COOKIE_NAME,
} from "@/lib/api/auth";
import { parseBody } from "@/lib/api/parse-body";
import {
  deriveUserId,
  signSession,
  verifySession,
  type SessionPayload,
} from "@/lib/api/session";
import { getUserTierRecord } from "@/lib/pricing/user-tiers";

export const runtime = "nodejs";

// Keep in sync with SESSION_MAX_AGE_MS in session.ts (30 days, in seconds).
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

interface SessionProbeOk {
  ok: true;
  userId: string;
  issuedAt: number;
}

interface SessionProbeMiss {
  ok: false;
}

interface SessionIssuedOk {
  ok: true;
  userId: string;
  issuedAt: number;
  /** "cookie" in prod; "dev-fallback" when SESSION_SECRET unset in dev. */
  kind: "cookie" | "dev-fallback";
}

interface SessionError {
  ok: false;
  error: string;
  code: string;
}

function isSecretConfigured(): boolean {
  const raw = process.env.SESSION_SECRET;
  return typeof raw === "string" && raw.trim().length > 0;
}

function readSessionCookie(request: NextRequest): string | null {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const name = trimmed.slice(0, eq).trim();
    if (name !== SESSION_COOKIE_NAME) continue;
    const value = trimmed.slice(eq + 1).trim();
    return value.length > 0 ? value : null;
  }
  return null;
}

/**
 * GET — read the current session. Idempotent. Never 401/503.
 *
 * Callers use this to check whether they already have a session without
 * triggering the POST issue-a-session flow.
 */
export async function GET(
  request: NextRequest,
): Promise<NextResponse<SessionProbeOk | SessionProbeMiss>> {
  if (!isSecretConfigured()) {
    // Dev fallback — report the env-less "local" user. No cookie set.
    if (process.env.NODE_ENV !== "production") {
      return NextResponse.json({
        ok: true,
        userId: "local",
        issuedAt: Date.now(),
      });
    }
    return NextResponse.json({ ok: false });
  }
  const raw = readSessionCookie(request);
  const payload = verifySession(raw);
  if (!payload) return NextResponse.json({ ok: false });
  return NextResponse.json({
    ok: true,
    userId: payload.userId,
    issuedAt: payload.issuedAt,
  });
}

/**
 * POST — issue or rotate a session cookie.
 *
 * Body (optional): `{ "email"?: string }`. When provided, the returned
 * userId is deterministic (HMAC(SESSION_SECRET, email)), so the same email
 * across devices yields the same userId. When omitted, an anonymous random
 * userId is generated. Either way the alert feed is keyed by userId.
 */
export async function POST(
  request: NextRequest,
): Promise<NextResponse<SessionIssuedOk | SessionError>> {
  // Dev fallback: SESSION_SECRET unset. Return the "local" identity without
  // setting a cookie — AlertConfig's existing dev path picks this up.
  if (!isSecretConfigured()) {
    if (process.env.NODE_ENV !== "production") {
      return NextResponse.json({
        ok: true,
        userId: "local",
        issuedAt: Date.now(),
        kind: "dev-fallback",
      });
    }
    return NextResponse.json(
      {
        ok: false,
        error:
          "session auth not configured (set SESSION_SECRET in production)",
        code: "AUTH_NOT_CONFIGURED",
      },
      { status: 503 },
    );
  }

  // Parse optional email from the body. Tolerant of no body at all.
  const SessionRequestSchema = z
    .object({
      email: z
        .string()
        .transform((s) => s.trim())
        .refine((s) => s.length > 0, "email empty")
        .optional(),
    })
    .passthrough();
  const parsedBody = await parseBody(request, SessionRequestSchema, {
    allowEmpty: true,
  });
  // No-body / invalid-JSON / extra keys are all tolerated; only a value
  // present and explicitly-malformed (e.g. email: 123) would 400, and
  // even then we'd rather route that to "anonymous" than reject the
  // POST. Treat any failure as "no email supplied".
  const email: string | null = parsedBody.ok
    ? parsedBody.data.email ?? null
    : null;

  // If the caller already has a valid cookie AND didn't supply an email,
  // renew the existing identity rather than minting a new random one.
  // This keeps userId stable across tabs / reloads for anonymous users.
  let userId: string;
  const existing = verifySession(readSessionCookie(request));
  if (existing && email === null) {
    userId = existing.userId;
  } else {
    userId = deriveUserId(email);
  }

  // Pull the latest tier from the user-tier store so fresh cookies carry
  // the correct entitlement hint. Best-effort — a store read failure falls
  // back to a tier-less cookie (treated as free by callers).
  let tierRecord: Awaited<ReturnType<typeof getUserTierRecord>> = null;
  try {
    tierRecord = await getUserTierRecord(userId);
  } catch {
    tierRecord = null;
  }

  const payload: SessionPayload = {
    userId,
    issuedAt: Date.now(),
    ...(tierRecord ? { tier: tierRecord.tier, tierExpiresAt: tierRecord.expiresAt } : {}),
  };
  const token = signSession(payload);

  const response = NextResponse.json<SessionIssuedOk>({
    ok: true,
    userId,
    issuedAt: payload.issuedAt,
    kind: "cookie",
  });
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return response;
}
