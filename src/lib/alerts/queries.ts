// Server-only reader for the /account Alert Inbox surface.
//
// Maps `alert_events` rows (delivery-engine ground truth) onto the shape
// AccountAlertInbox already renders:
//
//   { id, title, meta, time, kind, unread }
//
// Kind is derived from the joined `alert_rules.rule_type`. There is no
// read/unread column in v1 (the inbox is "everything fired") so we treat
// "fired in the last 24h and not skipped" as unread — the same heuristic
// the seeded sample data uses.

import "server-only";

import { and, desc, eq, gte } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  alertEvents,
  alertRules,
  type AlertRuleType,
} from "@/lib/db/schema/alerts";

// Mirrors the consumer's `AlertEvent` interface in
// src/components/account/AccountAlertInbox.tsx. Kept structurally identical
// so callers can pass our return value through unchanged.
export interface AccountAlertEvent {
  id: string;
  title: string;
  meta: string;
  time: string;
  kind: "release" | "breakout" | "mention" | "digest" | "threshold";
  unread: boolean;
}

const DEFAULT_LIMIT = 25;

function isDatabaseAvailable(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/**
 * List the alert events for a given profile, most recent first. Returns
 * an empty array when:
 *   - DATABASE_URL is unset
 *   - the DB throws
 *   - the user has no events yet (AccountAlertInbox falls back to its
 *     seeded SEEDED_EVENTS when our return value is empty)
 *
 * `since` is an optional lower bound (e.g. last 7 days). When omitted we
 * return the most recent DEFAULT_LIMIT events unbounded.
 */
export async function listAlertsForUser(
  profileId: string,
  since?: Date,
  limit: number = DEFAULT_LIMIT,
): Promise<AccountAlertEvent[]> {
  try {
    if (!isDatabaseAvailable()) return [];
    if (!profileId) return [];

    const whereClauses = [eq(alertEvents.profileId, profileId)];
    if (since) {
      whereClauses.push(gte(alertEvents.firedAt, since));
    }

    const rows = await db
      .select({
        id: alertEvents.id,
        firedAt: alertEvents.firedAt,
        entityId: alertEvents.entityId,
        payload: alertEvents.payload,
        deliveryStatus: alertEvents.deliveryStatus,
        ruleType: alertRules.ruleType,
        ruleName: alertRules.name,
      })
      .from(alertEvents)
      .leftJoin(alertRules, eq(alertEvents.ruleId, alertRules.id))
      .where(and(...whereClauses))
      .orderBy(desc(alertEvents.firedAt))
      .limit(limit);

    const now = Date.now();
    const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

    return rows.map((row) => {
      const payload = (row.payload ?? {}) as Record<string, unknown>;
      const title =
        typeof payload.title === "string" && payload.title.length > 0
          ? payload.title
          : (row.ruleName ?? "Alert fired");
      const body =
        typeof payload.body === "string" ? payload.body : row.entityId;
      const firedMs = row.firedAt instanceof Date ? row.firedAt.getTime() : now;
      const ageMs = Math.max(0, now - firedMs);
      const kind = mapRuleTypeToKind(row.ruleType);
      const meta = composeMeta(kind, body, payload);
      const unread =
        ageMs < TWENTY_FOUR_HOURS && row.deliveryStatus !== "skipped_dedup";

      return {
        id: row.id,
        title,
        meta,
        time: humanRelative(ageMs),
        kind,
        unread,
      };
    });
  } catch (err) {
    console.warn("[alerts/listAlertsForUser] degraded:", err);
    return [];
  }
}

function mapRuleTypeToKind(
  ruleType: AlertRuleType | string | null | undefined,
): AccountAlertEvent["kind"] {
  switch (ruleType) {
    case "release":
      return "release";
    case "breakout":
      return "breakout";
    case "rank_threshold":
      return "threshold";
    case "mention_spike":
      return "mention";
    default:
      return "mention";
  }
}

function composeMeta(
  kind: AccountAlertEvent["kind"],
  body: string,
  payload: Record<string, unknown>,
): string {
  const tag = kind.toUpperCase();
  const value = typeof payload.value === "number" ? payload.value : null;
  const threshold =
    typeof payload.threshold === "number" ? payload.threshold : null;
  const parts: string[] = [tag];
  if (body) parts.push(body);
  if (value !== null && threshold !== null) {
    parts.push(`${value} / ${threshold}`);
  } else if (threshold !== null) {
    parts.push(`threshold ${threshold}`);
  }
  return parts.join(" · ");
}

function humanRelative(ageMs: number): string {
  if (ageMs < 60_000) return "now";
  const minutes = Math.floor(ageMs / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  return `${weeks}w`;
}
