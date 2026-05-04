// Admin-only signed-cookie session. Mirrors src/lib/api/session.ts but with
// a separate cookie name (ss_admin) so the admin and user blast radii don't
// cross — same rationale verifyAdminAuth() applies to keeping ADMIN_TOKEN
// distinct from CRON_SECRET.
//
// Cookie shape is identical:
//   base64url(JSON payload) . base64url(HMAC-SHA256(SESSION_SECRET, payload))
//
// Payload is intentionally minimal — admin is singular, so no userId.
//
// Shorter default lifetime (7 days) than user sessions (30 days) because
// admin is higher-privilege. Operators can re-log-in once a week.

import { createHmac, timingSafeEqual } from "node:crypto";
import { AdminFatalError } from "@/lib/errors";

/** Name of the HMAC-signed admin session cookie. */
export const ADMIN_SESSION_COOKIE_NAME = "ss_admin";

/** 7-day admin session window. Matches the cookie Max-Age below. */
export const ADMIN_SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1_000;

/** Cookie Max-Age in seconds (what NextResponse.cookies.set() takes). */
export const ADMIN_SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

export interface AdminSessionPayload {
  /** Milliseconds since epoch when the session was issued. */
  issuedAt: number;
  /** Username that logged in (for audit / future multi-admin support). */
  username: string;
}

function base64urlEncode(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64urlDecodeToBuffer(input: string): Buffer | null {
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
  const raw = process.env.SESSION_SECRET;
  if (!raw) return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Sign an admin session. Throws if SESSION_SECRET is unset — callers must
 * gate on env presence and return a 503 to the client.
 */
export function signAdminSession(payload: AdminSessionPayload): string {
  const secret = getSessionSecret();
  if (!secret) {
    throw new AdminFatalError("SESSION_SECRET is not configured", {
      scope: "api/admin-session",
      operation: "signAdminSession",
    });
  }
  const payloadB64 = base64urlEncode(JSON.stringify(payload));
  const sig = createHmac("sha256", secret).update(payloadB64).digest();
  return `${payloadB64}.${base64urlEncode(sig)}`;
}

/**
 * Verify an admin session token. Returns the payload on success, `null` on
 * any failure (malformed, bad signature, expired, SESSION_SECRET unset).
 */
export function verifyAdminSession(
  token: string | null | undefined,
): AdminSessionPayload | null {
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
  const issuedAt = obj.issuedAt;
  const username = obj.username;
  if (typeof issuedAt !== "number" || !Number.isFinite(issuedAt)) return null;
  if (typeof username !== "string" || username.length === 0) return null;

  const age = Date.now() - issuedAt;
  if (age < 0) return null;
  if (age > ADMIN_SESSION_MAX_AGE_MS) return null;

  return { issuedAt, username };
}

/**
 * Parse the Cookie header looking for `ss_admin`. Returns the raw cookie
 * value, or null if absent. Shared by the login route and verifyAdminAuth.
 */
export function readAdminSessionCookie(
  cookieHeader: string | null | undefined,
): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const name = trimmed.slice(0, eq).trim();
    if (name !== ADMIN_SESSION_COOKIE_NAME) continue;
    const value = trimmed.slice(eq + 1).trim();
    return value.length > 0 ? value : null;
  }
  return null;
}
