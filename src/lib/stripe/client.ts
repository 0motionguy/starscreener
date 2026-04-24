// Stripe client factory + env wiring.
//
// Kept tiny on purpose: route handlers call `getStripeClient()` when they need
// the SDK, `loadPriceIds()` when they need the env-mapped price catalogue, and
// `getStripeWebhookSecret()` when they need to verify a webhook signature.
// Everything throws on unset-when-required env rather than silently returning
// `null` — a misconfigured billing surface must 503, not 200.
//
// We pin `apiVersion` so a Stripe-side default bump can't silently change the
// shape of events we receive in production. Bump the pin deliberately.

import Stripe from "stripe";

/**
 * Pin matches the Stripe Node SDK's current stable API version. Typed as
 * `Stripe.LatestApiVersion` so a future SDK bump that changes the default
 * surfaces as a typecheck error here rather than a silent runtime shift in
 * event shape.
 */
export const STRIPE_API_VERSION: Stripe.LatestApiVersion = "2025-02-24.acacia";

/**
 * Build a Stripe client from `STRIPE_SECRET_KEY`.
 *
 * Throws when the env var is unset — callers must catch and surface a 503,
 * never a 500. See `src/app/api/checkout/stripe/route.ts` for the pattern.
 */
export function getStripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || key.trim().length === 0) {
    throw new Error(
      "STRIPE_SECRET_KEY unset — configure in env to enable checkout.",
    );
  }
  return new Stripe(key.trim(), {
    apiVersion: STRIPE_API_VERSION,
    typescript: true,
    // Keep the official Node SDK's default telemetry + retries. We only
    // override the API version to pin event shape.
  });
}

export interface PriceIds {
  proMonthly: string | null;
  proYearly: string | null;
  teamMonthly: string | null;
  teamYearly: string | null;
}

/**
 * Load the four self-serve price IDs from env.
 *
 * Each may be `null` if unset — callers resolve the specific ID they need and
 * return 503 when their requested (tier, cadence) pair is missing.
 */
export function loadPriceIds(): PriceIds {
  return {
    proMonthly: nonEmpty(process.env.STRIPE_PRO_MONTHLY_PRICE_ID),
    proYearly: nonEmpty(process.env.STRIPE_PRO_YEARLY_PRICE_ID),
    teamMonthly: nonEmpty(process.env.STRIPE_TEAM_MONTHLY_PRICE_ID),
    teamYearly: nonEmpty(process.env.STRIPE_TEAM_YEARLY_PRICE_ID),
  };
}

/**
 * Read the webhook signing secret. Returns `null` when unset so the webhook
 * route can respond with a clear 503 instead of a cryptic signature-verify
 * failure.
 */
export function getStripeWebhookSecret(): string | null {
  return nonEmpty(process.env.STRIPE_WEBHOOK_SECRET);
}

/**
 * Resolve the checkout portal return URL. Used to seed `success_url` /
 * `cancel_url` when we don't want to infer them from the inbound request
 * (e.g. when Stripe later redirects from the billing portal).
 */
export function getPortalReturnUrl(fallback: string): string {
  return nonEmpty(process.env.STRIPE_PORTAL_RETURN_URL) ?? fallback;
}

/** Map the four ({pro|team}, {monthly|yearly}) combinations to a price ID. */
export function resolvePriceId(
  priceIds: PriceIds,
  tier: "pro" | "team",
  cadence: "monthly" | "yearly",
): string | null {
  if (tier === "pro" && cadence === "monthly") return priceIds.proMonthly;
  if (tier === "pro" && cadence === "yearly") return priceIds.proYearly;
  if (tier === "team" && cadence === "monthly") return priceIds.teamMonthly;
  if (tier === "team" && cadence === "yearly") return priceIds.teamYearly;
  return null;
}

function nonEmpty(raw: string | undefined | null): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}
