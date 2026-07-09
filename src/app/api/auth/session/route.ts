// /api/auth/session — issue, probe, and clear the signed ss_user cookie.
//
//   POST   — mint or renew a session cookie.
//   GET    — report current session state (idempotent probe, self-healing).
//   DELETE — clear the cookie (sign-out hygiene).
//
// Identity model (see src/lib/auth/user-id.ts):
//
//   - Signed-in (Clerk session present) → userId `c_<clerkUserId>`. The
//     Clerk session is verified SERVER-SIDE via getClerkUserIdOptional();
//     the browser never chooses its own identity. Only these ids may carry
//     a tier hint in the cookie.
//   - Signed-out → anonymous `a_<random>` id. Alerts/watchlist keep working
//     for logged-out users; anonymous ids never carry a tier.
//
// SECURITY: this route previously accepted a client-supplied `{email}` and
// minted the deterministic `u_<hmac(email)>` id for it — meaning anyone who
// knew a user's email could mint that user's exact session and inherit
// their tier + alert rules. The email path is REMOVED; request bodies are
// ignored entirely. Legacy `u_` cookies already in the wild still verify
// until they expire (30d), but new ones can no longer be minted, and tier
// hints never attach to them.
//
// Self-healing: a `c_` cookie whose Clerk session is gone (signed out,
// switched accounts) is cleared on GET and replaced on POST, so a paid
// session can't outlive its Clerk sign-in on a shared machine.
//
// Dev fallback: if SESSION_SECRET is unset and we are NOT in production, we
// return `{ ok: true, userId: "local" }` without setting a cookie.
//
// Prod enforcement: if SESSION_SECRET is unset in production, POST returns
// 503 (`AUTH_NOT_CONFIGURED`). GET stays idempotent and returns
// `{ ok: false }` rather than 503 so the UI treats it as "not logged in".

import { NextRequest, NextResponse } from "next/server";

import { SESSION_COOKIE_NAME } from "@/lib/api/auth";
import { checkRateLimitAsync } from "@/lib/api/rate-limit";
import {
  deriveUserId,
  signSession,
  verifySession,
  type SessionPayload,
} from "@/lib/api/session";
import { getClerkUserIdOptional } from "@/lib/auth/clerk-session";
import {
  clerkDerivedUserId,
  isClerkDerivedUserId,
} from "@/lib/auth/user-id";
import { getUserTierRecord } from "@/lib/pricing/user-tiers";

// lint-allow: no-parsebody - the request body is deliberately IGNORED
// (identity comes from the server-side Clerk probe; accepting a body-
// supplied email was the takeover vector this route was rewritten to kill).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Keep in sync with SESSION_MAX_AGE_MS in session.ts (30 days, in seconds).
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const SESSION_CACHE_HEADERS = { "Cache-Control": "private, no-store" };

// Per-IP rate-limit on session minting. 30/hour is plenty for legitimate
// rotation (tab reload, multi-tab open, dev-server restart) while blocking
// a determined cookie-mint grinder. W5.5.B MEDIUM finding follow-up.
const SESSION_RATE_LIMIT = {
  windowMs: 60 * 60 * 1_000,
  maxRequests: 30,
} as const;

