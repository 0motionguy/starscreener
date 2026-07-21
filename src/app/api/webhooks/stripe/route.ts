// POST /api/webhooks/stripe — Stripe webhook sink.
//
// Signature verification is load-bearing — if this check fails, anyone with
// a public URL can upgrade any user to any tier. `request.text()` NOT
// `request.json()` because `stripe.webhooks.constructEvent` hashes the raw
// body. A JSON reparse-then-stringify changes whitespace and breaks the HMAC.
//
// Route contract:
//   200 { ok: true, handled, type, skipReason? }    — event accepted (or a
//                                                      committed duplicate / a
//                                                      stale out-of-order skip)
//   400 { ok: false, error: "bad signature" }       — verification failed
//   409 { ok: false, code: "EVENT_IN_PROGRESS" }    — a live handler holds the
//                                                      lease; Stripe retries
//   503 { ok: false, error: ... }                   — Stripe not configured
//   500 { ok: false, code: "HANDLER_ERROR" }        — handler raised; the
//                                                      ledger row is `failed`
//                                                      and Stripe reprocesses
//
// Idempotency + retry + out-of-order: owned by the DURABLE event ledger
// (src/lib/stripe/event-ledger.ts). A duplicate is ONLY a committed
// success/ignore — a prior FAILURE stays reprocessable.

import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import Stripe from "stripe";

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
import {
  getStripeEventLedger,
  processStripeEvent,
} from "@/lib/stripe/event-ledger";

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

  // 4. Dispatch through the DURABLE event ledger. It owns idempotency (a
  //    delivery is a duplicate ONLY when a prior attempt COMMITTED as
  //    succeeded/ignored), the processing lease (a crashed handler is
  //    reclaimed after its lease; a live one reports `busy` and is not
  //    double-run), and the per-subscription out-of-order guard. A transient
  //    failure marks the row `failed` and returns 500 so Stripe retries and
  //    the event REPROCESSES — killing the poison the old Redis NX lock +
  //    in-memory Set caused (retry acked as duplicate, entitlement dropped).
  const priceMap = loadPriceIds();
  const deps: HandleStripeEventDeps = {
    // Adapter: events.ts wants `Promise<void>` and only consumes
    // stripeCustomerId/stripeSubscriptionId from extras; the user-tiers
    // setUserTier returns the upserted record and accepts the same two fields.
    setUserTier: async (userId, tier, expiresAt, extras) => {
      await setUserTier(userId, tier, expiresAt, {
        stripeCustomerId: extras?.stripeCustomerId,
        stripeSubscriptionId: extras?.stripeSubscriptionId,
      });
    },
    priceMap,
    retrieveSubscription: (id) => stripe.subscriptions.retrieve(id),
  };

  // Fingerprint only — the raw payload (PII / Stripe internals) is never stored.
  const payloadSha256 = createHash("sha256").update(rawBody).digest("hex");
  const ledger = getStripeEventLedger();
  const outcome = await processStripeEvent(
    event,
    ledger,
    (e) => handleStripeEvent(e, deps),
    payloadSha256,
  );
  if (outcome.status >= 500) {
    // Real handler failure — logged server-side (never echoed; the response
    // body is visible in the Stripe dashboard and can leak internals).
    console.error("[stripe] webhook handler failed", {
      eventId: event.id,
      eventType: event.type,
    });
  }
  return NextResponse.json(outcome.body, { status: outcome.status });
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
