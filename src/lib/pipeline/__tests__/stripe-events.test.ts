// Stripe event-handler tests.
//
// These tests exercise the dispatch table in `src/lib/stripe/events.ts`
// directly — no Stripe HTTP, no signature verification. We feed synthetic
// `Stripe.Event` objects and assert `setUserTier` is called with the right
// (userId, tier, expiresAt) tuple.
//
// The webhook route's signature verifier is tested via a narrow "bad
// signature → 400" assertion using the real `stripe.webhooks.constructEvent`
// with a known-invalid signature.

import { test } from "node:test";
import assert from "node:assert/strict";
import type Stripe from "stripe";

import {
  handleStripeEvent,
  priceIdToTier,
  periodEndToIso,
  extractUserId,
  __resetProcessedEventsForTests,
  type HandleStripeEventDeps,
  type PriceToTierMap,
  type SetUserTierFn,
  type StripeTier,
} from "../../stripe/events";

// -----------------------------------------------------------------------------
// Fixtures
// -----------------------------------------------------------------------------

const PRICE_MAP: PriceToTierMap = {
  proMonthly: "price_pro_m",
  proYearly: "price_pro_y",
  teamMonthly: "price_team_m",
  teamYearly: "price_team_y",
};

interface RecordedCall {
  userId: string;
  tier: StripeTier;
  expiresAt: string | null;
  source: string;
  subscriptionId: string | null | undefined;
  customerId: string | null | undefined;
  cadence: string | null | undefined;
}

function mkRecorder(): { fn: SetUserTierFn; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const fn: SetUserTierFn = async (userId, tier, expiresAt, extras) => {
    calls.push({
      userId,
      tier,
      expiresAt,
      source: String(extras?.source ?? "unknown"),
      subscriptionId: extras?.stripeSubscriptionId,
      customerId: extras?.stripeCustomerId,
      cadence: extras?.cadence,
    });
  };
  return { fn, calls };
}

function mkDeps(
  recorder: ReturnType<typeof mkRecorder>,
  overrides: Partial<HandleStripeEventDeps> = {},
): HandleStripeEventDeps {
  return {
    setUserTier: recorder.fn,
    priceMap: PRICE_MAP,
    // Default: any subscription retrieve call is an error unless the test
    // overrides it.
    retrieveSubscription: async (id: string) => {
      throw new Error(`retrieveSubscription unexpectedly called for ${id}`);
    },
    log: () => {},
    ...overrides,
  };
}

function mkSubscription(args: {
  id: string;
  priceId: string;
  customer: string;
  userId: string;
  currentPeriodEnd: number;
  status?: Stripe.Subscription.Status;
}): Stripe.Subscription {
  const status: Stripe.Subscription.Status = args.status ?? "active";
  return {
    id: args.id,
    object: "subscription",
    status,
    customer: args.customer,
    current_period_end: args.currentPeriodEnd,
    metadata: { userId: args.userId },
    items: {
      object: "list",
      data: [
        {
          id: `si_${args.id}`,
          price: {
            id: args.priceId,
            object: "price",
          } as Stripe.Price,
        } as Stripe.SubscriptionItem,
      ],
      has_more: false,
      url: `/v1/subscription_items`,
    } as Stripe.ApiList<Stripe.SubscriptionItem>,
  } as unknown as Stripe.Subscription;
}

function mkEvent(
  type: Stripe.Event.Type | string,
  data: unknown,
  id = `evt_${Math.random().toString(36).slice(2, 10)}`,
): Stripe.Event {
  return {
    id,
    object: "event",
    type,
    api_version: "2024-11-20.acacia",
    created: Math.floor(Date.now() / 1_000),
    livemode: false,
    pending_webhooks: 0,
    request: null,
    data: { object: data },
  } as unknown as Stripe.Event;
}

// -----------------------------------------------------------------------------
// priceIdToTier + helpers
// -----------------------------------------------------------------------------

test("priceIdToTier — maps each configured price to the right (tier, cadence)", () => {
  assert.deepEqual(priceIdToTier("price_pro_m", PRICE_MAP), {
    tier: "pro",
    cadence: "monthly",
  });
  assert.deepEqual(priceIdToTier("price_pro_y", PRICE_MAP), {
    tier: "pro",
    cadence: "yearly",
  });
  assert.deepEqual(priceIdToTier("price_team_m", PRICE_MAP), {
    tier: "team",
    cadence: "monthly",
  });
  assert.deepEqual(priceIdToTier("price_team_y", PRICE_MAP), {
    tier: "team",
    cadence: "yearly",
  });
  assert.equal(priceIdToTier("price_unknown", PRICE_MAP), null);
  assert.equal(priceIdToTier(null, PRICE_MAP), null);
});

