// POST / DELETE /api/account/aiso-pref
//
// Set or clear the per-user AISO.tools API preference cookie. The cookie
// is http-only + same-site=lax so client code can never read the key
// back — the UI gets a masked display value through getAisoUserPrefsDisplay().
//
// POST body: { baseUrl: string, apiKey: string }
// DELETE:    clears the cookie.

import { NextResponse } from "next/server";
import { z } from "zod";

import { parseBody } from "@/lib/api/parse-body";
import { aisoPrefCookieDefaults, AISO_PREF_COOKIE } from "@/lib/aiso-user-prefs";

export const runtime = "nodejs";

const AisoPrefSchema = z.object({
  baseUrl: z
    .string()
    .url("baseUrl must be an http(s) URL")
    .refine(
      (value) => /^https?:\/\//i.test(value),
      "baseUrl must use http or https",
    ),
  apiKey: z
    .string()
    .trim()
    .min(4, "apiKey must be at least 4 characters"),
});

function maskKey(key: string): string {
  if (key.length <= 8) return "•".repeat(key.length);
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

export async function POST(request: Request) {
  const parsed = await parseBody(request, AisoPrefSchema);
  if (!parsed.ok) return parsed.response;

  const baseUrl = parsed.data.baseUrl.replace(/\/+$/, "");
  const apiKey = parsed.data.apiKey;
  const encoded = aisoPrefCookieDefaults.encodePrefs({ baseUrl, apiKey });

  const response = NextResponse.json({
    ok: true,
    baseUrl,
    apiKeyMasked: maskKey(apiKey),
  });

  response.cookies.set({
    name: AISO_PREF_COOKIE,
    value: encoded,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: aisoPrefCookieDefaults.maxAge,
    path: "/",
  });

  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true, cleared: true });
  response.cookies.set({
    name: AISO_PREF_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
    path: "/",
  });
  return response;
}
