// CSRF defence for cookie-authenticated state-changing routes.
//
// Background (security audit 2026-05-18):
// Clerk sets its session cookie with `SameSite=Lax`, which blocks naive
// cross-site form POSTs but does NOT block same-site sub-domain requests
// (preview deploys, sibling vercel.app hosts) nor top-level navigations
// in some browsers. Belt-and-braces: every state-changing handler should
// either verify the `Origin` header matches the production origin, OR
// require `Sec-Fetch-Site: same-origin` which browsers refuse to set
// cross-site.
//
// Usage:
//   const csrf = assertSameOriginRequest(req);
//   if (csrf) return csrf;  // 403 response — short-circuit the handler
//
// Returns null on the happy path. Non-null = ready-to-return 403 response.

import { NextRequest, NextResponse } from "next/server";

/** Hostnames that are always allowed (production + Vercel preview deploys). */
const ALLOWED_ORIGIN_SUFFIXES: ReadonlyArray<string> = [
  ".trendingrepo.com",
  "trendingrepo.com",
  ".starscreener.dev",
  "starscreener.dev",
  ".vercel.app", // preview deploys
  "localhost",
  "127.0.0.1",
];

function hostMatchesAllowlist(host: string): boolean {
  const lowered = host.toLowerCase().split(":")[0]?.trim();
  if (!lowered) return false;
  return ALLOWED_ORIGIN_SUFFIXES.some((suffix) => {
    const normalized = suffix.toLowerCase();
    if (normalized.startsWith(".")) {
      const bare = normalized.slice(1);
      return lowered === bare || lowered.endsWith(normalized);
    }
    return lowered === normalized;
  });
}

/**
 * Reject the request unless EITHER the `Sec-Fetch-Site` header signals a
 * first-party origin OR the `Origin` header points at a known allowed
 * production / preview host. Sec-Fetch-Site is the modern primary check;
 * Origin is the fallback for older clients and direct `curl` flows that
 * already carry a cookie (rare for hostile traffic but possible).
 *
 * Returns null when the request is acceptable, a 403 NextResponse when not.
 */
export function assertSameOriginRequest(req: NextRequest): NextResponse | null {
  // 1. Sec-Fetch-Site is the cheapest signal — browsers set it without
  //    any opt-in, and it is NOT forwarded on cross-site requests.
  //    Same-site still falls through to the Origin check because sibling
  //    subdomains and shared hosting suffixes are part of the threat model.
  const fetchSite = req.headers.get("sec-fetch-site");
  if (
    fetchSite === "same-origin" ||
    fetchSite === "none"
  ) {
    return null;
  }

  // 2. Fall back to Origin header check — required for clients that don't
  //    emit Sec-Fetch-Site (older Safari, some CLIs). Missing Origin on a
  //    state-changing request is itself suspicious; reject it.
  const origin = req.headers.get("origin");
  if (!origin) {
    return csrfError("missing_origin", "Origin header missing on POST/PATCH");
  }
  let host: string;
  try {
    host = new URL(origin).host;
  } catch {
    return csrfError("invalid_origin", "Origin header is not a valid URL");
  }
  if (!hostMatchesAllowlist(host)) {
    return csrfError("untrusted_origin", "Origin not in CSRF allowlist");
  }
  return null;
}

function csrfError(error: string, message: string): NextResponse {
  return NextResponse.json(
    { ok: false, error, message },
    {
      status: 403,
      headers: { "Cache-Control": "private, no-store" },
    },
  );
}