test("periodEndToIso — converts Unix seconds to ISO, rejects junk", () => {
  assert.equal(periodEndToIso(1_700_000_000), new Date(1_700_000_000_000).toISOString());
  assert.equal(periodEndToIso(0), null);
  assert.equal(periodEndToIso(-1), null);
  assert.equal(periodEndToIso(null), null);
  assert.equal(periodEndToIso(Number.NaN), null);
});

test("extractUserId — prefers client_reference_id, falls back to metadata.userId", () => {
  assert.equal(
    extractUserId({ client_reference_id: "u_123", metadata: { userId: "u_meta" } }),
    "u_123",
  );
  assert.equal(extractUserId({ metadata: { userId: "u_meta" } }), "u_meta");
  assert.equal(extractUserId({ client_reference_id: "  " }), null);
  assert.equal(extractUserId(null), null);
});

// -----------------------------------------------------------------------------
// checkout.session.completed
// -----------------------------------------------------------------------------

test("checkout.session.completed — pro subscription → setUserTier(pro, expiresAt)", async () => {
  __resetProcessedEventsForTests();
  const rec = mkRecorder();
  const periodEnd = 1_800_000_000;
  const subscription = mkSubscription({
    id: "sub_pro_1",
    priceId: "price_pro_m",
    customer: "cus_1",
    userId: "u_1",
    currentPeriodEnd: periodEnd,
  });

  const event = mkEvent("checkout.session.completed", {
    id: "cs_1",
    object: "checkout.session",
    client_reference_id: "u_1",
    subscription: "sub_pro_1",
    metadata: { userId: "u_1", tier: "pro", cadence: "monthly" },
  });

  const deps = mkDeps(rec, {
    retrieveSubscription: async (id) => {
      assert.equal(id, "sub_pro_1");
      return subscription;
    },
  });

  const result = await handleStripeEvent(event, deps);
  assert.equal(result.handled, true);
  assert.equal(result.type, "checkout.session.completed");
  assert.equal(rec.calls.length, 1);
  assert.deepEqual(rec.calls[0], {
    userId: "u_1",
    tier: "pro",
    expiresAt: new Date(periodEnd * 1_000).toISOString(),
    source: "checkout.session.completed",
    subscriptionId: "sub_pro_1",
    customerId: "cus_1",
    cadence: "monthly",
  });
});

test("checkout.session.completed — missing client_reference_id → skip, not crash", async () => {
  __resetProcessedEventsForTests();
  const rec = mkRecorder();
  const event = mkEvent("checkout.session.completed", {
    id: "cs_missing",
    object: "checkout.session",
    client_reference_id: null,
    subscription: "sub_x",
    metadata: null,
  });
  const result = await handleStripeEvent(event, mkDeps(rec));
  assert.equal(result.handled, false);
  assert.equal(result.skipReason, "missing_user");
  assert.equal(rec.calls.length, 0);
});

// -----------------------------------------------------------------------------
// customer.subscription.updated — pro → team
// -----------------------------------------------------------------------------

test("customer.subscription.updated — pro → team upgrades tier", async () => {
  __resetProcessedEventsForTests();
  const rec = mkRecorder();
  const periodEnd = 1_900_000_000;
  const subscription = mkSubscription({
    id: "sub_upg",
    priceId: "price_team_y",
    customer: "cus_2",
    userId: "u_2",
    currentPeriodEnd: periodEnd,
  });
  const event = mkEvent("customer.subscription.updated", subscription);

  const result = await handleStripeEvent(event, mkDeps(rec));
  assert.equal(result.handled, true);
  assert.equal(rec.calls.length, 1);
  assert.equal(rec.calls[0].tier, "team");
  assert.equal(rec.calls[0].cadence, "yearly");
  assert.equal(rec.calls[0].expiresAt, new Date(periodEnd * 1_000).toISOString());
  assert.equal(rec.calls[0].userId, "u_2");
});

test("customer.subscription.updated — canceled status downgrades to free at period end", async () => {
  __resetProcessedEventsForTests();
  const rec = mkRecorder();
  const periodEnd = 1_950_000_000;
  const subscription = mkSubscription({
    id: "sub_cancel",
    priceId: "price_pro_m",
    customer: "cus_3",
    userId: "u_3",
    currentPeriodEnd: periodEnd,
    status: "canceled",
  });
  const event = mkEvent("customer.subscription.updated", subscription);

  const result = await handleStripeEvent(event, mkDeps(rec));
  assert.equal(result.handled, true);
  assert.equal(rec.calls.length, 1);
  assert.equal(rec.calls[0].tier, "free");
  assert.equal(rec.calls[0].expiresAt, new Date(periodEnd * 1_000).toISOString());
});

// -----------------------------------------------------------------------------
// customer.subscription.deleted
// -----------------------------------------------------------------------------

