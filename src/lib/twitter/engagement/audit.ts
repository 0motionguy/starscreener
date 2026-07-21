// X engagement — durable audit trail.
//
// Every drafted / posted / notable-skip attempt appends one EngagementRecord
// to a capped list under the data-store slug `x-engagement-log` (Redis-first,
// so it survives the ephemeral container filesystem — unlike the JSONL used by
// the broadcast audit). The admin review surface (/api/admin/x-engagement)
// reads this back newest-first.

import "server-only";

import { getDataStore } from "@/lib/data-store";
import type { EngagementRecord } from "./types";

export const ENGAGEMENT_LOG_SLUG = "x-engagement-log";
const LOG_MAX = 300;

interface EngagementLog {
  records: EngagementRecord[];
}

/**
 * Append one audit row. Best-effort + append-capped (keep last LOG_MAX). Never
 * throws — auditing must not block or fail a run.
 */
export async function recordEngagementAttempt(record: EngagementRecord): Promise<void> {
  try {
    const store = getDataStore();
    const current = await store.read<EngagementLog>(ENGAGEMENT_LOG_SLUG);
    const existing = Array.isArray(current.data?.records) ? current.data.records : [];
    const records = [...existing, record].slice(-LOG_MAX);
    await store.write(ENGAGEMENT_LOG_SLUG, { records });
  } catch {
    // Advisory log — a write failure never affects the engagement run.
  }
}

/** Read the audit trail newest-first (for the admin review surface). */
export async function listEngagementRuns(limit = 50): Promise<EngagementRecord[]> {
  try {
    const store = getDataStore();
    const current = await store.read<EngagementLog>(ENGAGEMENT_LOG_SLUG);
    const records = Array.isArray(current.data?.records) ? current.data.records : [];
    return records
      .slice()
      .sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts))
      .slice(0, Math.max(0, limit));
  } catch {
    return [];
  }
}
