// Per-user alert event router.
//
// The pipeline at `src/lib/pipeline/pipeline.ts` already evaluates 8
// global trigger types synchronously per render and used to pass the
// fired events directly to `deliverAlertsViaEmail()` (operator-scope
// delivery). This module sits beside that path: for the same fired
// events, it ALSO fans out to per-user `alert_rules` rows and inserts
// `alert_events` queued for the dispatcher cron.
//
// Design notes:
//
//   - Runs inside `Promise.allSettled` next to the global path so
//     failures here can't break operator alerts.
//   - All gates (quiet-hours, freq cap, dedup) happen pre-insert so
//     the dispatcher sees only deliverable rows. The unique-on-
//     (rule_id, deduped_key) index is the idempotency primitive — if
//     a duplicate slips past the in-memory check, the DB drops it.
//   - Webhook-targeted rules emit a SECOND alert_event row with
//     `delivery_channel='webhook'` so the dispatcher can drain both
//     channels independently with their own retry semantics.
//   - Cadence affects ONLY which dispatcher cron picks the row up:
//     `cadence='realtime'` rows get delivered in the next 1-min tick;
//     `daily`/`weekly` rows wait for their digest cron to batch them.

import "server-only";

import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { alertRules, alertEvents } from "@/lib/db/schema/alerts";
import type { AlertRuleType } from "@/lib/db/schema/alerts";
import { profiles } from "@/lib/db/schema/profiles";
import { watchlistItems } from "@/lib/db/schema/watchlists";

import {
  applyEmailCap,
  computeDedupKey,
  countRuleFiresToday,
  countUserEmailsToday,
  PER_RULE_FIRES_PER_DAY_LIMIT,
} from "./freq-cap";
import { isWithinQuietHours, type QuietHoursWindow } from "./quiet-hours";

export interface FiredAlertEvent {
  /** v1 supports 'repo' only — extension point for /skills, /mcp, etc. */
  entityType: "repo";
  /** Repo fullName (e.g. "vercel/next.js"). */
  entityId: string;
  /** Maps to AlertRuleType — the kind of trigger the pipeline detected. */
  ruleType: AlertRuleType;
  /**
   * Renderable payload fields the dispatcher hands to email/webhook
   * templates. Should include enough context that re-deriving from
   * `entityId` isn't required at delivery time.
   */
  payload: {
    title: string;
    body?: string;
    url?: string;
    value?: number;
    threshold?: number;
    [key: string]: unknown;
  };
  /**
   * Optional cooldown override (seconds). Default 30 min. Use larger
   * values for slow-trigger types like `release` where the same release
   * shouldn't re-fire the next morning.
   */
  cooldownSeconds?: number;
  /** When the trigger fired — for backdating + per-tz batching. */
  firedAt?: Date;
}

export interface RouterMetrics {
  evaluated: number;
  matched: number;
  inserted: number;
  skippedQuiet: number;
  skippedFreqCap: number;
  skippedDedup: number;
  webhookEmitted: number;
  errors: number;
}

const ZERO_METRICS: RouterMetrics = {
  evaluated: 0,
  matched: 0,
  inserted: 0,
  skippedQuiet: 0,
  skippedFreqCap: 0,
  skippedDedup: 0,
  webhookEmitted: 0,
  errors: 0,
};

/**
 * Main entry — call from the pipeline post-evaluation hook.
 *
 * All errors are swallowed and reported via `metrics.errors`; never
 * throws so it can run inside `Promise.allSettled` without surfacing
 * to the operator alert path.
 */
export async function routeAlertEventsToUsers(
  fired: FiredAlertEvent[],
): Promise<RouterMetrics> {
  if (fired.length === 0) return { ...ZERO_METRICS };

  const metrics: RouterMetrics = { ...ZERO_METRICS };
  metrics.evaluated = fired.length;

  // Group fired events by rule type so we can issue one rules query per
  // type rather than per event.
  const byType = new Map<AlertRuleType, FiredAlertEvent[]>();
  for (const event of fired) {
    const list = byType.get(event.ruleType) ?? [];
    list.push(event);
    byType.set(event.ruleType, list);
  }

  for (const [ruleType, events] of byType) {
    try {
      await routeOneRuleType(ruleType, events, metrics);
    } catch (err) {
      metrics.errors += 1;
      console.error(
        "[alerts.event-router] failed routing rule type",
        ruleType,
        err,
      );
    }
  }

  return metrics;
}

