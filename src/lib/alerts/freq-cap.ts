// Frequency caps — gate alert events at insert time.
//
// Three layers:
//   1. Per-rule: max 5 fires per rule per 24h, with a 30-min cooldown
//      between identical (rule, entity) pairs (enforced via the
//      `(rule_id, deduped_key)` unique index).
//   2. Per-user email: max 50 emails per user per day. When at limit,
//      we still INSERT the alert_event row but flip
//      `delivery_channel = 'mcp_only'` so the user's MCP feed shows it
//      while the inbox stays sane.
//   3. Cooldown bucket: `deduped_key = sha256(rule_id ':' entity_id ':'
//      floor(now/cooldown))` — atomic dedup via Postgres unique index.
//
// All functions are pure or take a Drizzle handle as a parameter so they
// can be unit-tested without a live DB.

import { and, count, eq, gte, sql } from "drizzle-orm";

import {
  alertEvents,
  type AlertDeliveryChannel,
} from "@/lib/db/schema/alerts";

const HOUR_MS = 60 * 60 * 1000;

export const PER_RULE_FIRES_PER_DAY_LIMIT = 5;
export const PER_USER_EMAILS_PER_DAY_LIMIT = 50;
export const COOLDOWN_MIN_SECONDS = 30 * 60; // 30 minutes

interface DbHandle {
  select: (typeof import("@/lib/db/client").db)["select"];
}

/**
 * Compute the dedup key for a (rule, entity, time) triplet. Same key =
 * same dedup window = `ON CONFLICT DO NOTHING` on the unique index
 * silently drops the duplicate.
 *
 * Cooldown defaults to 30 minutes; callers pass higher values for slow
 * trigger types where 30-min repeats are too aggressive.
 */
export async function computeDedupKey(
  ruleId: string,
  entityId: string,
  cooldownSeconds: number = COOLDOWN_MIN_SECONDS,
  now: Date = new Date(),
): Promise<string> {
  const seconds = Math.max(60, cooldownSeconds);
  const bucket = Math.floor(now.getTime() / 1000 / seconds);
  const input = `${ruleId}:${entityId}:${bucket}`;
  const enc = new TextEncoder().encode(input);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", enc);
  // Hex-encode first 16 bytes — short enough for the index, long
  // enough for collision resistance at our volumes (32 hex chars).
  const bytes = new Uint8Array(digest, 0, 16);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

/**
 * Count how many alert_events rows have fired for this rule today
 * (excluding skipped_* statuses since those didn't actually deliver).
 * Used to enforce the per-rule 5/day cap.
 */
export async function countRuleFiresToday(
  db: DbHandle,
  ruleId: string,
  now: Date = new Date(),
): Promise<number> {
  const dayAgo = new Date(now.getTime() - 24 * HOUR_MS);
  const rows = await db
    .select({ n: count() })
    .from(alertEvents)
    .where(
      and(
        eq(alertEvents.ruleId, ruleId),
        gte(alertEvents.firedAt, dayAgo),
        sql`${alertEvents.deliveryStatus} NOT LIKE 'skipped_%'`,
      ),
    );
  return Number(rows[0]?.n ?? 0);
}

/**
 * Count how many emails the user received today. Counts only rows where
 * `delivery_channel = 'email'` AND status indicates the user actually
 * received it (sent / sending).
 */
export async function countUserEmailsToday(
  db: DbHandle,
  profileId: string,
  now: Date = new Date(),
): Promise<number> {
  const dayAgo = new Date(now.getTime() - 24 * HOUR_MS);
  const rows = await db
    .select({ n: count() })
    .from(alertEvents)
    .where(
      and(
        eq(alertEvents.profileId, profileId),
        eq(alertEvents.deliveryChannel, "email"),
        gte(alertEvents.firedAt, dayAgo),
        sql`${alertEvents.deliveryStatus} IN ('pending','sending','sent')`,
      ),
    );
  return Number(rows[0]?.n ?? 0);
}

/**
 * Decide the delivery channel for a fresh alert event, given the user's
 * daily email cap state. Returns the requested channel unless the user
 * has hit the email limit, in which case email events get demoted to
 * `mcp_only` (still visible in the MCP feed + the /you/alerts UI).
 */
export function applyEmailCap(
  requested: AlertDeliveryChannel,
  emailsToday: number,
): AlertDeliveryChannel {
  if (requested !== "email") return requested;
  if (emailsToday >= PER_USER_EMAILS_PER_DAY_LIMIT) return "mcp_only";
  return "email";
}
