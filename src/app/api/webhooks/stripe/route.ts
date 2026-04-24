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

import {
  getStripeClient,
  getStripeWebhookSecret,
  loadPriceIds,
} from "@/lib/stripe/client";
import {
  handleStripeEvent,
  type HandleStripeEventDeps,
  type SetUserTierFn,
} from "@/lib/stripe/events";

// -----------------------------------------------------------------------------
// setUserTier wiring.
//
// The parallel agent owns `src/lib/pricing/user-tiers.ts`. When that file
// exists, import `setUserTier` from it at module load (Node ESM, statically
// analyzable). Until it lands, we use a local stub that logs every call —
// the webhook still returns 200 so Stripe doesn't retry, but no store is
// actually updated.
//
// We use a dynamic import guard so the route handler file still type-checks
// whether or not the parallel agent's file exists. When the file lands, the
// integration is: swap the stub for `import { setUserTier } from "@/lib/pricing/user-tiers"`.
// -----------------------------------------------------------------------------

async function resolveSetUserTier(): Promise<SetUserTierFn> {
  // Attempt to load the parallel agent's real implementation. The try/catch
  // keeps the webhook functional during parallel development — if the
  // module isn't present yet, we fall back to the logging stub.
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod: any = await import("@/lib/pricing/user-tiers" as string).catch(
      () => null,
    );
    if (mod && typeof mod.setUserTier === "function") {
      return mod.setUserTier as SetUserTierFn;
    }
  } catch {
    // ignore — fall through to stub
  }
  return setUserTierStub;
}

/** Temporary stub — replaced at integration time when the parallel agent ships `setUserTier`. */
const setUserTierStub: SetUserTierFn = async (userId, tier, expiresAt, extras) => {
  // Keep the log terse but informative. No secrets. No raw event body.
  console.log(
    `[stripe:stub] setUserTier userId=${userId} tier=${tier} expires=${expiresAt ?? "null"} source=${
      extras?.source ?? "unknown"
    }`,
  );
};

// Cached — one resolve per cold start is fine.
let _cachedSetUserTier: SetUserTierFn | null = null;
async function getSetUserTier(): Promise<SetUserTierFn> {
  if (_cachedSetUserTier) return _cachedSetUserTier;
  _cachedSetUserTier = await resolveSetUserTier();
  return _cachedSetUserTier;
}

// Test-only hook — attached on globalThis so Next's route-export validator
// doesn't reject us. (Next 15 rejects any export that isn't an HTTP verb
// or recognized config symbol on a route file.)
const __testHookSymbol = Symbol.for("starscreener.stripe.route.test");
(globalThis as Record<symbol, unknown>)[__testHookSymbol] = (): void => {
  _cachedSetUserTier = null;
};

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

  // 4. Dispatch.
  const setUserTier = await getSetUserTier();
  const priceMap = loadPriceIds();
  const deps: HandleStripeEventDeps = {
    setUserTier,
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
