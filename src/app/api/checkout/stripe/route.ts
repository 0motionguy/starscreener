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
import { z } from "zod";

import { userAuthFailureResponse, verifyUserAuth } from "@/lib/api/auth";
import { parseBody } from "@/lib/api/parse-body";
import {
  getStripeClient,
  loadPriceIds,
  resolvePriceId,
} from "@/lib/stripe/client";

export const runtime = "nodejs";

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

// `tier` is a string-prechecked enum so the "enterprise is not self-serve"
// message stays distinct from "tier must be 'pro' or 'team'". `cadence` is
// a plain enum. `seats` is clamped 1..100. Cross-field rule (pro = single
// seat) is enforced via outer superRefine.
const CheckoutBodySchema = z
  .object({
    tier: z
      .string({ message: "tier must be 'pro' or 'team'" })
      .refine((v) => v !== "enterprise", {
        message: "enterprise tier is not self-serve",
      })
      .pipe(
        z.enum(["pro", "team"], {
          message: "tier must be 'pro' or 'team'",
        }),
      ),
    cadence: z.enum(["monthly", "yearly"], {
      message: "cadence must be 'monthly' or 'yearly'",
    }),
    seats: z
      .number({ message: "seats must be a number" })
      .finite()
      .min(1, "seats must be >= 1")
      .max(100, "seats must be <= 100")
      .transform((n) => Math.floor(n))
      .optional(),
  })
  .superRefine((value, ctx) => {
    const seats = value.seats ?? 1;
    if (value.tier === "pro" && seats !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["seats"],
        message: "pro tier is single-seat",
      });
    }
  });

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
  const parsedResult = await parseBody(request, CheckoutBodySchema);
  if (!parsedResult.ok) {
    // Re-shape onto the route's error envelope which carries `code`.
    const fallback = await parsedResult.response.json();
    return NextResponse.json(
      {
        ok: false,
        error: fallback.error ?? "validation failed",
        code: "BAD_REQUEST",
      },
      { status: 400 },
    );
  }
  const parsed = {
    tier: parsedResult.data.tier,
    cadence: parsedResult.data.cadence,
    seats: parsedResult.data.seats ?? 1,
  };

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
