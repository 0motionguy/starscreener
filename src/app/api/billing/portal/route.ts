// POST /api/billing/portal — create a Stripe Customer Portal session.
//
// Auth contract: requires an authenticated caller (verifyUserAuth, same
// surface as /api/checkout/stripe). Anonymous visitors get 401.
//
// Body: none. The route reads the user-tier record to find the Stripe
// customer id that the webhook handler persisted on the first
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

import { userAuthFailureResponse, verifyUserAuth } from "@/lib/api/auth";
import { getStripeClient, getPortalReturnUrl } from "@/lib/stripe/client";
import { getUserTierRecord } from "@/lib/pricing/user-tiers";

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
  // 1. Auth.
  const auth = verifyUserAuth(request);
  const deny = userAuthFailureResponse(auth);
  if (deny) return deny as NextResponse<PortalErrorResponse>;
  if (auth.kind !== "ok") {
    return NextResponse.json(
      { ok: false, error: "login required", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  }
  const { userId } = auth;

  // 2. Look up the Stripe customer for this user. Populated by the
  //    webhook on checkout.session.completed (see src/lib/stripe/events.ts).
  const tierRecord = await getUserTierRecord(userId);
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

  // 4. Create the portal session.
  const origin = originFromRequest(request);
  const returnUrl = getPortalReturnUrl(`${origin}/you/settings`);

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
