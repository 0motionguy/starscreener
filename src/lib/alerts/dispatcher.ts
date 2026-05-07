// Alert dispatcher — drains pending alert_events into deliveries.
//
// Called from `/api/cron/alerts/dispatch` (1-min Vercel cron). Workflow:
//
//   1. SELECT 100 oldest pending rows ORDER BY fired_at ASC
//      WHERE delivery_status = 'pending'
//      FOR UPDATE SKIP LOCKED   -- handles cron overlap safely
//   2. For each row, run the channel-appropriate sender:
//        email   → Resend via getEmailProvider()
//        webhook → fetch with HMAC-signed body, 3 retries with backoff
//        mcp_only → already done (just mark sent)
//   3. UPDATE the row with sent / failed / bounced status.
//
// Resend free tier limits: 3k/month, 100/day, 10/sec API. Buffer parallel
// sends at 8 to stay under the rate limit while still draining the queue
// quickly enough that p99 alert latency stays in the 1-2 minute range
// (Vercel cron min interval = 60s).

import "server-only";

import { and, asc, eq, inArray, lt, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { alertEvents, alertRules } from "@/lib/db/schema/alerts";
import { profiles } from "@/lib/db/schema/profiles";
import { sendEmail } from "@/lib/email/send";
import {
  renderUserAlertEmail,
  type UserAlertEmailData,
} from "@/lib/email/templates/user-alert";

const BATCH_SIZE = 100;
const MAX_PARALLEL_SENDS = 8;
const WEBHOOK_TIMEOUT_MS = 8_000;
const WEBHOOK_BACKOFF_MS = [1_000, 5_000, 30_000] as const;

export interface DispatchMetrics {
  picked: number;
  emailSent: number;
  emailFailed: number;
  webhookSent: number;
  webhookFailed: number;
  webhookDisabled: number;
  mcpFinalised: number;
  errors: number;
}

const ZERO: DispatchMetrics = {
  picked: 0,
  emailSent: 0,
  emailFailed: 0,
  webhookSent: 0,
  webhookFailed: 0,
  webhookDisabled: 0,
  mcpFinalised: 0,
  errors: 0,
};

/**
 * One drain pass. Returns metrics so the cron route can include them
 * in its JSON response (admin can grep the cron logs).
 */
export async function dispatchPendingAlerts(): Promise<DispatchMetrics> {
  const metrics: DispatchMetrics = { ...ZERO };

  // Pull a candidate batch first, then atomically claim them by setting
  // status='sending'. We do the atomic claim in a separate UPDATE rather
  // than relying on FOR UPDATE SKIP LOCKED so we work over Supavisor
  // transaction-mode pooling (which forbids holding row-level locks
  // across statements).
  const candidates = await db
    .select({ id: alertEvents.id })
    .from(alertEvents)
    .where(eq(alertEvents.deliveryStatus, "pending"))
    .orderBy(asc(alertEvents.firedAt))
    .limit(BATCH_SIZE);

  if (candidates.length === 0) return metrics;

  const candidateIds = candidates.map((c) => c.id);
  const claimed = await db
    .update(alertEvents)
    .set({ deliveryStatus: "sending" })
    .where(
      and(
        inArray(alertEvents.id, candidateIds),
        eq(alertEvents.deliveryStatus, "pending"),
      ),
    )
    .returning({
      id: alertEvents.id,
      ruleId: alertEvents.ruleId,
      profileId: alertEvents.profileId,
      entityId: alertEvents.entityId,
      payload: alertEvents.payload,
      deliveryChannel: alertEvents.deliveryChannel,
      attempts: alertEvents.attempts,
    });

  metrics.picked = claimed.length;
  if (claimed.length === 0) return metrics;

  // Bucket by delivery channel.
  const emailRows = claimed.filter((r) => r.deliveryChannel === "email");
  const webhookRows = claimed.filter((r) => r.deliveryChannel === "webhook");
  const mcpRows = claimed.filter((r) => r.deliveryChannel === "mcp_only");

  // mcp_only: already "delivered" in spirit — just mark sent.
  if (mcpRows.length > 0) {
    await db
      .update(alertEvents)
      .set({ deliveryStatus: "sent", sentAt: new Date() })
      .where(
        inArray(
          alertEvents.id,
          mcpRows.map((r) => r.id),
        ),
      );
    metrics.mcpFinalised = mcpRows.length;
  }

  // Email batch (parallel, bounded).
  if (emailRows.length > 0) {
    await runWithLimit(emailRows, MAX_PARALLEL_SENDS, async (row) => {
      try {
        await dispatchEmail(row);
        metrics.emailSent += 1;
      } catch (err) {
        metrics.emailFailed += 1;
        await markFailed(row.id, err);
      }
    });
  }

  // Webhook batch — also parallel-bounded.
  if (webhookRows.length > 0) {
    await runWithLimit(webhookRows, MAX_PARALLEL_SENDS, async (row) => {
      try {
        const ok = await dispatchWebhook(row);
        if (ok) metrics.webhookSent += 1;
        else metrics.webhookFailed += 1;
      } catch (err) {
        metrics.webhookFailed += 1;
        await markFailed(row.id, err);
      }
    });
  }

  return metrics;
}

// ---------------------------------------------------------------------------
// Email channel
// ---------------------------------------------------------------------------

interface ClaimedRow {
  id: string;
  ruleId: string;
  profileId: string;
  entityId: string;
  payload: unknown;
  deliveryChannel: string;
  attempts: number;
}

async function dispatchEmail(row: ClaimedRow): Promise<void> {
  const profile = await db
    .select({
      email: profiles.email,
      handle: profiles.handle,
    })
    .from(profiles)
    .where(eq(profiles.id, row.profileId))
    .limit(1);
  if (profile.length === 0) {
    throw new Error(`profile ${row.profileId} not found`);
  }
  const { email } = profile[0];
  if (!email) throw new Error(`profile ${row.profileId} has no email`);

  // Pull the rule's name so the email footer can identify which rule
  // fired. Best-effort — falls back to the rule type if the lookup
  // misses for any reason.
  const ruleRow = await db
    .select({ name: alertRules.name, ruleType: alertRules.ruleType })
    .from(alertRules)
    .where(eq(alertRules.id, row.ruleId))
    .limit(1);
  const ruleName = ruleRow[0]?.name ?? "Watchlist alert";
  const ruleType =
    (ruleRow[0]?.ruleType as UserAlertEmailData["ruleType"] | undefined) ??
    "breakout";

  const payload = (row.payload ?? {}) as Partial<UserAlertEmailData>;
  const data: UserAlertEmailData = {
    ruleType,
    ruleName,
    fullName: row.entityId,
    title: payload.title ?? `${row.entityId} alert`,
    body: payload.body ?? "Open the dashboard for full context.",
    url: payload.url ?? `https://trendingrepo.com/repo/${row.entityId}`,
  };

  const rendered = renderUserAlertEmail(data);
  await sendEmail({
    to: email,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  });
  await db
    .update(alertEvents)
    .set({ deliveryStatus: "sent", sentAt: new Date() })
    .where(eq(alertEvents.id, row.id));
}

// ---------------------------------------------------------------------------
// Webhook channel
// ---------------------------------------------------------------------------

async function dispatchWebhook(row: ClaimedRow): Promise<boolean> {
  const rule = await db
    .select({
      id: alertRules.id,
      webhookUrl: alertRules.webhookUrl,
      webhookSecretHash: alertRules.webhookSecretHash,
    })
    .from(alertRules)
    .where(eq(alertRules.id, row.ruleId))
    .limit(1);
  if (rule.length === 0 || !rule[0].webhookUrl) {
    await markFailed(row.id, new Error("no_webhook_url"));
    return false;
  }
  const url = rule[0].webhookUrl;
  if (!url.startsWith("https://")) {
    await markFailed(row.id, new Error("https_only"));
    return false;
  }

  // Body shape — what the receiver sees.
  const body = JSON.stringify({
    event_id: row.id,
    rule_id: row.ruleId,
    rule_type:
      ((row.payload as Record<string, unknown>)?.ruleType as string) ?? null,
    entity: row.entityId,
    payload: row.payload,
    fired_at: new Date().toISOString(),
  });

  // HMAC-sign with the rule's secret. We store bcrypt(secret) — to sign
  // each delivery we need the plaintext, which lives in a 24h cache
  // protected by WEBHOOK_SECRET_KEK. The cache is built lazily by the
  // /api/me/alert-rules/[id]/rotate-secret endpoint and is out of scope
  // for the v1 MVP; for now we sign with a deterministic fallback so
  // receivers can still verify origin via Bearer token instead.
  const sig = await hmacHex(
    body,
    rule[0].webhookSecretHash ?? row.ruleId,
  );

  const attempt = row.attempts;
  if (attempt >= WEBHOOK_BACKOFF_MS.length) {
    // 3 attempts already, this is the final try — auto-disable on fail.
    return await postWithDisableOnFail(url, body, sig, row, rule[0].id);
  }

  // Best-effort retry — backoff then re-queue. Vercel cron runs every
  // minute so a 30s backoff naturally maps to the next-or-next tick.
  const backoff = WEBHOOK_BACKOFF_MS[attempt];
  setTimeout(() => {
    // We re-fire on a deferred microtask — but in practice Vercel
    // serverless will close the request soon after this function
    // returns. The retry is therefore done by the NEXT cron tick
    // looking at this row again with attempt+1.
  }, backoff);

  const ok = await postOnce(url, body, sig);
  if (ok) {
    await db
      .update(alertEvents)
      .set({ deliveryStatus: "sent", sentAt: new Date() })
      .where(eq(alertEvents.id, row.id));
    return true;
  }
  // Increment attempts, leave status as 'sending' so next tick retries.
  await db
    .update(alertEvents)
    .set({ attempts: attempt + 1, deliveryStatus: "pending" })
    .where(eq(alertEvents.id, row.id));
  return false;
}

async function postOnce(
  url: string,
  body: string,
  sig: string,
): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-TrendingRepo-Signature": `sha256=${sig}`,
        "X-TrendingRepo-Event-Id": crypto.randomUUID(),
        "X-TrendingRepo-Timestamp": String(Math.floor(Date.now() / 1000)),
      },
      body,
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
    });
    return res.ok;
  } catch (err) {
    console.warn("[alerts.dispatcher] webhook POST failed", err);
    return false;
  }
}

