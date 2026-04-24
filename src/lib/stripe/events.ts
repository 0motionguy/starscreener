// Stripe webhook event dispatch.
//
// Every handled event funnels through `handleStripeEvent()` which:
//   1. Tracks event.id in an in-memory idempotency set (MVP). Stripe's retry-
//      until-200 contract plus this dedupe gives us "at-least-once + dedupe"
//      without needing a DB.
//   2. Looks up the target price's tier mapping.
//   3. Calls `setUserTier(userId, tier, expiresAt)` — the one-way door into
//      the pricing/entitlements store. The parallel agent owns the real
//      implementation; we consume it via a narrow port so tests can inject
//      an in-memory stub.
//
// NOTE on setUserTier availability:
//   If `src/lib/pricing/user-tiers.ts` exists at integration time, the
//   webhook route will import `setUserTier` from there. Until then we expose
//   a typed port and a local stub the route picks up automatically (the
//   stub only logs; it's replaced at integration without touching this file).

import type Stripe from "stripe";

/** Tier identifiers this module understands. Must match the parallel agent. */
export type StripeTier = "free" | "pro" | "team";

/** Cadence is carried in Checkout metadata so we can reflect it back. */
export type StripeCadence = "monthly" | "yearly";

/**
 * The single port this module needs into the tier store. When the parallel
 * agent's `src/lib/pricing/user-tiers.ts` lands we pass `setUserTier` from
 * there; until then we pass the local stub defined in the webhook route.
 *
 * `expiresAt` is an ISO-8601 timestamp or `null` (no expiry — e.g. for
 * free-tier downgrades). The store is responsible for persistence.
 */
export type SetUserTierFn = (
  userId: string,
  tier: StripeTier,
  expiresAt: string | null,
  extras?: SetUserTierExtras,
) => Promise<void> | void;

export interface SetUserTierExtras {
  /** Stripe customer id — lets the store link the user to their billing record. */
  stripeCustomerId?: string | null;
  /** Stripe subscription id — lets the store read proration + upcoming invoice. */
  stripeSubscriptionId?: string | null;
  /** Monthly / yearly. Useful for UI display and analytics. */
  cadence?: StripeCadence | null;
  /** Which event triggered this — for audit logs. */
  source: StripeEventSource;
}

export type StripeEventSource =
  | "checkout.session.completed"
  | "customer.subscription.updated"
  | "customer.subscription.deleted"
  | "invoice.payment_failed";

/**
 * Price-to-tier mapping. The webhook computes tier from the subscription's
 * current active price, not from metadata — metadata can drift after upgrade.
 */
export interface PriceToTierMap {
  proMonthly: string | null;
  proYearly: string | null;
  teamMonthly: string | null;
  teamYearly: string | null;
}

export function priceIdToTier(
  priceId: string | null | undefined,
  map: PriceToTierMap,
): { tier: StripeTier; cadence: StripeCadence } | null {
  if (!priceId) return null;
  if (priceId === map.proMonthly) return { tier: "pro", cadence: "monthly" };
  if (priceId === map.proYearly) return { tier: "pro", cadence: "yearly" };
  if (priceId === map.teamMonthly) return { tier: "team", cadence: "monthly" };
  if (priceId === map.teamYearly) return { tier: "team", cadence: "yearly" };
  return null;
}

/**
 * Extract the userId Stripe echoed back. Checkout sessions carry it in
 * `client_reference_id`; subscription events carry it in `metadata.userId`
 * (we set both in the checkout route). Returns null if neither is present.
 */
export function extractUserId(
  source:
    | { client_reference_id?: string | null; metadata?: Stripe.Metadata | null }
    | null,
): string | null {
  if (!source) return null;
  const ref = source.client_reference_id;
  if (typeof ref === "string" && ref.trim().length > 0) return ref.trim();
  const meta = source.metadata;
  if (meta && typeof meta === "object") {
    const candidate = meta["userId"];
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }
  return null;
}

/**
 * Turn a subscription's `current_period_end` (Unix seconds) into an ISO
 * timestamp. Returns null for missing / invalid values — the store then
 * treats "no expiry" as "active indefinitely until the next webhook".
 */
export function periodEndToIso(unixSeconds: number | null | undefined): string | null {
  if (typeof unixSeconds !== "number" || !Number.isFinite(unixSeconds) || unixSeconds <= 0) {
    return null;
  }
  return new Date(unixSeconds * 1_000).toISOString();
}

// ---------------------------------------------------------------------------
// Idempotency — MVP in-memory set keyed by event.id. Stripe retries failed
// webhooks with the same event.id, so this dedupes accidental double-processes
// within the same Lambda. Serverless cold starts reset it — acceptable since
// Stripe's at-least-once contract means duplicate reprocessing is still safe
// (setUserTier is idempotent: same tier twice = same end state).
// ---------------------------------------------------------------------------
const PROCESSED_EVENT_IDS = new Set<string>();
/** Hard cap so a long-lived warm Lambda doesn't leak memory. FIFO eviction. */
const MAX_PROCESSED_IDS = 2_048;