interface SessionProbeOk {
  ok: true;
  userId: string;
  issuedAt: number;
  /** Present when the session carries a tier hint (Clerk-derived ids only). */
  tier?: string;
  tierExpiresAt?: string | null;
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

function sessionJson<T>(body: T, init?: ResponseInit): NextResponse<T> {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", SESSION_CACHE_HEADERS["Cache-Control"]);
  return NextResponse.json(body, { ...init, headers });
}

function clearSessionCookie(response: NextResponse): void {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

/**
 * GET — read the current session. Idempotent probe. Never 401/503.
 *
 * Self-healing: when the cookie carries a Clerk-derived id but the Clerk
 * session is gone or belongs to a different account, report `ok:false`
 * AND expire the cookie so the stale identity can't linger.
 *
 * Fresh tier for Clerk sessions: the cookie's embedded tier is a hint
 * minted at issue time — right after checkout the Stripe webhook updates
 * the STORE, not the cookie, so the probe reads the store fresh (30s
 * TTL-cached) and, when the tier changed, re-mints the cookie in the
 * same response. This is what lets CheckoutSuccess confirm an upgrade by
 * polling this endpoint.
 */
export async function GET(
  request: NextRequest,
): Promise<NextResponse<SessionProbeOk | SessionProbeMiss>> {
  if (!isSecretConfigured()) {
    // Dev fallback — report the env-less "local" user. No cookie set.
    if (process.env.NODE_ENV !== "production") {
      return sessionJson({
        ok: true,
        userId: "local",
        issuedAt: Date.now(),
      });
    }
    return sessionJson({ ok: false });
  }
  const raw = readSessionCookie(request);
  const payload = verifySession(raw);
  if (!payload) return sessionJson({ ok: false });

  if (isClerkDerivedUserId(payload.userId)) {
    const clerkUserId = await getClerkUserIdOptional();
    const expected = clerkUserId ? clerkDerivedUserId(clerkUserId) : null;
    if (expected !== payload.userId) {
      const response = sessionJson<SessionProbeMiss>({ ok: false });
      clearSessionCookie(response);
      return response;
    }

    // Fresh store read — best-effort; on failure fall through to the
    // cookie hint below.
    try {
      const record = await getUserTierRecord(payload.userId);
      const freshTier = record?.tier;
      const freshExpiresAt = record?.expiresAt ?? null;
      const changed =
        freshTier !== payload.tier ||
        (freshTier !== undefined && freshExpiresAt !== (payload.tierExpiresAt ?? null));
      const response = sessionJson<SessionProbeOk>({
        ok: true,
        userId: payload.userId,
        issuedAt: payload.issuedAt,
        ...(freshTier !== undefined
          ? { tier: freshTier, tierExpiresAt: freshExpiresAt }
          : {}),
      });
      if (changed) {
        // Re-mint so subsequent requests (rate-limiter, UI gates) carry
        // the updated hint without another store hit.
        const reminted: SessionPayload = {
          userId: payload.userId,
          issuedAt: Date.now(),
          ...(freshTier !== undefined
            ? { tier: freshTier, tierExpiresAt: freshExpiresAt }
            : {}),
        };
        response.cookies.set({
          name: SESSION_COOKIE_NAME,
          value: signSession(reminted),
          httpOnly: true,
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
          path: "/",
          maxAge: SESSION_MAX_AGE_SECONDS,
        });
      }
      return response;
    } catch {
      // Store unavailable — cookie hint below still serves.
    }
  }

  return sessionJson({
    ok: true,
    userId: payload.userId,
    issuedAt: payload.issuedAt,
    ...(payload.tier !== undefined ? { tier: payload.tier } : {}),
    ...(payload.tierExpiresAt !== undefined
      ? { tierExpiresAt: payload.tierExpiresAt }
      : {}),
  });
}

/**
 * POST — issue or rotate a session cookie.
 *
 * The request body is IGNORED (see the security note in the header). The
 * minted identity is decided entirely server-side:
 *
 *   Clerk session present → `c_<clerkUserId>` (+ tier hint from the store)
 *   otherwise             → renew a valid non-Clerk cookie, or mint `a_<random>`
 */
export async function POST(
  request: NextRequest,
): Promise<NextResponse<SessionIssuedOk | SessionError>> {
  // Per-IP rate-limit BEFORE the secret-configured paths so a mint-grinder
  // still hits the budget even when the server returns 503.
  const rate = await checkRateLimitAsync(request, SESSION_RATE_LIMIT);
  if (!rate.allowed) {
    const headers = new Headers(SESSION_CACHE_HEADERS);
    headers.set("Retry-After", String(Math.ceil(rate.retryAfterMs / 1000)));
    return NextResponse.json(
      {
        ok: false,
        error: "Too many requests",
        code: "RATE_LIMITED",
      },
      { status: 429, headers },
    );
  }

  // Dev fallback: SESSION_SECRET unset. Return the "local" identity without
  // setting a cookie — AlertConfig's existing dev path picks this up.
  if (!isSecretConfigured()) {
    if (process.env.NODE_ENV !== "production") {
      return sessionJson({
        ok: true,
        userId: "local",
        issuedAt: Date.now(),
        kind: "dev-fallback",
      });
    }
    return sessionJson(
      {
        ok: false,
        error:
          "session auth not configured (set SESSION_SECRET in production)",
        code: "AUTH_NOT_CONFIGURED",
      },
      { status: 503 },
    );
  }

  const clerkUserId = await getClerkUserIdOptional();

  let userId: string;
  if (clerkUserId) {
    userId = clerkDerivedUserId(clerkUserId);
  } else {
    // Signed-out. Renew an existing anonymous/legacy identity so userId
    // stays stable across tabs/reloads — but NEVER renew a Clerk-derived
    // cookie without its Clerk session (sign-out hygiene: mint fresh
    // anonymous instead).
    const existing = verifySession(readSessionCookie(request));
    if (existing && !isClerkDerivedUserId(existing.userId)) {
      userId = existing.userId;
    } else {
      userId = deriveUserId(null);
    }
  }

  // Tier hint — Clerk-derived ids only. Anonymous/legacy ids never carry
  // a tier in the cookie (policy: unverified identities hold no
  // entitlements). Best-effort: a store read failure falls back to a
  // tier-less cookie (treated as free by callers).
  let tierRecord: Awaited<ReturnType<typeof getUserTierRecord>> = null;
  if (clerkUserId) {
    try {
      tierRecord = await getUserTierRecord(userId);
    } catch {
      tierRecord = null;
    }
  }

  const payload: SessionPayload = {
    userId,
    issuedAt: Date.now(),
    ...(tierRecord ? { tier: tierRecord.tier, tierExpiresAt: tierRecord.expiresAt } : {}),
  };
  const token = signSession(payload);

  const response = sessionJson<SessionIssuedOk>({
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

/**
 * DELETE — clear the session cookie. Called on sign-out so the ss_user
 * identity (and any tier hint) can't outlive the Clerk session. Idempotent;
 * safe to call without a cookie.
 */
export async function DELETE(): Promise<NextResponse<{ ok: true }>> {
  const response = sessionJson<{ ok: true }>({ ok: true });
  clearSessionCookie(response);
  return response;
}
