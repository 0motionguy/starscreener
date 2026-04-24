// POST /api/checkout/stripe — create a Stripe Checkout Session.
//
// Body:
//   {
//     "tier":    "pro" | "team",
//     "cadence": "monthly" | "yearly",
//     "seats"?:  number        // team tier only; default 1
//   }
//
// Returns:
//   200 { ok: true, url: "https://checkout.stripe.com/..." }
//   400 bad input
//   401 no session (login required)
//   503 Stripe not configured / no matching price ID
//   500 unexpected Stripe error (message NOT leaked)
//
// Auth contract: this route requires an authenticated caller — we resolve the
// userId from `verifyUserAuth` (same surface AlertConfig uses). Anonymous
// visitors must log in before they can self-serve checkout.
//
// Security notes:
//   - We pin `client_reference_id` + `metadata.userId` to the auth-derived
//     userId, NEVER to a body/query value. Webhooks read these back to route
//     tier updates to the correct user.
//   - We never echo the Stripe error message to the caller — it can leak
//     account-shape hints. The server-side log keeps the full detail.
//   - `allow_promotion_codes: true` lets operators issue promo codes out of
//     the Stripe dashboard without a code change.

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

import { userAuthFailureResponse, verifyUserAuth } from "@/lib/api/auth";
import {
  getStripeClient,
  loadPriceIds,
  resolvePriceId,
} from "@/lib/stripe/client";

interface CheckoutRequestBody {
  tier?: unknown;
  cadence?: unknown;
  seats?: unknown;
}

interface CheckoutOkResponse {
  ok: true;
  url: string;
  /** Stripe session id — useful for client-side analytics beacons. */
  sessionId: string;
}

interface CheckoutErrorResponse {
  ok: false;
  error: string;
  code: string;
}

type ParsedInput =
  | {
      ok: true;
      tier: "pro" | "team";
      cadence: "monthly" | "yearly";
      seats: number;
    }
  | { ok: false; reason: string };

function parseInput(raw: unknown): ParsedInput {
  if (!raw || typeof raw !== "object") {
    return { ok: false, reason: "body must be a JSON object" };
  }
  const body = raw as CheckoutRequestBody;

  if (body.tier === "enterprise") {
    return { ok: false, reason: "enterprise tier is not self-serve" };
  }
  if (body.tier !== "pro" && body.tier !== "team") {
    return { ok: false, reason: "tier must be 'pro' or 'team'" };
  }
  if (body.cadence !== "monthly" && body.cadence !== "yearly") {
    return { ok: false, reason: "cadence must be 'monthly' or 'yearly'" };
  }

  let seats = 1;
  if (typeof body.seats === "number" && Number.isFinite(body.seats)) {
    // Clamp — no gifts of 10k seats, no zero / negative.
    if (body.seats < 1) return { ok: false, reason: "seats must be >= 1" };
    if (body.seats > 100) return { ok: false, reason: "seats must be <= 100" };
    seats = Math.floor(body.seats);
  } else if (body.seats !== undefined) {
    return { ok: false, reason: "seats must be a number" };
  }

  // Pro tier is single-seat — reject seat counts silently rewriting to 1.
  if (body.tier === "pro" && seats !== 1) {
    return { ok: false, reason: "pro tier is single-seat" };
  }
  return { ok: true, tier: body.tier, cadence: body.cadence, seats };
}

function originFromRequest(request: NextRequest): string {
  // Prefer the origin the browser sent; fall back to the configured app URL.
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
): Promise<NextResponse<CheckoutOkResponse | CheckoutErrorResponse>> {
  // 1. Auth — user must be logged in.
  const auth = verifyUserAuth(request);
  const deny = userAuthFailureResponse(auth);
  if (deny) return deny as NextResponse<CheckoutErrorResponse>;
  if (auth.kind !== "ok") {
    return NextResponse.json(
      { ok: false, error: "login required", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  }
  const { userId } = auth;

  // 2. Parse body.
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid JSON body", code: "BAD_REQUEST" },
      { status: 400 },
    );
  }
  const parsed = parseInput(raw);
  if (!parsed.ok) {
    return NextResponse.json(
      { ok: false, error: parsed.reason, code: "BAD_REQUEST" },
      { status: 400 },
    );
  }

  // 3. Resolve price ID from env.
  const priceIds = loadPriceIds();
  const priceId = resolvePriceId(priceIds, parsed.tier, parsed.cadence);
  if (!priceId) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "checkout not configured for this plan (missing STRIPE_*_PRICE_ID env)",
        code: "CHECKOUT_NOT_CONFIGURED",
      },
      { status: 503 },
    );
  }

  // 4. Build Stripe client (throws if STRIPE_SECRET_KEY unset → 503).
  let stripe: Stripe;
  try {
    stripe = getStripeClient();
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: "checkout not configured (missing STRIPE_SECRET_KEY)",
        code: "CHECKOUT_NOT_CONFIGURED",
      },
      { status: 503 },
    );
  }

  // 5. Create the Checkout Session.
  const origin = originFromRequest(request);
  const successUrl = `${origin}/pricing?checkout=success&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${origin}/pricing?checkout=cancelled`;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [
        {
          price: priceId,
          quantity: parsed.tier === "team" ? parsed.seats : 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      // We don't have a server-side email yet (userId is HMAC-of-email), so
      // let Stripe collect it. When the parallel agent wires a real user
      // store with `.email`, swap to `customer_email`.
      client_reference_id: userId,
      metadata: {
        userId,
        tier: parsed.tier,
        cadence: parsed.cadence,
        seats: String(parsed.tier === "team" ? parsed.seats : 1),
      },
      allow_promotion_codes: true,
      subscription_data: {
        metadata: {
          userId,
          tier: parsed.tier,
          cadence: parsed.cadence,
        },
      },
      // Let the customer update payment method / cancel from the Stripe-
      // hosted portal. Cheap to opt in; the portal is a separate auth flow.
      billing_address_collection: "auto",
    });

    if (!session.url) {
      // Should be impossible for mode=subscription, but guard anyway.
      console.error("[stripe] checkout session created without url", {
        sessionId: session.id,
      });
      return NextResponse.json(
        {
          ok: false,
          error: "checkout session missing redirect url",
          code: "INTERNAL",
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      url: session.url,
      sessionId: session.id,
    });
  } catch (err) {
    // Log the real error server-side; return a generic message so we don't
    // leak Stripe account details to the client.
    const message = err instanceof Error ? err.message : String(err);
    console.error("[stripe] checkout.sessions.create failed", {
      userId,
      tier: parsed.tier,
      cadence: parsed.cadence,
      error: message,
    });
    return NextResponse.json(
      {
        ok: false,
        error: "checkout failed — please retry",
        code: "STRIPE_ERROR",
      },
      { status: 500 },
    );
  }
}
