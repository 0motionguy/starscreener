import { createHmac, timingSafeEqual } from "node:crypto";

const SITE = "https://trendingrepo.com";

export const EMAIL_UNSUBSCRIBE_SCOPES = [
  "referral_updates",
  "system",
] as const;
export type EmailUnsubscribeScope = (typeof EMAIL_UNSUBSCRIBE_SCOPES)[number];

const FALLBACK_PATHS: Record<EmailUnsubscribeScope, string> = {
  referral_updates: "/you?action=unsubscribe-referral-updates",
  system: "/you/settings",
};

function base64url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function secret(): string | null {
  const raw = process.env.SESSION_SECRET?.trim();
  return raw && raw.length > 0 ? raw : null;
}

function sign(scope: EmailUnsubscribeScope, profileId: string): Buffer | null {
  const raw = secret();
  if (!raw) return null;
  return createHmac("sha256", raw).update(`${scope}:${profileId}`).digest();
}

export function buildEmailUnsubscribeUrl(
  scope: EmailUnsubscribeScope,
  profileId: string,
): string {
  const sig = sign(scope, profileId);
  if (!sig) return `${SITE}${FALLBACK_PATHS[scope]}`;
  return `${SITE}/api/email/unsubscribe?scope=${scope}&p=${encodeURIComponent(
    profileId,
  )}&t=${base64url(sig)}`;
}

export function parseEmailUnsubscribeScope(
  raw: string | null,
): EmailUnsubscribeScope | null {
  return EMAIL_UNSUBSCRIBE_SCOPES.includes(raw as EmailUnsubscribeScope)
    ? (raw as EmailUnsubscribeScope)
    : null;
}

export function verifyEmailUnsubscribeToken(
  scope: EmailUnsubscribeScope,
  profileId: string,
  token: string,
): boolean {
  if (!profileId || !token) return false;
  const expected = sign(scope, profileId);
  if (!expected) return false;

  let actual: Buffer;
  try {
    actual = Buffer.from(token, "base64url");
  } catch {
    return false;
  }
  return (
    actual.length === expected.length && timingSafeEqual(actual, expected)
  );
}
