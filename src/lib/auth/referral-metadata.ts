export const AUTH_REFERRAL_STORAGE_KEY = "trRef";

const REF_CODE_PATTERN = /^[A-Za-z0-9_-]{3,32}$/;
const MAX_URL_HASH_LENGTH = 2048;

export interface ClerkReferralUnsafeMetadata {
  [key: string]: unknown;
  trRef: {
    code: string;
    urlHash?: string;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeUrlHash(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed || !trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return undefined;
  }
  if (/[\r\n]/.test(trimmed)) return undefined;
  return trimmed.slice(0, MAX_URL_HASH_LENGTH);
}

export function parseClerkReferralUnsafeMetadata(
  raw: string | null | undefined,
): ClerkReferralUnsafeMetadata | undefined {
  if (!raw) return undefined;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }

  if (!isRecord(parsed)) return undefined;

  const code = typeof parsed.code === "string" ? parsed.code.trim() : "";
  if (!REF_CODE_PATTERN.test(code)) return undefined;

  const urlHash = normalizeUrlHash(parsed.urlHash);
  return {
    trRef: {
      code,
      ...(urlHash ? { urlHash } : {}),
    },
  };
}