async function routeOneRuleType(
  ruleType: AlertRuleType,
  events: FiredAlertEvent[],
  metrics: RouterMetrics,
): Promise<void> {
  // Look up active rules of this type joined with profile fallback
  // values for quiet_hours / timezone / email cadence.
  const rules = await db
    .select({
      ruleId: alertRules.id,
      profileId: alertRules.profileId,
      watchlistId: alertRules.watchlistId,
      cadence: alertRules.cadence,
      ruleQuietHours: alertRules.quietHours,
      webhookUrl: alertRules.webhookUrl,
      profileQuietHours: profiles.quietHours,
      profileTimezone: profiles.timezone,
      profileCadence: profiles.emailAlertsCadence,
    })
    .from(alertRules)
    .innerJoin(profiles, eq(alertRules.profileId, profiles.id))
    .where(and(eq(alertRules.ruleType, ruleType), eq(alertRules.active, true)));

  if (rules.length === 0) return;

  // Pre-filter: only rules whose watchlist contains the entity (or
  // is null = "all watched"). Build a set of (watchlistId, entityId)
  // memberships in one query so we don't N+1.
  const allEntityIds = Array.from(new Set(events.map((e) => e.entityId)));
  const watchlistIds = rules
    .map((r) => r.watchlistId)
    .filter((id): id is string => Boolean(id));
  const memberships = new Set<string>();
  if (watchlistIds.length > 0) {
    const items = await db
      .select({
        watchlistId: watchlistItems.watchlistId,
        repoFullName: watchlistItems.repoFullName,
      })
      .from(watchlistItems)
      .where(
        and(
          inArray(watchlistItems.watchlistId, watchlistIds),
          inArray(watchlistItems.repoFullName, allEntityIds),
        ),
      );
    for (const it of items) {
      memberships.add(`${it.watchlistId}::${it.repoFullName}`);
    }
  }

  for (const event of events) {
    for (const rule of rules) {
      // Watchlist scope: null watchlist = "all watched". Otherwise
      // require the entity to be in the watchlist.
      if (rule.watchlistId !== null) {
        const key = `${rule.watchlistId}::${event.entityId}`;
        if (!memberships.has(key)) continue;
      }
      metrics.matched += 1;
      await processOneRuleEvent(rule, event, metrics);
    }
  }
}

interface RuleRow {
  ruleId: string;
  profileId: string;
  watchlistId: string | null;
  cadence: string;
  ruleQuietHours: unknown;
  webhookUrl: string | null;
  profileQuietHours: unknown;
  profileTimezone: string;
  profileCadence: string;
}

async function processOneRuleEvent(
  rule: RuleRow,
  event: FiredAlertEvent,
  metrics: RouterMetrics,
): Promise<void> {
  const firedAt = event.firedAt ?? new Date();

  // Quiet hours: rule override wins, falls back to profile.
  const quietWindow =
    (rule.ruleQuietHours as QuietHoursWindow | null) ??
    (rule.profileQuietHours as QuietHoursWindow | null) ??
    null;
  const inQuiet = isWithinQuietHours(quietWindow, rule.profileTimezone, firedAt);

  // Per-rule frequency cap.
  const firesToday = await countRuleFiresToday(db, rule.ruleId, firedAt);
  if (firesToday >= PER_RULE_FIRES_PER_DAY_LIMIT) {
    metrics.skippedFreqCap += 1;
    await db
      .insert(alertEvents)
      .values({
        ruleId: rule.ruleId,
        profileId: rule.profileId,
        firedAt,
        entityType: event.entityType,
        entityId: event.entityId,
        payload: event.payload,
        deliveryChannel: "mcp_only",
        deliveryStatus: "skipped_freq_cap",
        dedupedKey: await computeDedupKey(
          rule.ruleId,
          event.entityId,
          event.cooldownSeconds,
          firedAt,
        ),
      })
      .onConflictDoNothing();
    return;
  }

  // Compute the dedup key once — same key feeds both insert + observation.
  const dedupedKey = await computeDedupKey(
    rule.ruleId,
    event.entityId,
    event.cooldownSeconds,
    firedAt,
  );

  // Email channel: gated by quiet hours + per-user daily email cap.
  const emailsToday = await countUserEmailsToday(db, rule.profileId, firedAt);
  let emailChannel = applyEmailCap("email", emailsToday);
  let emailStatus: "pending" | "skipped_quiet_hours" = "pending";
  if (inQuiet && emailChannel === "email") {
    emailStatus = "skipped_quiet_hours";
    emailChannel = "mcp_only"; // still visible in MCP feed
    metrics.skippedQuiet += 1;
  }

  const inserted = await db
    .insert(alertEvents)
    .values({
      ruleId: rule.ruleId,
      profileId: rule.profileId,
      firedAt,
      entityType: event.entityType,
      entityId: event.entityId,
      payload: { ...event.payload, ruleSnapshot: { cadence: rule.cadence } },
      deliveryChannel: emailChannel,
      deliveryStatus: emailStatus,
      dedupedKey,
    })
    .onConflictDoNothing()
    .returning({ id: alertEvents.id });

  if (inserted.length === 0) {
    metrics.skippedDedup += 1;
    return;
  }
  metrics.inserted += 1;

  // Bump rule counters. Best-effort — failure here doesn't roll back
  // the event row.
  try {
    await db
      .update(alertRules)
      .set({
        lastFiredAt: firedAt,
        fireCountToday: firesToday + 1,
      })
      .where(eq(alertRules.id, rule.ruleId));
  } catch (err) {
    console.warn("[alerts.event-router] rule counter update failed", err);
  }

  // Webhook channel: never blocked by quiet hours / email cap; only
  // skipped if the rule has no webhook URL.
  if (rule.webhookUrl) {
    await db
      .insert(alertEvents)
      .values({
        ruleId: rule.ruleId,
        profileId: rule.profileId,
        firedAt,
        entityType: event.entityType,
        entityId: event.entityId,
        payload: { ...event.payload, ruleSnapshot: { cadence: rule.cadence } },
        deliveryChannel: "webhook",
        deliveryStatus: "pending",
        // Dedup webhook channel separately so a single fired event
        // doesn't collide with itself across channels.
        dedupedKey: `${dedupedKey}:wh`,
      })
      .onConflictDoNothing();
    metrics.webhookEmitted += 1;
  }
}
