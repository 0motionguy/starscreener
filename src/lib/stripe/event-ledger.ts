// Durable Stripe webhook event ledger — idempotency, lease-based retry, and
// out-of-order protection.
//
// Replaces two broken "seen before committed" markers:
//   - the process-local Set<string> in events.ts (reset on cold start);
//   - the Redis SET NX lock in idempotency.ts (24h-durable, never released on
//     failure — the worst of the two: a transient DB error left the key set,
//     so Stripe's retry was acked as a duplicate and the entitlement was
//     dropped for a paying customer).
//
// State machine (status column):
//   received → processing → succeeded | ignored          (terminal)
//                        ↘ failed → processing (reclaim) → ...
//
// A delivery is a DUPLICATE only when its status is `succeeded` or `ignored`.
// `processing`/`failed` are reprocessable: `failed` reclaims immediately, a
// `processing` row reclaims once its lease expires (crashed handler), while a
// FRESH lease reports `busy` so a live handler isn't double-run.
//
// Two backends behind one port: Postgres (`tr.stripe_webhook_events`) when
// DATABASE_URL is set, an in-memory Map otherwise (dev/CI). Tests inject a
// `MemoryStripeEventLedger` directly.

import "server-only";

import type Stripe from "stripe";

import type {
  HandleStripeEventResult,
} from "./events";

// ---------------------------------------------------------------------------
// Port
// ---------------------------------------------------------------------------

export type ClaimAction = "process" | "duplicate" | "busy";

export interface ClaimDecision {
  action: ClaimAction;
  /** Attempt number for a `process` claim (1 on first delivery). */
  attempt?: number;
}

export interface ClaimInput {
  eventId: string;
  eventType: string;
  /** Subscription id where the event concerns one, for the out-of-order guard. */
  objectId: string | null;
  livemode: boolean;
  /** Stripe `event.created`, seconds since epoch. */
  eventCreatedAtSec: number;
  payloadSha256: string;
}

export interface StripeEventLedger {
  /** Atomically claim an event for processing. */
  claim(input: ClaimInput): Promise<ClaimDecision>;
  markSucceeded(eventId: string): Promise<void>;
  markIgnored(eventId: string): Promise<void>;
  markFailed(
    eventId: string,
    errorCode: string | null,
    errorRedacted: string | null,
  ): Promise<void>;
  /**
   * Latest `event.created` (seconds) among SUCCEEDED events for `objectId`,
   * excluding `excludeEventId`. Null when none. Powers the monotonic guard:
   * a stale event whose created < this must not overwrite the newer state.
   */
  latestSucceededCreatedSec(
    objectId: string,
    excludeEventId: string,
  ): Promise<number | null>;
}

/** Lease duration for an in-flight `processing` claim. */
export const LEASE_MS = 60_000;

// ---------------------------------------------------------------------------
// In-memory backend (dev/CI + tests)
// ---------------------------------------------------------------------------

interface MemRow {
  status: "received" | "processing" | "succeeded" | "failed" | "ignored";
  attemptCount: number;
  leaseExpiresAtMs: number | null;
  objectId: string | null;
  eventCreatedAtSec: number;
}

export class MemoryStripeEventLedger implements StripeEventLedger {
  private rows = new Map<string, MemRow>();
  /** Injectable clock so tests can advance time deterministically. */
  constructor(private now: () => number = () => Date.now()) {}

  async claim(input: ClaimInput): Promise<ClaimDecision> {
    const t = this.now();
    const existing = this.rows.get(input.eventId);
    if (!existing) {
      this.rows.set(input.eventId, {
        status: "processing",
        attemptCount: 1,
        leaseExpiresAtMs: t + LEASE_MS,
        objectId: input.objectId,
        eventCreatedAtSec: input.eventCreatedAtSec,
      });
      return { action: "process", attempt: 1 };
    }
    if (existing.status === "succeeded" || existing.status === "ignored") {
      return { action: "duplicate" };
    }
    const staleLease =
      existing.status === "processing" &&
      (existing.leaseExpiresAtMs === null || existing.leaseExpiresAtMs < t);
    if (existing.status === "failed" || existing.status === "received" || staleLease) {
      existing.status = "processing";
      existing.attemptCount += 1;
      existing.leaseExpiresAtMs = t + LEASE_MS;
      return { action: "process", attempt: existing.attemptCount };
    }
    return { action: "busy" };
  }

  async markSucceeded(eventId: string): Promise<void> {
    const r = this.rows.get(eventId);
    if (r) {
      r.status = "succeeded";
      r.leaseExpiresAtMs = null;
    }
  }

  async markIgnored(eventId: string): Promise<void> {
    const r = this.rows.get(eventId);
    if (r) {
      r.status = "ignored";
      r.leaseExpiresAtMs = null;
    }
  }

  async markFailed(eventId: string): Promise<void> {
    const r = this.rows.get(eventId);
    if (r) {
      r.status = "failed";
      r.leaseExpiresAtMs = null;
    }
  }

