// Stripe subscription-status helpers — shared by the account-deletion guard
// (and any surface that must know "is this customer still being billed?").
//
// Lives in lib (not the route) because Next 15 forbids non-handler exports from
// a route.ts, and the account-delete route needs to reuse this logic.

import "server-only";

/**
 * Stripe subscription statuses that still bill the customer. An account with a
 * subscription in one of these states must not be silently erased — the card
 * keeps getting charged after "deletion".
 */
const ACTIVELY_BILLING_STATUSES = new Set<string>([
  "active",
  "trialing",
  "past_due",
  "unpaid",
]);

export function isActivelyBillingStatus(status: string): boolean {
  return ACTIVELY_BILLING_STATUSES.has(status);
}

/**
 * True when a Stripe subscription is still billing. Without a Stripe secret we
 * cannot verify, so we err toward the customer's wallet and report `true`
 * (block deletion) rather than erase an account that keeps getting charged.
 * A missing / already-canceled subscription reports `false`.
 */
export async function hasActivePaidSubscription(
  subscriptionId: string,
): Promise<boolean> {
  if (!process.env.STRIPE_SECRET_KEY) return true;
  try {
    const { getStripeClient } = await import("@/lib/stripe/client");
    const sub = await getStripeClient().subscriptions.retrieve(subscriptionId);
    return isActivelyBillingStatus(sub.status);
  } catch {
    return false;
  }
}
