// Drizzle schema — `stripe_webhook_events` table.
//
// The DURABLE idempotency + retry ledger for Stripe webhook delivery. Replaces
// the process-local `Set<string>` (events.ts) and the Redis `SET NX` lock
// (idempotency.ts), both of which recorded "seen" BEFORE the entitlement write
// committed — so a transient DB failure poisoned Stripe's retry (the retry was
// acked as a duplicate and the paying customer never got their tier).
//
// Contract (see src/lib/stripe/event-ledger.ts + the webhook route):
//   - a delivery is a duplicate ONLY when its status is `succeeded` or
//     `ignored`; `received` / `processing` / `failed` remain reprocessable;
//   - `processing` carries a lease (`lease_expires_at`) so a crashed handler
//     can be reclaimed, while a live handler is not double-run;
//   - the row is marked `succeeded` AFTER the tier projection commits — NOT in
//     a single cross-module transaction. If the process dies between the tier
//     write and markSucceeded, the row stays `processing`, its lease expires,
//     and the event is reclaimed + REPROCESSED. That's safe because the tier
//     projection is idempotent (at-least-once), so a re-apply is a no-op;
//   - `event_created_at` (Stripe `event.created`) + `object_id` give the
//     out-of-order guard: a stale subscription event can't overwrite a newer
//     succeeded one.
//
// Payloads are NOT stored — only a `payload_sha256` fingerprint. Errors are
// stored redacted (`last_error_redacted`), never raw Stripe/PII bodies.

import { boolean, index, integer, text, timestamp } from "drizzle-orm/pg-core";

import { tr } from "./_schema";

/** Allowed `status` values. Kept in sync with the ledger state machine. */
export const STRIPE_EVENT_STATUSES = [
  "received",
  "processing",
  "succeeded",
  "failed",
  "ignored",
] as const;
export type StripeEventStatus = (typeof STRIPE_EVENT_STATUSES)[number];

export const stripeWebhookEvents = tr.table(
  "stripe_webhook_events",
  {
    /** Stripe `event.id` (evt_...). Natural idempotency key. */
    eventId: text("event_id").primaryKey(),
    eventType: text("event_type").notNull(),
    /** The primary Stripe object the event concerns (sub_/cs_/in_...), for the
     *  per-object out-of-order guard. Nullable for events without one. */
    objectId: text("object_id"),
    livemode: boolean("livemode").notNull(),
    /** received | processing | succeeded | failed | ignored */
    status: text("status").notNull(),
    attemptCount: integer("attempt_count").notNull().default(0),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    processingStartedAt: timestamp("processing_started_at", { withTimezone: true }),
    /** When the current `processing` lease expires; a stale lease is reclaimable. */
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    succeededAt: timestamp("succeeded_at", { withTimezone: true }),
    lastFailedAt: timestamp("last_failed_at", { withTimezone: true }),
    lastErrorCode: text("last_error_code"),
    lastErrorRedacted: text("last_error_redacted"),
    payloadSha256: text("payload_sha256").notNull(),
    /** Stripe `event.created` (event emission time), for the monotonic guard. */
    eventCreatedAt: timestamp("event_created_at", { withTimezone: true }),
  },
  (t) => [
    // Out-of-order guard: "latest succeeded event.created for this object".
    index("stripe_webhook_events_object_idx").on(t.objectId, t.status),
    // Operator readiness: failed/stuck counts + last-success time by status.
    index("stripe_webhook_events_status_idx").on(t.status),
  ],
);

export type StripeWebhookEventRow = typeof stripeWebhookEvents.$inferSelect;
export type NewStripeWebhookEventRow = typeof stripeWebhookEvents.$inferInsert;