  async latestSucceededCreatedSec(
    objectId: string,
    excludeEventId: string,
  ): Promise<number | null> {
    let max: number | null = null;
    for (const [id, r] of this.rows.entries()) {
      if (id === excludeEventId) continue;
      if (r.status !== "succeeded") continue;
      if (r.objectId !== objectId) continue;
      if (max === null || r.eventCreatedAtSec > max) max = r.eventCreatedAtSec;
    }
    return max;
  }
}

// ---------------------------------------------------------------------------
// Postgres backend
// ---------------------------------------------------------------------------
//
// Lazy DB imports keep postgres-js + the server-only DB client out of the
// module graph for the in-memory path (dev/CI/tests).

class PostgresStripeEventLedger implements StripeEventLedger {
  async claim(input: ClaimInput): Promise<ClaimDecision> {
    const [{ getDb }, { stripeWebhookEvents }, { and, eq, lt, or, sql }] =
      await Promise.all([
        import("@/lib/db/client"),
        import("@/lib/db/schema/stripe-webhook-events"),
        import("drizzle-orm"),
      ]);
    const db = getDb();
    const now = new Date();
    const lease = new Date(now.getTime() + LEASE_MS);
    const eventCreatedAt = new Date(input.eventCreatedAtSec * 1_000);

    // 1. Fresh claim — insert as `processing`. ON CONFLICT DO NOTHING makes
    //    this the atomic first-claimant test across instances.
    const inserted = await db
      .insert(stripeWebhookEvents)
      .values({
        eventId: input.eventId,
        eventType: input.eventType,
        objectId: input.objectId,
        livemode: input.livemode,
        status: "processing",
        attemptCount: 1,
        receivedAt: now,
        processingStartedAt: now,
        leaseExpiresAt: lease,
        payloadSha256: input.payloadSha256,
        eventCreatedAt,
      })
      .onConflictDoNothing({ target: stripeWebhookEvents.eventId })
      .returning({ eventId: stripeWebhookEvents.eventId });
    if (inserted.length > 0) return { action: "process", attempt: 1 };

    // 2. Conflict — try to reclaim a failed / received / stale-processing row.
    const reclaimed = await db
      .update(stripeWebhookEvents)
      .set({
        status: "processing",
        processingStartedAt: now,
        leaseExpiresAt: lease,
        attemptCount: sql`${stripeWebhookEvents.attemptCount} + 1`,
      })
      .where(
        and(
          eq(stripeWebhookEvents.eventId, input.eventId),
          or(
            eq(stripeWebhookEvents.status, "failed"),
            eq(stripeWebhookEvents.status, "received"),
            and(
              eq(stripeWebhookEvents.status, "processing"),
              lt(stripeWebhookEvents.leaseExpiresAt, now),
            ),
          ),
        ),
      )
      .returning({ attemptCount: stripeWebhookEvents.attemptCount });
    if (reclaimed.length > 0) {
      return { action: "process", attempt: reclaimed[0].attemptCount };
    }

    // 3. Not reclaimable — succeeded/ignored (duplicate) or a fresh lease (busy).
    const rows = await db
      .select({ status: stripeWebhookEvents.status })
      .from(stripeWebhookEvents)
      .where(eq(stripeWebhookEvents.eventId, input.eventId))
      .limit(1);
    const status = rows[0]?.status;
    if (status === "succeeded" || status === "ignored") return { action: "duplicate" };
    return { action: "busy" };
  }

  async markSucceeded(eventId: string): Promise<void> {
    await this.setTerminal(eventId, "succeeded");
  }

  async markIgnored(eventId: string): Promise<void> {
    await this.setTerminal(eventId, "ignored");
  }

  private async setTerminal(
    eventId: string,
    status: "succeeded" | "ignored",
  ): Promise<void> {
    const [{ getDb }, { stripeWebhookEvents }, { eq }] = await Promise.all([
      import("@/lib/db/client"),
      import("@/lib/db/schema/stripe-webhook-events"),
      import("drizzle-orm"),
    ]);
    await getDb()
      .update(stripeWebhookEvents)
      .set({ status, succeededAt: new Date(), leaseExpiresAt: null })
      .where(eq(stripeWebhookEvents.eventId, eventId));
  }

  async markFailed(
    eventId: string,
    errorCode: string | null,
    errorRedacted: string | null,
  ): Promise<void> {
    const [{ getDb }, { stripeWebhookEvents }, { eq }] = await Promise.all([
      import("@/lib/db/client"),
      import("@/lib/db/schema/stripe-webhook-events"),
      import("drizzle-orm"),
    ]);
    await getDb()
      .update(stripeWebhookEvents)
      .set({
        status: "failed",
        lastFailedAt: new Date(),
        lastErrorCode: errorCode,
        lastErrorRedacted: errorRedacted,
        leaseExpiresAt: null,
      })
      .where(eq(stripeWebhookEvents.eventId, eventId));
  }

