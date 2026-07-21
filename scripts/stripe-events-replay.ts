// Operator tool — re-run a Stripe webhook event through the durable ledger.
//
//   npm run stripe:events:replay -- --event evt_123              (dry-run)
//   npm run stripe:events:replay -- --event evt_123 --apply      (apply)
//   npm run stripe:events:replay -- --event evt_123 --apply --force
//
// Dry-run by DEFAULT: retrieves the event from Stripe (source of truth) and
// prints the projected outcome WITHOUT mutating anything. `--apply` runs the
// projection through the same durable ledger the webhook uses. `--force` lets
// `--apply` reprocess an already-succeeded event (a succeeded row is otherwise
// a duplicate no-op). Never prints secrets or raw payloads.
//
// Requires STRIPE_SECRET_KEY to retrieve the event; skips with a clear status
// when it is unset (it must not pretend to have replayed anything).

import { createHash } from "node:crypto";

interface ReplayArgs {
  eventId: string | undefined;
  apply: boolean;
  force: boolean;
}

function parseArgs(argv: string[]): ReplayArgs {
  const flagValue = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 && i + 1 < argv.length ? argv[i + 1] : undefined;
  };
  return {
    eventId: flagValue("--event"),
    apply: argv.includes("--apply"),
    force: argv.includes("--force"),
  };
}

async function resetLedgerRowToFailed(eventId: string): Promise<void> {
  if (!process.env.DATABASE_URL) return; // in-memory ledger has no prior row
  const [{ getDb }, { stripeWebhookEvents }, { eq }] = await Promise.all([
    import("@/lib/db/client"),
    import("@/lib/db/schema/stripe-webhook-events"),
    import("drizzle-orm"),
  ]);
  // `failed` is reclaimable by the ledger, so the next claim reprocesses it.
  await getDb()
    .update(stripeWebhookEvents)
    .set({ status: "failed", leaseExpiresAt: null })
    .where(eq(stripeWebhookEvents.eventId, eventId));
}

async function main(): Promise<void> {
  const { eventId, apply, force } = parseArgs(process.argv.slice(2));

  if (!eventId || !eventId.startsWith("evt_")) {
    console.error("usage: stripe:events:replay -- --event evt_... [--apply] [--force]");
    process.exit(2);
    return;
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    console.log(
      JSON.stringify(
        {
          ok: false,
          skipped: true,
          reason: "STRIPE_SECRET_KEY not set — cannot retrieve the event",
          eventId,
        },
        null,
        2,
      ),
    );
    process.exit(0);
    return;
  }

  const { getStripeClient, loadPriceIds } = await import("@/lib/stripe/client");
  const { handleStripeEvent } = await import("@/lib/stripe/events");
  const { getStripeEventLedger, processStripeEvent, extractStripeObjectId } =
    await import("@/lib/stripe/event-ledger");
  const { setUserTier } = await import("@/lib/pricing/user-tiers");

  const stripe = getStripeClient();
  const event = await stripe.events.retrieve(eventId);

  const summary = {
    eventId: event.id,
    type: event.type,
    created: event.created,
    objectId: extractStripeObjectId(event),
    livemode: event.livemode,
    mode: apply ? "apply" : "dry-run",
    force,
  };

  if (!apply) {
    console.log(JSON.stringify({ ok: true, dryRun: true, wouldProcess: summary }, null, 2));
    return;
  }

  if (force) {
    await resetLedgerRowToFailed(eventId).catch(() => {
      /* best-effort; a missing row just means a fresh claim */
    });
  }

  const ledger = getStripeEventLedger();
  const deps = {
    setUserTier: async (
      userId: string,
      tier: "free" | "pro" | "team",
      expiresAt: string | null,
      extras?: { stripeCustomerId?: string | null; stripeSubscriptionId?: string | null },
    ) => {
      await setUserTier(userId, tier, expiresAt, {
        stripeCustomerId: extras?.stripeCustomerId,
        stripeSubscriptionId: extras?.stripeSubscriptionId,
      });
    },
    priceMap: loadPriceIds(),
    retrieveSubscription: (id: string) => stripe.subscriptions.retrieve(id),
  };

  const payloadSha256 = createHash("sha256").update(JSON.stringify(event)).digest("hex");
  const outcome = await processStripeEvent(
    event,
    ledger,
    (e) => handleStripeEvent(e, deps),
    payloadSha256,
  );
  console.log(
    JSON.stringify(
      { ok: outcome.status < 400, applied: summary, status: outcome.status, outcome: outcome.body },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error("[stripe:events:replay] failed:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
