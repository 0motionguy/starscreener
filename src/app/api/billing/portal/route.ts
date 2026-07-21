// POST /api/billing/portal — create a Stripe Customer Portal session.
//
// Auth contract: requires a CLERK-authenticated caller (same surface as
// /api/checkout/stripe post identity-unification). Anonymous visitors get
// 401. The route is on the middleware's isClerkSessionRoute list.
//
// Body: none. The route reads the user-tier record (canonical `c_` id
// first, legacy email-derived id read-through) to find the Stripe customer
// id that the webhook handler persisted on the first
// checkout.session.completed. If the user has never completed checkout
// (stripeCustomerId is null), we 400 with a friendly hint — the UI
// should hide the "Manage billing" button in that case anyway.
//
// Returns:
//   200 { ok: true, url: "https://billing.stripe.com/..." }
//   400 { ok: false, error: "no_subscription" }
//   401 no session (login required)
//   503 Stripe not configured
//   500 unexpected Stripe error
//
// Security:
//   - We pull stripeCustomerId from the SERVER-SIDE tier store keyed by
//     the auth-derived userId. Never from a body/query value — that would
//     let anyone open someone else's portal.
//   - We never echo the Stripe error message to the caller; server log
//     keeps full detail.

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

import { getOptionalUser, type LoadedUser } from "@/lib/auth/server";
import { clerkDerivedUserId } from "@/lib/auth/user-id";
import { getTierRecordForClerkUser } from "@/lib/pricing/tier-resolve";
import { getStripeClient, getPortalReturnUrl } from "@/lib/stripe/client";

// lint-allow: no-parsebody - no-body endpoint; verifyUserAuth is the trust boundary.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PortalOkResponse {
  ok: true;
  url: string;
}

interface PortalErrorResponse {
  ok: false;
  error: string;
  code: string;
}

function originFromRequest(request: NextRequest): string {
  const origin = request.headers.get("origin");
  if (origin && /^https?:\/\//.test(origin)) return origin.replace(/\/$/, "");
  const publicUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (publicUrl) return publicUrl.replace(/\/$/, "");
  const host = request.headers.get("host");
  const proto =
    request.headers.get("x-forwarded-proto") ??
    (process.env.NODE_ENV === "production" ? "https" : "http");
  return host ? `${proto}://${host}` : "http://localhost:3023";
}

export async function POST(
  request: NextRequest,
): Promise<NextResponse<PortalOkResponse | PortalErrorResponse>> {
  // 1. Auth — Clerk session + profile row. Mirrors /api/checkout/stripe:
  //    signed-out (or Clerk-context-unavailable) → 401; profile-store
  //    infra failure → 503 retryable.
  let loaded: LoadedUser | null;
  try {
    loaded = await getOptionalUser();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[stripe] billing portal auth lookup failed", { error: message });
    return NextResponse.json(
      {
        ok: false,
        error: "account service unavailable — please retry",
        code: "ACCOUNT_STORE_UNAVAILABLE",
      },
      { status: 503 },
    );
  }
  if (!loaded) {
    return NextResponse.json(
      { ok: false, error: "sign in required", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  }
  const userId = clerkDerivedUserId(loaded.clerkUserId);

  // 2. Look up the Stripe customer for this user. Populated by the
  //    webhook on checkout.session.completed (see src/lib/stripe/events.ts).
  //    Read-through covers records written under the legacy email-derived
  //    id before identity unification.
  const tierRecord = await getTierRecordForClerkUser(
    loaded.clerkUserId,
    loaded.profile.email,
  );
  const stripeCustomerId = tierRecord?.stripeCustomerId ?? null;
  if (!stripeCustomerId) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "no active subscription — complete a checkout first before opening the billing portal",
        code: "NO_SUBSCRIPTION",
      },
      { status: 400 },
    );
  }

  // 3. Build the Stripe client (throws if STRIPE_SECRET_KEY unset → 503).
  let stripe: Stripe;
  try {
    stripe = getStripeClient();
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: "billing portal not configured (missing STRIPE_SECRET_KEY)",
        code: "PORTAL_NOT_CONFIGURED",
      },
      { status: 503 },
    );
  }

  // 4. Create the portal session. Return to /account (the live billing surface)
  //    — the old /you/settings route no longer exists (it 404'd on return).
  const origin = originFromRequest(request);
  const returnUrl = getPortalReturnUrl(`${origin}/account`);

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: returnUrl,
    });

    if (!session.url) {
      // Should be impossible per Stripe's contract, but guard anyway.
      console.error("[stripe] billing portal session created without url", {
        sessionId: session.id,
      });
      return NextResponse.json(
        {
          ok: false,
          error: "billing portal session missing redirect url",
          code: "INTERNAL",
        },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, url: session.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[stripe] billingPortal.sessions.create failed", {
      userId,
      customerId: stripeCustomerId,
      error: message,
    });
    return NextResponse.json(
      {
        ok: false,
        error: "billing portal session failed — please retry",
        code: "STRIPE_ERROR",
      },
      { status: 500 },
    );
  }
}