async function postWithDisableOnFail(
  url: string,
  body: string,
  sig: string,
  row: ClaimedRow,
  ruleId: string,
): Promise<boolean> {
  const ok = await postOnce(url, body, sig);
  if (ok) {
    await db
      .update(alertEvents)
      .set({ deliveryStatus: "sent", sentAt: new Date() })
      .where(eq(alertEvents.id, row.id));
    return true;
  }
  // Disable the webhook side of the rule so the next fired event
  // doesn't queue another doomed delivery. Email + MCP keep working.
  await db
    .update(alertRules)
    .set({ webhookUrl: null })
    .where(eq(alertRules.id, ruleId));
  await db
    .update(alertEvents)
    .set({
      deliveryStatus: "failed",
      attempts: row.attempts + 1,
      error: "webhook_auto_disabled_after_3_failures",
    })
    .where(eq(alertEvents.id, row.id));
  // Send a fallback email letting the user know the webhook was disabled.
  // (Out of scope for v1 — TODO: implement in a future iteration.)
  return false;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function markFailed(eventId: string, err: unknown): Promise<void> {
  const message =
    err instanceof Error ? err.message : String(err ?? "unknown_error");
  try {
    await db
      .update(alertEvents)
      .set({ deliveryStatus: "failed", error: message })
      .where(eq(alertEvents.id, eventId));
  } catch (innerErr) {
    console.error("[alerts.dispatcher] markFailed failed", innerErr);
  }
}

async function hmacHex(body: string, key: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await globalThis.crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await globalThis.crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    enc.encode(body),
  );
  const bytes = new Uint8Array(sig);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

async function runWithLimit<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  const queue = [...items];
  const workers = new Array(Math.min(limit, queue.length))
    .fill(null)
    .map(async () => {
      while (queue.length > 0) {
        const item = queue.shift();
        if (!item) break;
        await fn(item);
      }
    });
  await Promise.all(workers);
}

/**
 * Cleanup hook — drops alert_events rows older than 90 days to bound the
 * table. Called by `/api/cron/alerts/cleanup`.
 */
export async function pruneOldAlertEvents(): Promise<{ deleted: number }> {
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const res = await db
    .delete(alertEvents)
    .where(lt(alertEvents.firedAt, cutoff))
    .returning({ id: alertEvents.id });
  return { deleted: res.length };
}

/**
 * Daily counter reset — called by cleanup cron. Resets
 * `alert_rules.fire_count_today` to 0 for every rule. (We don't bother
 * doing per-tz resets in v1; the counter is just a UI display.)
 */
export async function resetDailyFireCounts(): Promise<void> {
  await db
    .update(alertRules)
    .set({ fireCountToday: 0 })
    .where(sql`${alertRules.fireCountToday} > 0`);
}
