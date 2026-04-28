// POST /api/webhooks/stripe — Stripe webhook sink.
//
// Signature verification is load-bearing — if this check fails, anyone with
// a public URL can upgrade any user to any tier. `request.text()` NOT
// `request.json()` because `stripe.webhooks.constructEvent` hashes the raw
// body. A JSON reparse-then-stringify changes whitespace and breaks the HMAC.
//
// Route contract:
//   200 { ok: true, handled, type, skipReason? }    — event accepted
//   400 { ok: false, error: "bad signature" }       — verification failed
//   503 { ok: false, error: ... }                   — Stripe not configured
//   500 { ok: false, error: "processing failed" }   — handler raised; Stripe
//                                                      retries deliver it later
//
// Idempotency: handled inside `src/lib/stripe/events.ts`. Same event.id
// twice = single tier update.

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

import { getDataStore } from "@/lib/data-store";
import { setUserTier } from "@/lib/pricing/user-tiers";
import {
  getStripeClient,
  getStripeWebhookSecret,
  loadPriceIds,
} from "@/lib/stripe/client";
import {
  handleStripeEvent,
  type HandleStripeEventDeps,
} from "@/lib/stripe/events";
import { acquireStripeEventLock } from "@/lib/stripe/idempotency";

export const runtime = "nodejs";

// setUserTier is now a static import from `@/lib/pricing/user-tiers`. Earlier
// versions of this file used a dynamic-import stub guard while that module
// was being landed in parallel — that guard silently 200-ed every Stripe
// event during the integration window, so paying customers received receipts
// without entitlements. Static import means the webhook fails to build if
// the module is missing, which is correct behaviour: a deploy without
// user-tiers should never accept Stripe events.

// -----------------------------------------------------------------------------
// Route handler
// -----------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  // 1. Config gate — both STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET are
  //    required. Any missing env is an operator error, not a signature error.
  const webhookSecret = getStripeWebhookSecret();
  if (!webhookSecret) {
    return NextResponse.json(
      {
        ok: false,
        error: "webhook not configured (missing STRIPE_WEBHOOK_SECRET)",
        code: "WEBHOOK_NOT_CONFIGURED",
      },
      { status: 503 },
    );
  }

  let stripe: Stripe;
  try {
    stripe = getStripeClient();
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: "webhook not configured (missing STRIPE_SECRET_KEY)",
        code: "WEBHOOK_NOT_CONFIGURED",
      },
      { status: 503 },
    );
  }

  // 2. Read the RAW body. Must not parse-then-stringify — that mutates
  //    whitespace and breaks the HMAC.
  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json(
      { ok: false, error: "missing stripe-signature header", code: "BAD_SIGNATURE" },
      { status: 400 },
    );
  }

  // 3. Verify signature. `constructEvent` throws on bad sig / stale timestamp.
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    // NEVER log the raw body — can contain PII / Stripe internals. Log only
    // the generic reason + event type hint.
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[stripe] webhook signature verification failed", {
      reason: message.slice(0, 200),
    });
    return NextResponse.json(
      { ok: false, error: "bad signature", code: "BAD_SIGNATURE" },
      { status: 400 },
    );
  }

  // 4. Cross-instance idempotency gate. Stripe is at-least-once; without a
  //    shared lock, two concurrent Lambdas can both process the same event
  //    and call `setUserTier` twice. SETNX in Redis means the first claimant
  //    runs the handler and the rest 200-with-skipReason.
  const dataStore = getDataStore();
  const fresh = await acquireStripeEventLock(dataStore.redisClient(), event.id);
  if (!fresh) {
    return NextResponse.json({
      ok: true,
      handled: false,
      type: event.type,
      skipReason: "duplicate",
    });
  }

  // 5. Dispatch.
  const priceMap = loadPriceIds();
  const deps: HandleStripeEventDeps = {
    // Adapter: events.ts wants `Promise<void>` and only consumes
    // stripeCustomerId/stripeSubscriptionId from extras; the user-tiers
    // setUserTier returns the upserted record and accepts the same two
    // fields. Discard the return + project the options shape explicitly.
    setUserTier: async (userId, tier, expiresAt, extras) => {
      await setUserTier(userId, tier, expiresAt, {
        stripeCustomerId: extras?.stripeCustomerId,
        stripeSubscriptionId: extras?.stripeSubscriptionId,
      });
    },
    priceMap,
    retrieveSubscription: (id) => stripe.subscriptions.retrieve(id),
  };

  try {
    const result = await handleStripeEvent(event, deps);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    // Returning 500 makes Stripe retry. That's what we want for transient
    // failures (network blip talking to the tier store). Log the real error
    // server-side but do NOT echo it — response body is visible in the
    // Stripe dashboard and can leak internals.
    const message = err instanceof Error ? err.message : String(err);
    console.error("[stripe] webhook handler failed", {
      eventId: event.id,
      eventType: event.type,
      error: message,
    });
    return NextResponse.json(
      { ok: false, error: "processing failed", code: "HANDLER_ERROR" },
      { status: 500 },
    );
  }
}

// Stripe does not GET this endpoint in production. Having a GET respond with
// 405 (instead of Next.js's default 404 "no route matching") gives operators a
// clearer signal when they hit the URL in a browser by mistake.
export function GET(): NextResponse {
  return NextResponse.json(
    { ok: false, error: "method not allowed; POST only", code: "METHOD_NOT_ALLOWED" },
    { status: 405 },
  );
}
