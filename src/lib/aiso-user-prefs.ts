// Per-user AISO.tools API preferences. Operator-supplied baseUrl + apiKey
// stored as an http-only signed cookie called `aiso_pref`. Pages call
// `getAisoUserPrefs()` to read; the /api/account/aiso-pref route writes.
//
// The cookie payload is base64-encoded JSON so it round-trips cleanly
// through the cookie header without needing escapes. We mask the apiKey
// when returning a "display" form to the UI so the full secret never
// hits client code.

import { cookies } from "next/headers";

export const AISO_PREF_COOKIE = "aiso_pref";

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

export interface AisoUserPrefs {
  baseUrl: string;
  apiKey: string;
}

export interface AisoUserPrefsDisplay {
  baseUrl: string;
  apiKeyMasked: string;
  configured: boolean;
}

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function encodePrefs(prefs: AisoUserPrefs): string {
  const json = JSON.stringify(prefs);
  return Buffer.from(json, "utf8").toString("base64");
}

function decodePrefs(raw: string | undefined | null): AisoUserPrefs | null {
  if (!raw) return null;
  try {
    const json = Buffer.from(raw, "base64").toString("utf8");
    const parsed = JSON.parse(json) as Partial<AisoUserPrefs>;
    if (typeof parsed.baseUrl !== "string" || typeof parsed.apiKey !== "string") {
      return null;
    }
    if (!isHttpUrl(parsed.baseUrl) || parsed.apiKey.length < 4) return null;
    return {
      baseUrl: parsed.baseUrl.replace(/\/+$/, ""),
      apiKey: parsed.apiKey,
    };
  } catch {
    return null;
  }
}

function maskKey(key: string): string {
  if (key.length <= 8) return "•".repeat(key.length);
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

/** Server: read the configured AISO prefs (or null when unset). */
export async function getAisoUserPrefs(): Promise<AisoUserPrefs | null> {
  const store = await cookies();
  const raw = store.get(AISO_PREF_COOKIE)?.value;
  return decodePrefs(raw);
}

/** Server: read a display-safe summary for the settings UI. */
export async function getAisoUserPrefsDisplay(): Promise<AisoUserPrefsDisplay> {
  const prefs = await getAisoUserPrefs();
  if (!prefs) {
    return {
      baseUrl: "https://aiso.tools",
      apiKeyMasked: "",
      configured: false,
    };
  }
  return {
    baseUrl: prefs.baseUrl,
    apiKeyMasked: maskKey(prefs.apiKey),
    configured: true,
  };
}

export const aisoPrefCookieDefaults = {
  name: AISO_PREF_COOKIE,
  maxAge: COOKIE_MAX_AGE_SECONDS,
  encodePrefs,
};
