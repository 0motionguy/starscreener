// StarScreener — Alert delivery orchestrator (P0.1)
//
// Bridges alerts/engine.ts AlertEvent[] → Resend email send. Consumed
// by pipeline.ts after evaluateAllRules.
//
// Dedup: in-memory Map<key, timestamp> where key = (repoId, trigger).
// Prevents the same (repo, trigger) being emailed twice within
// DEDUP_WINDOW_MS (7 days). Restart wipes the map — acceptable for
// v1 since alert-rule cooldown in the engine is the primary dedup
// (dedup here is the safety net against rule-cooldown bugs).
//
// Future: persist dedup to .data/alert-delivery-log.jsonl so cross-
// restart dedup holds. Deferred until the per-user subscription surface
// lands (then the dedup key becomes (user, repo, trigger)).

import type { AlertEvent } from "../pipeline/types";
import type { Repo } from "../types";
import { sendEmail, isEmailConfigured } from "./resend-client";
import { renderBreakoutAlert } from "./templates/breakout-alert";

const DEDUP_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// In-memory dedup map. Key is `${repoId}::${trigger}`.
const recentDeliveries = new Map<string, number>();

function dedupKey(event: AlertEvent): string {
  return `${event.repoId}::${event.trigger}`;
}

function isDuplicateWithinWindow(event: AlertEvent, now: number): boolean {
  const key = dedupKey(event);
  const lastSentAt = recentDeliveries.get(key);
  if (lastSentAt === undefined) return false;
  return now - lastSentAt < DEDUP_WINDOW_MS;
}

/** Recipient list — single operator inbox for v1. */
function resolveRecipients(): string[] {
  const to = process.env.ALERT_EMAIL_TO;
  if (!to) return [];
  return to
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export interface DeliveryStats {
  eventsConsidered: number;
  sent: number;
  skippedDedup: number;
  skippedNoRecipients: number;
  skippedNoApiKey: number;
  failed: number;
}

/**
 * Deliver a batch of fired AlertEvents via email. Never throws —
 * structured stats returned for observability. No-op when neither
 * RESEND_API_KEY nor ALERT_EMAIL_TO is configured.
 */
export async function deliverAlertsViaEmail(
  events: AlertEvent[],
  repoLookup: Map<string, Repo>,
  now: number = Date.now(),
): Promise<DeliveryStats> {
  const stats: DeliveryStats = {
    eventsConsidered: events.length,
    sent: 0,
    skippedDedup: 0,
    skippedNoRecipients: 0,
    skippedNoApiKey: 0,
    failed: 0,
  };

  if (events.length === 0) return stats;

  const recipients = resolveRecipients();
  if (recipients.length === 0) {
    stats.skippedNoRecipients = events.length;
    return stats;
  }

  if (!isEmailConfigured()) {
    stats.skippedNoApiKey = events.length;
    return stats;
  }

  for (const event of events) {
    if (isDuplicateWithinWindow(event, now)) {
      stats.skippedDedup += 1;
      continue;
    }
    const repo = repoLookup.get(event.repoId);
    if (!repo) {
      // Repo disappeared between evaluate and deliver — skip silently.
      continue;
    }

    const rendered = renderBreakoutAlert(event, repo);
    const result = await sendEmail({
      to: recipients,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      referenceId: rendered.referenceId,
    });

    if (result.status === "sent") {
      recentDeliveries.set(dedupKey(event), now);
      stats.sent += 1;
    } else if (result.status === "error") {
      stats.failed += 1;
    }
  }

  return stats;
}

/** Test-only escape hatch to reset the dedup map between test cases. */
export function __resetDedupForTests(): void {
  recentDeliveries.clear();
}
