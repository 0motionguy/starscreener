// Webhook delivery — shared types.
//
// Two roles live here:
//
//   WebhookTarget   — operator-controlled config row describing where an
//                     outbound message should go and what events qualify.
//                     Stored in data/webhook-targets.json; read by the
//                     publish layer at event time and the drain cron at
//                     deliver time.
//   WebhookDelivery — a single enqueued "send this payload to this target"
//                     instruction, persisted in .data/webhook-queue.jsonl
//                     until the drain cron POSTs it.
//
// The `events` and `provider` unions are closed on purpose — adding a new
// provider means shipping a formatter alongside it (src/lib/webhooks/
// providers/<name>.ts), and adding a new event means wiring a scan-path
// that calls publish*. Loose strings would make the cron silently skip.

export type WebhookProvider = "slack" | "discord";

export type WebhookEvent = "breakout" | "funding" | "revenue";

export interface WebhookFilters {
  /** Only fire breakouts when momentumScore >= this threshold. */
  minMomentum?: number;
  /** Only fire funding events when the extracted amount (USD) >= this. */
  minAmountUsd?: number;
  /** Only fire breakouts whose repo language is in this list (lowercased compare). */
  languages?: string[];
}

export interface WebhookTarget {
  /**
   * Stable identifier. Operator-chosen. Used as part of the delivery
   * dedup key — renaming an existing target would re-fire every past
   * event, so treat as immutable once deliveries have fired.
   */
  id: string;
  provider: WebhookProvider;
  /** Webhook URL — treat as a secret. Never log. */
  url: string;
  events: WebhookEvent[];
  filters?: WebhookFilters;
  enabled: boolean;
}

/**
 * Single enqueued delivery. One row per (event, id, target). The
 * `dedupKey` is content-addressed so re-enqueueing the same logical event
 * for the same target collapses to a single row at read time.
 */
export interface WebhookDelivery {
  /** Stable id — equal to `dedupKey` for new rows. */
  id: string;
  /** Stable dedup key: `${event}:${subjectId}:${targetId}`. */
  dedupKey: string;
  targetId: string;
  provider: WebhookProvider;
  event: WebhookEvent;
  /**
   * Serializable payload snapshot. Kept provider-agnostic — the drain
   * cron calls the provider formatter at delivery time so formatting
   * changes roll forward without re-enqueueing.
   */
  payload: unknown;
  createdAt: string;
  attempts: number;
  lastError?: string;
  deliveredAt?: string;
  /** Marker — only set when the row has been moved to dead-letter. */
  deadLetter?: boolean;
}

/** Minimal repo shape the breakout formatter needs. Keeps the import narrow. */
export interface WebhookBreakoutRepo {
  fullName: string;
  name?: string;
  owner?: string;
  description?: string;
  url?: string;
  language?: string | null;
  stars?: number;
  momentumScore?: number;
  movementStatus?: string;
  lastCommitAt?: string;
  starsDelta24h?: number;
  starsDelta7d?: number;
}

/** Minimal funding signal the funding formatter needs. */
export interface WebhookFundingEvent {
  id: string;
  headline: string;
  description?: string;
  sourceUrl: string;
  publishedAt: string;
  companyName?: string;
  amountDisplay?: string;
  amountUsd?: number | null;
  roundType?: string;
}

/** Revenue overlay payload (phase-2; formatter pending). */
export interface WebhookRevenueEvent {
  id: string;
  fullName: string;
  [key: string]: unknown;
}

/**
 * LIB-18: discriminated map from event name to its payload type.
 * The `WebhookDelivery.payload` field is `unknown` at the persistence
 * boundary (.data/webhook-queue.jsonl) — but callers that already
 * narrowed `delivery.event` should reach for `WebhookEventPayload[E]`
 * to type the payload without a hand-written cast.
 *
 * Adding a new event:
 *   1. Add the literal to WebhookEvent.
 *   2. Add the payload type to this map.
 *   3. Add a publish*() helper in src/lib/webhooks/publish.ts.
 *   4. Add a formatter branch in src/app/api/cron/webhooks/flush/route.ts
 *      formatPayload (TS will flag the missing case).
 */
export interface WebhookEventPayload {
  breakout: WebhookBreakoutRepo;
  funding: WebhookFundingEvent;
  revenue: WebhookRevenueEvent;
}

/** Convenience: the typed delivery shape for a known event. */
export type TypedWebhookDelivery<E extends WebhookEvent = WebhookEvent> =
  Omit<WebhookDelivery, "event" | "payload"> & {
    event: E;
    payload: WebhookEventPayload[E];
  };
