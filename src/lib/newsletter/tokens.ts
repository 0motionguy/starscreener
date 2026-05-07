// Newsletter HMAC tokens — confirm + unsubscribe.
//
// Two token kinds, both signed with `SESSION_SECRET` (HMAC-SHA256), both
// URL-safe base64 (`-`/`_`, no padding):
//
//   - Confirm token:  payload = { email, ts }; verify rejects after 24h TTL.
//                     Used by the double-opt-in flow — every fresh subscribe
//                     re-mints a token so the click in inbox always matches.
//   - Unsub token:    payload = { email }; never expires. Old digest emails
//                     in someone's inbox months later still let them
//                     unsubscribe with one click — the legal requirement
//                     trumps token freshness.
//
// Encoding: base64url(JSON.stringify(payload)) + "." + base64url(hmac).
// Same shape as `src/lib/api/admin-session.ts` and `referrals/cookie.ts`,
// kept consistent so the verifier code reads the same on every surface.
//
// `verifyConfirmToken` / `verifyUnsubToken` return `null` on ANY failure
// (bad shape, bad signature, expired, missing secret) — never throw.
// Callers redirect to `/newsletter-error?reason=expired` on null.

import { createHmac, timingSafeEqual } from "node:crypto";

/** 24-hour window for confirmation links. */
const CONFIRM_TOKEN_TTL_MS = 24 * 60 * 60 * 1_000;

interface ConfirmPayload {
  email: string;
  ts: number;
}

interface UnsubPayload {
  email: string;
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

function signPayload(payloadObj: object): string | null {
  const secret = getSessionSecret();
  if (!secret) return null;
  const payloadB64 = base64urlEncode(JSON.stringify(payloadObj));
  const sig = createHmac("sha256", secret).update(payloadB64).digest();
  return `${payloadB64}.${base64urlEncode(sig)}`;
}

function verifyAndDecode(token: string): unknown | null {
  if (!token || typeof token !== "string") return null;
  const secret = getSessionSecret();
  if (!secret) return null;

  const dot = token.indexOf(".");
  if (dot < 0) return null;
  const payloadB64 = token.slice(0, dot);
  const sigB64 = token.slice(dot + 1);
  if (!payloadB64 || !sigB64) return null;

  const providedSig = base64urlDecodeToBuffer(sigB64);
  if (!providedSig) return null;

  const expectedSig = createHmac("sha256", secret).update(payloadB64).digest();
  if (providedSig.length !== expectedSig.length) return null;
  if (!timingSafeEqual(providedSig, expectedSig)) return null;

  const payloadBuf = base64urlDecodeToBuffer(payloadB64);
  if (!payloadBuf) return null;

  try {
    return JSON.parse(payloadBuf.toString("utf8"));
  } catch {
    return null;
  }
}

/**
 * Mint a confirm-subscription token. Throws if `SESSION_SECRET` is unset —
 * caller must gate on env presence and return a 503 to the client.
 */
export function mintConfirmToken(email: string, ts: number): string {
  const token = signPayload({ email, ts });
  if (!token) {
    throw new Error("[newsletter.tokens] SESSION_SECRET is not configured");
  }
  return token;
}

/**
 * Verify a confirm-subscription token. Returns `{ email, ts }` on success,
 * `null` on any failure (malformed, bad signature, expired, missing secret).
 */
export function verifyConfirmToken(
  token: string,
): { email: string; ts: number } | null {
  const decoded = verifyAndDecode(token);
  if (decoded === null || typeof decoded !== "object") return null;
  const obj = decoded as Record<string, unknown>;
  const email = obj.email;
  const ts = obj.ts;
  if (typeof email !== "string" || email.length === 0) return null;
  if (typeof ts !== "number" || !Number.isFinite(ts)) return null;
  const age = Date.now() - ts;
  if (age < 0) return null;
  if (age > CONFIRM_TOKEN_TTL_MS) return null;
  return { email, ts } satisfies ConfirmPayload;
}

/**
 * Mint an unsubscribe token. No TTL: old digest emails in inboxes months
 * later must still let users unsubscribe with one click. Throws if
 * `SESSION_SECRET` is unset.
 */
export function mintUnsubToken(email: string): string {
  const token = signPayload({ email });
  if (!token) {
    throw new Error("[newsletter.tokens] SESSION_SECRET is not configured");
  }
  return token;
}

/**
 * Verify an unsubscribe token. Returns `{ email }` on success, `null` on any
 * failure. Never expires — see `mintUnsubToken` rationale.
 */
export function verifyUnsubToken(token: string): { email: string } | null {
  const decoded = verifyAndDecode(token);
  if (decoded === null || typeof decoded !== "object") return null;
  const obj = decoded as Record<string, unknown>;
  const email = obj.email;
  if (typeof email !== "string" || email.length === 0) return null;
  return { email } satisfies UnsubPayload;
}
