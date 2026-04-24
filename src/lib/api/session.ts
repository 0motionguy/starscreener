// Light signed-cookie session primitives for the StarScreener UI.
//
// Problem: the AlertConfig UI in the browser needs a stable userId for the
// per-user endpoints (alerts, alert rules) without forcing every visitor to
// sign in. Exposing USER_TOKEN to the browser would be worse than the prior
// `?userId=local` bug — a single leaked token would grant access to the
// server-side alert feed for every other install.
//
// Solution: issue an HMAC-signed cookie (ss_user) on first contact. The
// server derives userId from either:
//
//   1. x-user-token / Authorization: Bearer   (existing, unchanged)
//   2. ss_user cookie                         (this module — new)
//
// The cookie value is a JWT-lite triple:
//
//   base64url(JSON payload) . base64url(HMAC-SHA256(payload))
//
// `SESSION_SECRET` (32+ bytes) is required in production. In dev the session
// route falls back to userId="local" without issuing a cookie — see
// `src/app/api/auth/session/route.ts`.
//
// No external deps: node:crypto only. Timing-safe HMAC compare.

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { isUserTier, type UserTier } from "@/lib/pricing/tiers";

/** Stable 30-day session window. Matches the cookie Max-Age. */
export const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1_000;

export interface SessionPayload {
  /** Stable caller identifier. Opaque to the client. */
  userId: string;
  /** Milliseconds since epoch when the session was issued. */
  issuedAt: number;
  /**
   * Optional tier hint embedded in the cookie. Kept optional so old
   * cookies issued before the pricing wave still verify — they are
   * treated as free tier by callers that consume this field.
   *
   * The cookie is NOT the source of truth for the tier; the user-tier
   * store is. The hint exists so unauthenticated-browser flows (rate
   * limiter, UI gating) can skip a disk hit when the cookie is fresh.
   */
  tier?: UserTier;
  /**
   * ISO timestamp for when the tier entitlement expires. `null` = no
   * expiry. Mirrors the user-tier store record shape. Optional + may be
   * absent on legacy cookies.
   */
  tierExpiresAt?: string | null;
}

/**
 * base64url — URL-safe, no padding. Matches JWT / WebAuthn conventions so
 * the cookie value survives being echoed through query strings, proxies,
 * or logs without re-encoding surprises.
 */
function base64urlEncode(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64urlDecodeToBuffer(input: string): Buffer | null {
  // Reject inputs with any character outside the base64url alphabet.
  // Prevents silent data loss from Buffer.from's lenient "ignore" mode.
  if (!/^[A-Za-z0-9_-]*$/.test(input)) return null;
  const pad = input.length % 4 === 0 ? 0 : 4 - (input.length % 4);
  const padded = input + "=".repeat(pad);
  const restored = padded.replace(/-/g, "+").replace(/_/g, "/");
  try {
    return Buffer.from(restored, "base64");
  } catch {
    return null;
  }
}

function getSessionSecret(): string | null {
  // Read at call time — dev reloads mutate process.env.
  const raw = process.env.SESSION_SECRET;
  if (!raw) return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Sign a session payload. Returns `<payload_b64url>.<sig_b64url>`.
 *
 * Throws if SESSION_SECRET is unset — callers (session route POST) must
 * gate on env presence first and return a proper 503 to the client.
 */
export function signSession(payload: SessionPayload): string {
  const secret = getSessionSecret();
  if (!secret) {
    throw new Error("SESSION_SECRET is not configured");
  }
  const payloadB64 = base64urlEncode(JSON.stringify(payload));
  const sig = createHmac("sha256", secret).update(payloadB64).digest();
  const sigB64 = base64urlEncode(sig);
  return `${payloadB64}.${sigB64}`;
}

/**
 * Verify a session token. Returns the payload on success, `null` on any
 * failure (malformed, bad signature, expired, SESSION_SECRET unset, etc).
 *
 * Uses crypto.timingSafeEqual on the HMAC comparison.
 */
export function verifySession(token: string | null | undefined): SessionPayload | null {
  if (!token || typeof token !== "string") return null;
  const secret = getSessionSecret();
  if (!secret) return null;

  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sigB64] = parts;
  if (!payloadB64 || !sigB64) return null;

  const providedSig = base64urlDecodeToBuffer(sigB64);
  if (!providedSig) return null;

  const expectedSig = createHmac("sha256", secret).update(payloadB64).digest();
  if (providedSig.length !== expectedSig.length) return null;
  if (!timingSafeEqual(providedSig, expectedSig)) return null;

  const payloadBuf = base64urlDecodeToBuffer(payloadB64);
  if (!payloadBuf) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(payloadBuf.toString("utf8"));
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;
  const userId = obj.userId;
  const issuedAt = obj.issuedAt;
  if (typeof userId !== "string" || userId.length === 0) return null;
  if (typeof issuedAt !== "number" || !Number.isFinite(issuedAt)) return null;

  // Expiry: reject if older than SESSION_MAX_AGE_MS.
  const age = Date.now() - issuedAt;
  if (age < 0) return null; // clock skew / future-dated token
  if (age > SESSION_MAX_AGE_MS) return null;

  // Additive pricing fields — absent on legacy cookies, present on new
  // ones. Invalid values are dropped silently so a tampered / corrupted
  // tier field doesn't void an otherwise-valid session.
  const payload: SessionPayload = { userId, issuedAt };
  if (isUserTier(obj.tier)) {
    payload.tier = obj.tier;
  }
  if (obj.tierExpiresAt === null) {
    payload.tierExpiresAt = null;
  } else if (typeof obj.tierExpiresAt === "string" && obj.tierExpiresAt.length > 0) {
    payload.tierExpiresAt = obj.tierExpiresAt;
  }
  return payload;
}

/**
 * Derive a stable userId from an email, or generate a random one when no
 * email is provided. The email path uses HMAC so knowing an email alone
 * doesn't let an attacker predict or forge the resulting userId.
 *
 * Caller MUST have already checked that SESSION_SECRET is configured.
 */
export function deriveUserId(email: string | null | undefined): string {
  const secret = getSessionSecret();
  if (!secret) {
    throw new Error("SESSION_SECRET is not configured");
  }
  if (email && typeof email === "string" && email.trim().length > 0) {
    const normalized = email.trim().toLowerCase();
    const hash = createHmac("sha256", secret).update(`email:${normalized}`).digest();
    // 16 bytes → 22 chars base64url. Enough to avoid collisions in practice
    // while keeping the cookie compact.
    return `u_${base64urlEncode(hash.subarray(0, 16))}`;
  }
  // Anonymous: 16 random bytes → 22 chars.
  return `a_${base64urlEncode(randomBytes(16))}`;
}

/** Exported for tests only — do not rely on this in production code. */
export function __getSessionSecretForTests(): string | null {
  return getSessionSecret();
}