function markProcessed(eventId: string): boolean {
  if (PROCESSED_EVENT_IDS.has(eventId)) return false;
  if (PROCESSED_EVENT_IDS.size >= MAX_PROCESSED_IDS) {
    const oldest = PROCESSED_EVENT_IDS.values().next().value;
    if (oldest !== undefined) PROCESSED_EVENT_IDS.delete(oldest);
  }
  PROCESSED_EVENT_IDS.add(eventId);
  return true;
}

/** Test-only: reset idempotency state. */
export function __resetProcessedEventsForTests(): void {
  PROCESSED_EVENT_IDS.clear();
}

// ---------------------------------------------------------------------------
// Handler dispatch
// ---------------------------------------------------------------------------

export interface HandleStripeEventDeps {
  setUserTier: SetUserTierFn;
  priceMap: PriceToTierMap;
  /**
   * Used to load a subscription when an event references one by id. Normally
   * the Stripe SDK's `subscriptions.retrieve`. Injected so tests can pass a
   * lightweight stub without a real Stripe client.
   */
  retrieveSubscription: (subscriptionId: string) => Promise<Stripe.Subscription>;
  /** Optional structured logger. Defaults to console.log. */
  log?: (msg: string, context?: Record<string, unknown>) => void;
}

export interface HandleStripeEventResult {
  /** Did we actually dispatch a handler (vs. skipped for idempotency / unknown type)? */
  handled: boolean;
  /** Event type — echoed for logs and the route's JSON response. */
  type: string;
  /** Explanation when `handled === false`. */
  skipReason?: "duplicate" | "unknown_type" | "missing_user" | "missing_tier";
}

export async function handleStripeEvent(
  event: Stripe.Event,
  deps: HandleStripeEventDeps,
): Promise<HandleStripeEventResult> {
  const log = deps.log ?? defaultLog;

  // Idempotency gate — any repeat event short-circuits here.
  const fresh = markProcessed(event.id);
  if (!fresh) {
    log("[stripe] duplicate event skipped", { id: event.id, type: event.type });
    return { handled: false, type: event.type, skipReason: "duplicate" };
  }

  switch (event.type) {
    case "checkout.session.completed":
      return handleCheckoutCompleted(event, deps, log);
    case "customer.subscription.updated":
      return handleSubscriptionUpdated(event, deps, log);
    case "customer.subscription.deleted":
      return handleSubscriptionDeleted(event, deps, log);
    case "invoice.payment_failed":
      return handleInvoicePaymentFailed(event, log);
    default:
      // Unknown event type — Stripe delivers many we don't subscribe to when
      // operators accidentally select "all events". Ack with 200.
      log("[stripe] unhandled event type", { id: event.id, type: event.type });
      return { handled: false, type: event.type, skipReason: "unknown_type" };
  }
}

async function handleCheckoutCompleted(
  event: Stripe.Event,
  deps: HandleStripeEventDeps,
  log: NonNullable<HandleStripeEventDeps["log"]>,
): Promise<HandleStripeEventResult> {
  const session = event.data.object as Stripe.Checkout.Session;
  const userId = extractUserId({
    client_reference_id: session.client_reference_id,
    metadata: session.metadata,
  });
  if (!userId) {
    log("[stripe] checkout.session.completed without userId", { id: event.id });
    return { handled: false, type: event.type, skipReason: "missing_user" };
  }

  // Resolve the subscription. Checkout with mode=subscription always produces
  // one. `session.subscription` is either a string id or an expanded object.
  const subscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id ?? null;
  if (!subscriptionId) {
    log("[stripe] checkout.session.completed with no subscription id", { id: event.id });
    return { handled: false, type: event.type, skipReason: "missing_tier" };
  }

  const subscription = await deps.retrieveSubscription(subscriptionId);
  const priceId = extractActivePriceId(subscription);
  const mapping = priceIdToTier(priceId, deps.priceMap);
  if (!mapping) {
    log("[stripe] checkout.session.completed — priceId not in map", {
      id: event.id,
      priceId,
    });
    return { handled: false, type: event.type, skipReason: "missing_tier" };
  }

  await deps.setUserTier(
    userId,
    mapping.tier,
    periodEndToIso(subscription.current_period_end),
    {
      stripeCustomerId: stringOrNull(subscription.customer),
      stripeSubscriptionId: subscription.id,
      cadence: mapping.cadence,
      source: "checkout.session.completed",
    },
  );
  log("[stripe] checkout.session.completed applied", {
    userId,
    tier: mapping.tier,
    cadence: mapping.cadence,
  });
  return { handled: true, type: event.type };
}