  async latestSucceededCreatedSec(
    objectId: string,
    excludeEventId: string,
  ): Promise<number | null> {
    const [{ getDb }, { stripeWebhookEvents }, { and, eq, ne, sql }] =
      await Promise.all([
        import("@/lib/db/client"),
        import("@/lib/db/schema/stripe-webhook-events"),
        import("drizzle-orm"),
      ]);
    const rows = await getDb()
      .select({ max: sql<Date | null>`max(${stripeWebhookEvents.eventCreatedAt})` })
      .from(stripeWebhookEvents)
      .where(
        and(
          eq(stripeWebhookEvents.objectId, objectId),
          eq(stripeWebhookEvents.status, "succeeded"),
          ne(stripeWebhookEvents.eventId, excludeEventId),
        ),
      );
    const max = rows[0]?.max ?? null;
    return max ? Math.floor(new Date(max).getTime() / 1_000) : null;
  }
}

/** Returns the Postgres ledger when DATABASE_URL is configured, else in-memory. */
export function getStripeEventLedger(): StripeEventLedger {
  const url = process.env.DATABASE_URL;
  if (typeof url === "string" && url.trim().length > 0) {
    return new PostgresStripeEventLedger();
  }
  return new MemoryStripeEventLedger();
}

// ---------------------------------------------------------------------------
// Orchestration (testable — inject a MemoryStripeEventLedger + a fake handler)
// ---------------------------------------------------------------------------

/** Subscription-lifecycle events get the per-subscription out-of-order guard. */
const SUBSCRIPTION_LIFECYCLE = new Set<string>([
  "customer.subscription.updated",
  "customer.subscription.deleted",
]);

/**
 * Best-effort extraction of the SUBSCRIPTION id an event concerns — used as
 * `object_id` so the out-of-order guard is keyed per subscription (a stale
 * update can't resurrect a canceled sub). Falls back to the primary object id.
 */
export function extractStripeObjectId(event: Stripe.Event): string | null {
  const obj = event.data.object as unknown as Record<string, unknown>;
  const sub = obj?.subscription;
  if (typeof sub === "string" && sub.length > 0) return sub;
  if (sub && typeof sub === "object" && typeof (sub as { id?: unknown }).id === "string") {
    return (sub as { id: string }).id;
  }
  const id = obj?.id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

export interface WebhookOutcome {
  status: number;
  body: {
    ok: boolean;
    handled?: boolean;
    type: string;
    skipReason?: string;
    code?: string;
  };
}

/**
 * Run one verified Stripe event through the durable ledger and the projector.
 * Pure orchestration: the ledger and the event handler are injected so this is
 * unit-testable with a MemoryStripeEventLedger and a fake handler.
 */
export async function processStripeEvent(
  event: Stripe.Event,
  ledger: StripeEventLedger,
  handleEvent: (e: Stripe.Event) => Promise<HandleStripeEventResult>,
  payloadSha256: string,
): Promise<WebhookOutcome> {
  const objectId = extractStripeObjectId(event);

  const claim = await ledger.claim({
    eventId: event.id,
    eventType: event.type,
    objectId,
    livemode: Boolean(event.livemode),
    eventCreatedAtSec: typeof event.created === "number" ? event.created : 0,
    payloadSha256,
  });

  if (claim.action === "duplicate") {
    return {
      status: 200,
      body: { ok: true, handled: false, type: event.type, skipReason: "duplicate" },
    };
  }
  if (claim.action === "busy") {
    // A live handler holds a fresh lease. Ask Stripe to retry — do NOT ack, or
    // we'd falsely report completion for an in-flight (or crashing) handler.
    return {
      status: 409,
      body: { ok: false, type: event.type, code: "EVENT_IN_PROGRESS" },
    };
  }

  // Out-of-order guard for subscription lifecycle: skip a stale event whose
  // emission time predates an already-succeeded event for the same sub.
  if (SUBSCRIPTION_LIFECYCLE.has(event.type) && objectId) {
    const newest = await ledger.latestSucceededCreatedSec(objectId, event.id);
    const created = typeof event.created === "number" ? event.created : 0;
    if (newest !== null && newest > created) {
      await ledger.markIgnored(event.id);
      return {
        status: 200,
        body: {
          ok: true,
          handled: false,
          type: event.type,
          skipReason: "stale_out_of_order",
        },
      };
    }
  }

  try {
    const result = await handleEvent(event);
    if (result.handled) {
      await ledger.markSucceeded(event.id);
    } else {
      // Non-error, non-actioned event: unknown_type, missing_user, or
      // missing_tier (a price not in our map). Durably IGNORE so a retry
      // doesn't reprocess — this is not a failure, Stripe just delivered
      // something we don't project.
      await ledger.markIgnored(event.id);
    }
    return { status: 200, body: { ok: true, ...result } };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await ledger.markFailed(event.id, "HANDLER_ERROR", message.slice(0, 500));
    // 5xx so Stripe retries; the failed row stays reprocessable.
    return {
      status: 500,
      body: { ok: false, type: event.type, code: "HANDLER_ERROR" },
    };
  }
}