test("customer.subscription.deleted — immediate free, expiresAt=null", async () => {
  __resetProcessedEventsForTests();
  const rec = mkRecorder();
  const subscription = mkSubscription({
    id: "sub_del",
    priceId: "price_pro_m",
    customer: "cus_4",
    userId: "u_4",
    currentPeriodEnd: 1_999_000_000,
    status: "canceled",
  });
  const event = mkEvent("customer.subscription.deleted", subscription);

  const result = await handleStripeEvent(event, mkDeps(rec));
  assert.equal(result.handled, true);
  assert.equal(rec.calls.length, 1);
  assert.equal(rec.calls[0].tier, "free");
  assert.equal(rec.calls[0].expiresAt, null);
  assert.equal(rec.calls[0].userId, "u_4");
  assert.equal(rec.calls[0].source, "customer.subscription.deleted");
});

// -----------------------------------------------------------------------------
// invoice.payment_failed — no downgrade, first-dunning grace
// -----------------------------------------------------------------------------

test("invoice.payment_failed — logs only, no setUserTier call", async () => {
  __resetProcessedEventsForTests();
  const rec = mkRecorder();
  const event = mkEvent("invoice.payment_failed", {
    id: "in_1",
    object: "invoice",
    customer: "cus_5",
    subscription: "sub_5",
  });
  const result = await handleStripeEvent(event, mkDeps(rec));
  assert.equal(result.handled, true);
  assert.equal(rec.calls.length, 0);
});

// -----------------------------------------------------------------------------
// Idempotency
// -----------------------------------------------------------------------------

test("idempotent — same event.id twice produces one tier update", async () => {
  __resetProcessedEventsForTests();
  const rec = mkRecorder();
  const subscription = mkSubscription({
    id: "sub_idem",
    priceId: "price_pro_m",
    customer: "cus_6",
    userId: "u_6",
    currentPeriodEnd: 1_800_000_000,
  });
  const event = mkEvent(
    "checkout.session.completed",
    {
      id: "cs_idem",
      object: "checkout.session",
      client_reference_id: "u_6",
      subscription: "sub_idem",
      metadata: { userId: "u_6" },
    },
    "evt_idempotent_fixed",
  );
  const deps = mkDeps(rec, {
    retrieveSubscription: async () => subscription,
  });

  const first = await handleStripeEvent(event, deps);
  const second = await handleStripeEvent(event, deps);
  assert.equal(first.handled, true);
  assert.equal(second.handled, false);
  assert.equal(second.skipReason, "duplicate");
  assert.equal(rec.calls.length, 1);
});

// -----------------------------------------------------------------------------
// Unknown event type → no-op
// -----------------------------------------------------------------------------

test("unknown event type — 200 no-op, no tier calls", async () => {
  __resetProcessedEventsForTests();
  const rec = mkRecorder();
  const event = mkEvent("customer.created", { id: "cus_x", object: "customer" });
  const result = await handleStripeEvent(event, mkDeps(rec));
  assert.equal(result.handled, false);
  assert.equal(result.skipReason, "unknown_type");
  assert.equal(rec.calls.length, 0);
});

// -----------------------------------------------------------------------------
// Bad signature → 400 from the route
// -----------------------------------------------------------------------------

test("webhook route — bad signature returns 400", async () => {
  // Stand-in test: the route calls stripe.webhooks.constructEvent which
  // throws on bad sig. We reproduce that boundary with a minimal stub so
  // the test doesn't need a real Stripe key. The real signature check is
  // battle-tested by Stripe's SDK; our responsibility is to map the throw
  // to a 400 response.
  const prior = {
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
  };
  process.env.STRIPE_SECRET_KEY = "sk_test_dummy_do_not_use";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_dummy_do_not_use";

  try {
    const routeMod = await import("../../../app/api/webhooks/stripe/route.js").catch(
      () => null,
    );
    const ts = routeMod ?? (await import("../../../app/api/webhooks/stripe/route"));

    const fakeRequest = {
      headers: new Headers({
        "content-type": "application/json",
        "stripe-signature": "t=0,v1=deadbeef",
      }),
      text: async () => JSON.stringify({ id: "evt_x", type: "ping" }),
    } as unknown as Parameters<typeof ts.POST>[0];

    const res = await ts.POST(fakeRequest);
    assert.equal(res.status, 400);
    const body = (await res.json()) as { ok: boolean; code?: string };
    assert.equal(body.ok, false);
    assert.equal(body.code, "BAD_SIGNATURE");
  } finally {
    if (prior.STRIPE_SECRET_KEY === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = prior.STRIPE_SECRET_KEY;
    if (prior.STRIPE_WEBHOOK_SECRET === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
    else process.env.STRIPE_WEBHOOK_SECRET = prior.STRIPE_WEBHOOK_SECRET;
  }
});
