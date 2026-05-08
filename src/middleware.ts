// Next.js middleware — composes Clerk auth + first-touch referral
// attribution.
//
// CRITICAL bypass list: existing routes already gate themselves with
// distinct auth schemes (CRON_SECRET, ss_admin cookie, ss_user cookie).
// Letting Clerk wrap them would either:
//   (a) double-redirect to sign-in (CRON requests have no session)
//   (b) silently swap their cookie context and break legacy verifiers.
// So we explicitly bypass:
//
//   /api/cron/*       — CRON_SECRET via verifyCronAuth
//   /api/admin/*      — ss_admin via verifyAdminSession
//   /api/webhooks/*   — provider-specific HMAC verification
//   /api/auth/session — issues ss_user cookies for anonymous users
//
// On every request we also handle first-touch referral attribution: if
// `?ref=<code>` is present on the URL, set a signed `tr_ref` cookie
// (30-day Max-Age) so the referral persists into Clerk sign-up. Cookie is
// only set when not already present — first-touch wins, last-touch loses.

import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";

import { getClerkPublishableKey } from "@/lib/auth/clerk-config";
import { signRefCookie } from "@/lib/referrals/cookie";

const TR_REF_COOKIE = "tr_ref";
const TR_REF_MAX_AGE = 30 * 24 * 60 * 60; // 30 days
const REF_CODE_PATTERN = /^[A-Za-z0-9_-]{3,32}$/;
const CRAWLER_UA_PATTERN =
  /(bot|crawler|spider|slurp|facebookexternalhit|preview|googlebot|bingbot|yandex|duckduckbot|baiduspider|applebot|whatsapp|telegrambot|discordbot|twitterbot|linkedinbot)/i;

// Routes that require an authenticated Clerk session. Hitting these signed-out
// triggers Clerk's redirect to /sign-in when Clerk is configured. In local/CI
// smoke environments without Clerk config, we redirect to the hosted sign-in
// route ourselves so public pages can still boot.
const isProtectedRoute = createRouteMatcher([
  "/you(.*)",
  "/api/me/(.*)",
]);

// Routes that should NEVER pass through Clerk's session check — they own
// their own auth schemes. Clerk's middleware respects publicRoutes by
// default, but we go further by short-circuiting these before Clerk
// runs at all to keep the existing `ss_admin` / `CRON_SECRET` paths
// behaviour-identical.
function isBypassed(pathname: string): boolean {
  return (
    pathname.startsWith("/api/cron/") ||
    pathname.startsWith("/api/admin/") ||
    pathname.startsWith("/api/webhooks/") ||
    pathname.startsWith("/api/auth/session")
  );
}

async function setRefCookieIfNeeded(req: NextRequest, res: NextResponse) {
  const ref = req.nextUrl.searchParams.get("ref");
  if (!ref || !REF_CODE_PATTERN.test(ref)) return;
  if (req.cookies.get(TR_REF_COOKIE)) return; // first-touch wins
  const ua = req.headers.get("user-agent") ?? "";
  if (CRAWLER_UA_PATTERN.test(ua)) return;

  try {
    const ipRaw =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const signed = await signRefCookie({
      code: ref,
      url: req.nextUrl.pathname + req.nextUrl.search,
      ts: Date.now(),
      ipRaw,
      ua,
    });
    res.cookies.set({
      name: TR_REF_COOKIE,
      value: signed,
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: TR_REF_MAX_AGE,
      path: "/",
    });
  } catch (err) {
    // Don't ever break the request because cookie signing failed —
    // attribution is best-effort.
    console.warn("[middleware] tr_ref cookie sign failed", err);
  }
}

function redirectToSignIn(req: NextRequest): NextResponse {
  const signInUrl = req.nextUrl.clone();
  signInUrl.pathname = "/sign-in";
  signInUrl.searchParams.set(
    "redirect_url",
    req.nextUrl.pathname + req.nextUrl.search,
  );
  return NextResponse.redirect(signInUrl);
}

async function middlewareWithoutClerk(
  req: NextRequest,
): Promise<NextResponse | undefined> {
  const url = req.nextUrl;
  if (isBypassed(url.pathname)) return;

  const res = isProtectedRoute(req)
    ? redirectToSignIn(req)
    : NextResponse.next();
  await setRefCookieIfNeeded(req, res);
  return res;
}

const middlewareWithClerk = clerkMiddleware(async (auth, req) => {
  const url = req.nextUrl;

  // 1. Bypass list — return immediately, never wrap in Clerk's session
  //    machinery.
  if (isBypassed(url.pathname)) return;

  // 2. Build a base response now so the cookie helper can attach to it.
  const res = NextResponse.next();
  await setRefCookieIfNeeded(req, res);

  // 3. Protected routes → Clerk's `auth.protect()` redirects to sign-in
  //    if no valid session. Returns the same response we built above on
  //    success, preserving the cookie.
  if (isProtectedRoute(req)) {
    await auth.protect();
  }

  return res;
});

export default getClerkPublishableKey()
  ? middlewareWithClerk
  : middlewareWithoutClerk;

export const config = {
  // Default Clerk matcher — exclude Next internals + static files. Same
  // shape as the Clerk docs example, with `_next` and dotted paths
  // explicitly skipped.
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
