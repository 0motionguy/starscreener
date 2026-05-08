// Drizzle schema — `alert_rules` + `alert_events` + `alert_delivery_log`.
//
// Per-user alert rules sit on top of the existing pipeline trigger engine
// (src/lib/pipeline/alerts/triggers.ts). Pipeline still emits global
// trigger evaluations synchronously per render; the new event router
// fans those out to matching `alert_rules` rows and inserts pending
// `alert_events`, which the dispatcher cron drains into email/webhook
// deliveries.
//
// Rule types in v1 (keep small — ship 4, learn, expand later):
//   breakout         — repo hits ≥2 cross-source channels in 24h
//   rank_threshold   — repo crosses into/out of a top-N category
//   release          — new GitHub release / npm version
//   mention_spike    — mention count exceeds Z-score threshold
//
// Idempotency primitive: `unique(rule_id, deduped_key)`. The router
// computes `deduped_key = sha256(rule_id + entity_id + bucket)` where
// `bucket = floor(now / cooldown_seconds)`. ON CONFLICT DO NOTHING is
// the dedup mechanism — we never query "did this fire?" before insert.

import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { tr } from "./_schema";
import { profiles } from "./profiles";
import { watchlists } from "./watchlists";

// ---------------------------------------------------------------------------
// alert_rules — user-defined rules. Capped at 25 per user (enforced at
// insert time; the limit is a sanity ceiling, not a paywall).
// ---------------------------------------------------------------------------

export const alertRules = tr.table(
  "alert_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    // Null = "all watched items". Set = scope to one specific watchlist.
    watchlistId: uuid("watchlist_id").references(() => watchlists.id, {
      onDelete: "cascade",
    }),
    name: text("name").notNull(),
    ruleType: text("rule_type").notNull(), // 'breakout'|'rank_threshold'|'release'|'mention_spike'
    ruleConfig: jsonb("rule_config").notNull(),
    cadence: text("cadence").notNull().default("realtime"), // 'realtime'|'daily'|'weekly'
    // Optional webhook delivery target. https-only (validated at insert).
    webhookUrl: text("webhook_url"),
    // bcrypt-hashed plaintext secret. Plaintext is shown ONCE on create
    // and never persisted — caller copies it for HMAC signing on receive.
    webhookSecretHash: text("webhook_secret_hash"),
    // Per-rule override of profiles.quiet_hours. Null falls back to profile.
    quietHours: jsonb("quiet_hours"),
    active: boolean("active").notNull().default(true),
    lastFiredAt: timestamp("last_fired_at", { withTimezone: true }),
    fireCountToday: integer("fire_count_today").notNull().default(0),
    fireCountTotal: integer("fire_count_total").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("alert_rules_profile_active_idx").on(t.profileId, t.active),
    index("alert_rules_type_active_idx").on(t.ruleType, t.active),
    index("alert_rules_watchlist_idx").on(t.watchlistId),
  ],
);

export const ALERT_RULE_TYPES = [
  "breakout",
  "rank_threshold",
  "release",
  "mention_spike",
] as const;
export type AlertRuleType = (typeof ALERT_RULE_TYPES)[number];

export const ALERT_CADENCES = ["realtime", "daily", "weekly"] as const;
export type AlertCadence = (typeof ALERT_CADENCES)[number];

export type AlertRule = typeof alertRules.$inferSelect;
export type NewAlertRule = typeof alertRules.$inferInsert;

// ---------------------------------------------------------------------------
// alert_events — one row per fired alert. Cron dispatcher drains pending
// rows, sends, and updates delivery_status. mcp_only rows are never sent
// (just queryable via the MCP `list_my_alerts` tool).
// ---------------------------------------------------------------------------

export const alertEvents = tr.table(
  "alert_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ruleId: uuid("rule_id")
      .notNull()
      .references(() => alertRules.id, { onDelete: "cascade" }),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    firedAt: timestamp("fired_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    entityType: text("entity_type").notNull(), // 'repo' (only kind in v1)
    entityId: text("entity_id").notNull(), // repo fullName, e.g. 'vercel/next.js'
    payload: jsonb("payload").notNull(), // { title, body, url, value, threshold, ruleSnapshot }
    deliveryChannel: text("delivery_channel").notNull(), // 'email'|'webhook'|'mcp_only'
    deliveryStatus: text("delivery_status").notNull().default("pending"),
    // 'pending'|'sending'|'sent'|'failed'|'bounced'|'skipped_quiet_hours'|'skipped_freq_cap'|'skipped_dedup'
    dedupedKey: text("deduped_key").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    attempts: integer("attempts").notNull().default(0),
    error: text("error"),
  },
  (t) => [
    // Idempotency: the (rule_id, deduped_key) unique index makes
    // ON CONFLICT DO NOTHING the dedup primitive.
    uniqueIndex("alert_events_rule_dedup_uniq").on(t.ruleId, t.dedupedKey),
    index("alert_events_rule_fired_idx").on(t.ruleId, t.firedAt),
    index("alert_events_profile_fired_idx").on(t.profileId, t.firedAt),
    index("alert_events_pending_idx")
      .on(t.deliveryStatus, t.firedAt)
      .where(sql`delivery_status = 'pending'`),
  ],
);

export const ALERT_DELIVERY_CHANNELS = ["email", "webhook", "mcp_only"] as const;
export type AlertDeliveryChannel = (typeof ALERT_DELIVERY_CHANNELS)[number];

export const ALERT_DELIVERY_STATUSES = [
  "pending",
  "sending",
  "sent",
  "failed",
  "bounced",
  "skipped_quiet_hours",
  "skipped_freq_cap",
  "skipped_dedup",
] as const;
export type AlertDeliveryStatus = (typeof ALERT_DELIVERY_STATUSES)[number];

export type AlertEvent = typeof alertEvents.$inferSelect;
export type NewAlertEvent = typeof alertEvents.$inferInsert;

// ---------------------------------------------------------------------------
// alert_delivery_log — cross-rule TTL dedup. Used when an event fires
// repeatedly within the cooldown window; the daily cleanup cron drops
// expired rows so the table doesn't grow unbounded.
// ---------------------------------------------------------------------------

export const alertDeliveryLog = tr.table(
  "alert_delivery_log",
  {
    ruleId: uuid("rule_id")
      .notNull()
      .references(() => alertRules.id, { onDelete: "cascade" }),
    dedupedKey: text("deduped_key").notNull(),
    firedAt: timestamp("fired_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    // Use a simple counter for "how many fires in this window were
    // suppressed" — informational, useful for debugging frequency caps.
    suppressedCount: integer("suppressed_count").notNull().default(0),
  },
  (t) => [
    // Composite primary key.
    uniqueIndex("alert_delivery_log_pk").on(t.ruleId, t.dedupedKey),
    index("alert_delivery_log_expires_idx").on(t.expiresAt),
  ],
);

export type AlertDeliveryLogRow = typeof alertDeliveryLog.$inferSelect;
export type NewAlertDeliveryLogRow = typeof alertDeliveryLog.$inferInsert;
