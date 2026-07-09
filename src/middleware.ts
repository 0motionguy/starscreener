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
//
// NOTE: /api/auth/session used to be on this list. It moved to the
// Clerk-session matcher when the identity bridge landed — the route now
// asks Clerk "who is signed in?" server-side to mint `c_<clerkUserId>`
// cookies, which requires clerkMiddleware context. It still mints
// anonymous cookies for signed-out visitors exactly as before.
//
// On every request we also handle first-touch referral attribution: if
// `?ref=<code>` is present on the URL, set a signed `tr_ref` cookie
// (30-day Max-Age) so the referral persists into Clerk sign-up. Cookie is
// only set when not already present — first-touch wins, last-touch loses.

import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";

import { getClerkPublishableKey } from "@/lib/auth/clerk-config";
import { signRefCookie } from "@/lib/referrals/cookie";

const TR_REF_COOKIE = "tr_ref";
const TR_REF_MAX_AGE = 30 * 24 * 60 * 60; // 30 days
const REF_CODE_PATTERN = /^[A-Za-z0-9_-]{3,32}$/;
const CRAWLER_UA_PATTERN =
  /(bot|crawler|spider|slurp|facebookexternalhit|preview|googlebot|bingbot|yandex|duckduckbot|baiduspider|applebot|whatsapp|telegrambot|discordbot|twitterbot|linkedinbot)/i;
const EXPENSIVE_CRAWL_UA_PATTERN =
  /(bot|crawler|spider|slurp|preview|googlebot|bingbot|googleother|google-extended|facebookbot|facebookexternalhit|meta-external|applebot|duckduckbot|yandex|bytespider|ccbot|gptbot|oai-searchbot|chatgpt-user|claudebot|claude-web|perplexity|amazonbot|diffbot|headless|httpclient|python-requests|curl|wget)/i;
const AGENT_COMMERCE_COST_GUARD_IPS = new Set([
  "74.7.227.19",
  "66.249.64.234",
  "66.249.64.224",
  "137.74.81.189",
]);
const AGENT_COMMERCE_COST_GUARD_IPV6_PREFIXES = ["2a03:2880:f806:"];

// Routes that require an authenticated Clerk session. Keep `/you` itself
// public: it is the local-storage dashboard for signed-out users. Only the
// account-backed subroutes and `/api/me/*` require Clerk.
const isProtectedRoute = createRouteMatcher([
  "/you/alerts(.*)",
  "/you/refer(.*)",
  "/api/me/(.*)",
]);

// Routes that are still public in the product sense, but need Clerk's
// middleware context so route handlers/server components can call `auth()`
// and decide their own anonymous-vs-signed-in shape instead of throwing
// outside Clerk.
//
//   /api/auth/session   — mints `c_<clerkUserId>` cookies for signed-in
//                         users, anonymous ones otherwise (identity bridge)
//   /api/checkout/stripe, /api/billing/portal — money paths; they 401 JSON
//                         for anonymous callers rather than redirecting
const isClerkSessionRoute = createRouteMatcher([
  "/you",
  "/api/pipeline/sidebar-overlay",
  "/api/auth/session",
  "/api/checkout/stripe",
  "/api/billing/portal",
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
    pathname.startsWith("/api/webhooks/")
  );
}

function isAgentCommerceCostGuardPath(pathname: string): boolean {
  return (
    pathname === "/agent-commerce" ||
    pathname.startsWith("/agent-commerce/") ||
    pathname === "/feeds/agent-commerce.xml" ||
    pathname === "/api/agent-commerce" ||
    pathname.startsWith("/api/agent-commerce/")
  );
}

function getClientIp(req: NextRequest): string {
  const cfIp = req.headers.get("cf-connecting-ip")?.trim();
  if (cfIp) return cfIp.toLowerCase();
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded.toLowerCase();
  const realIp = req.headers.get("x-real-ip")?.trim();
  return realIp?.toLowerCase() ?? "";
}

function isCostGuardCrawler(req: NextRequest): boolean {
  const ua = req.headers.get("user-agent") ?? "";
  if (EXPENSIVE_CRAWL_UA_PATTERN.test(ua)) return true;

  const ip = getClientIp(req);
  if (AGENT_COMMERCE_COST_GUARD_IPS.has(ip)) return true;
  return AGENT_COMMERCE_COST_GUARD_IPV6_PREFIXES.some((prefix) =>
    ip.startsWith(prefix),
  );
}

function crawlerCostGuardResponse(): NextResponse {
  return new NextResponse("crawler temporarily throttled\n", {
    status: 429,
    headers: {
      "Cache-Control": "public, max-age=300, s-maxage=300",
      "Content-Type": "text/plain; charset=utf-8",
      "Retry-After": "600",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
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

// Clerk-less fallback for environments without a publishable key
// (CI, fresh local checkouts). Public routes still render; protected
// routes redirect to /sign-in (which itself renders the "auth unavailable"
// degraded surface).
async function middlewareWithoutClerk(
  req: NextRequest,
): Promise<NextResponse | undefined> {
  const url = req.nextUrl;
  if (isBypassed(url.pathname)) return;
  if (isAgentCommerceCostGuardPath(url.pathname) && isCostGuardCrawler(req)) {
    return crawlerCostGuardResponse();
  }

  const res = isProtectedRoute(req)
    ? redirectToSignIn(req)
    : NextResponse.next();
  await setRefCookieIfNeeded(req, res);
  return res;
}

async function middlewareForPublicRoutes(
  req: NextRequest,
): Promise<NextResponse | undefined> {
  const url = req.nextUrl;
  if (isBypassed(url.pathname)) return;
  if (isAgentCommerceCostGuardPath(url.pathname) && isCostGuardCrawler(req)) {
    return crawlerCostGuardResponse();
  }

  const res = NextResponse.next();
  await setRefCookieIfNeeded(req, res);
  return res;
}

const middlewareWithClerk = clerkMiddleware(async (auth, req) => {
  const url = req.nextUrl;

  // 1. Bypass list — return immediately, never wrap in Clerk's session
  //    machinery.
  if (isBypassed(url.pathname)) return;

  if (isAgentCommerceCostGuardPath(url.pathname) && isCostGuardCrawler(req)) {
    return crawlerCostGuardResponse();
  }

  // 2. Build a base response now so the cookie helper can attach to it.
  const res = NextResponse.next();
  await setRefCookieIfNeeded(req, res);

  // 3. Protected routes use our own redirect instead of `auth.protect()`.
  //    With Clerk development keys, `auth.protect()` can rewrite signed-out
  //    product routes to a 404 before users ever reach our sign-in page.
  if (isProtectedRoute(req)) {
    const session = await auth();
    if (!session.userId) {
      const redirect = redirectToSignIn(req);
      await setRefCookieIfNeeded(req, redirect);
      return redirect;
    }
  }

  return res;
});

export default function middleware(req: NextRequest, event: NextFetchEvent) {
  if (!getClerkPublishableKey()) {
    return middlewareWithoutClerk(req);
  }

  if (isProtectedRoute(req) || isClerkSessionRoute(req)) {
    return middlewareWithClerk(req, event);
  }

  return middlewareForPublicRoutes(req);
}

export const config = {
  // Default Clerk matcher — exclude Next internals + static files. Same
  // shape as the Clerk docs example, with `_next` and dotted paths
  // explicitly skipped.
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