async function handleSubscriptionUpdated(
  event: Stripe.Event,
  deps: HandleStripeEventDeps,
  log: NonNullable<HandleStripeEventDeps["log"]>,
): Promise<HandleStripeEventResult> {
  const subscription = event.data.object as Stripe.Subscription;
  const userId = extractUserId({ metadata: subscription.metadata });
  if (!userId) {
    log("[stripe] customer.subscription.updated without userId", { id: event.id });
    return { handled: false, type: event.type, skipReason: "missing_user" };
  }

  // Status → tier policy:
  //   active | trialing | past_due  → compute tier from active price
  //   (past_due keeps access through the first dunning window — Stripe's
  //    `current_period_end` reflects the grace period; we trust that.)
  //   unpaid | canceled | incomplete_expired → downgrade to free at period end
  const status = subscription.status;
  const priceId = extractActivePriceId(subscription);
  const mapping = priceIdToTier(priceId, deps.priceMap);

  if (status === "canceled" || status === "unpaid" || status === "incomplete_expired") {
    // Downgrade effective at period end — that's what Stripe already encodes
    // in current_period_end for a canceled-at-period-end subscription. If
    // status is canceled immediately, current_period_end is still the last
    // paid-through moment, so the store can honor it and then drop to free.
    await deps.setUserTier(userId, "free", periodEndToIso(subscription.current_period_end), {
      stripeCustomerId: stringOrNull(subscription.customer),
      stripeSubscriptionId: subscription.id,
      cadence: mapping?.cadence ?? null,
      source: "customer.subscription.updated",
    });
    log("[stripe] customer.subscription.updated → free (terminal status)", {
      userId,
      status,
    });
    return { handled: true, type: event.type };
  }

  if (!mapping) {
    log("[stripe] customer.subscription.updated — priceId not in map", {
      id: event.id,
      priceId,
      status,
    });
    return { handled: false, type: event.type, skipReason: "missing_tier" };
  }

  await deps.setUserTier(
    userId,
    mapping.tier,
    periodEndToIso(subscription.current_period_end),
    {
      stripeCustomerId: stringOrNull(subscription.customer),
      stripeSubscriptionId: subscription.id,
      cadence: mapping.cadence,
      source: "customer.subscription.updated",
    },
  );
  log("[stripe] customer.subscription.updated applied", {
    userId,
    tier: mapping.tier,
    cadence: mapping.cadence,
    status,
  });
  return { handled: true, type: event.type };
}

async function handleSubscriptionDeleted(
  event: Stripe.Event,
  deps: HandleStripeEventDeps,
  log: NonNullable<HandleStripeEventDeps["log"]>,
): Promise<HandleStripeEventResult> {
  const subscription = event.data.object as Stripe.Subscription;
  const userId = extractUserId({ metadata: subscription.metadata });
  if (!userId) {
    log("[stripe] customer.subscription.deleted without userId", { id: event.id });
    return { handled: false, type: event.type, skipReason: "missing_user" };
  }

  // Immediate downgrade — the subscription is gone. expiresAt = null so the
  // store doesn't keep the previous tier alive until some period_end value.
  await deps.setUserTier(userId, "free", null, {
    stripeCustomerId: stringOrNull(subscription.customer),
    stripeSubscriptionId: subscription.id,
    cadence: null,
    source: "customer.subscription.deleted",
  });
  log("[stripe] customer.subscription.deleted → free", { userId });
  return { handled: true, type: event.type };
}

async function handleInvoicePaymentFailed(
  event: Stripe.Event,
  log: NonNullable<HandleStripeEventDeps["log"]>,
): Promise<HandleStripeEventResult> {
  // First-dunning grace — log only, don't downgrade. The subsequent
  // customer.subscription.updated (with status=past_due → unpaid → canceled)
  // carries the tier change when Stripe's dunning flow gives up.
  const invoice = event.data.object as Stripe.Invoice;
  log("[stripe] invoice.payment_failed (no downgrade; grace)", {
    id: event.id,
    customerId: typeof invoice.customer === "string" ? invoice.customer : null,
    subscriptionId:
      typeof invoice.subscription === "string" ? invoice.subscription : null,
  });
  return { handled: true, type: event.type };
}

function extractActivePriceId(subscription: Stripe.Subscription): string | null {
  const items = subscription.items?.data;
  if (!Array.isArray(items) || items.length === 0) return null;
  const first = items[0];
  if (!first) return null;
  const price = first.price;
  if (!price) return null;
  return typeof price.id === "string" && price.id.length > 0 ? price.id : null;
}

function stringOrNull(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) return value;
  return null;
}

function defaultLog(msg: string, context?: Record<string, unknown>): void {
  if (context && Object.keys(context).length > 0) {
    console.log(msg, context);
  } else {
    console.log(msg);
  }
}
