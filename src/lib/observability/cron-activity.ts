// StarScreener — bounded in-memory ring buffer for cron activity.
//
// Phase 2 P-119 (F-OBSV-001). The team previously discovered the ~0% cron
// fire rate by manually inspecting Vercel logs. Without a counter there
// was no way to build an uptime alert on "cron hasn't fired in 1h".
//
// This module is a simple in-memory ring buffer. Every cron handler pushes
// one entry on exit (ok or error); /api/health/cron-activity returns the
// buffer so an external uptime monitor can pattern-match.
//
// Caveats:
//   - Single-process: buffer resets on boot / redeploy. A redeploy during
//     a cadence gap will look like "cron hasn't fired" until the next
//     scheduled fire lands.
//   - Not a substitute for real metrics (Sentry/Datadog/Grafana). Those
//     land in H3-3. This is the H1 bridge: zero-dep visibility today.

const DEFAULT_CAPACITY = 200;

export type CronActivityStatus =
  | "ok"
  | "rate_limited"
  | "error"
  | "unauthorized"
  | "not_configured";

export interface CronActivityEntry {
  at: string; // ISO timestamp
  scope: string; // "cron:ingest", "cron:seed", "cron:backfill-top", …
  tier?: string; // "hot" | "warm" | "cold" | "backfill" | etc.
  status: CronActivityStatus;
  durationMs: number;
  count?: number;
  ok?: number;
  failed?: number;
  rateLimitRemaining?: number | null;
  error?: string;
}

let buffer: CronActivityEntry[] = [];
let capacity = DEFAULT_CAPACITY;

export function recordCronActivity(entry: CronActivityEntry): void {
  buffer.push(entry);
  if (buffer.length > capacity) {
    // Drop oldest. Using slice (not shift in a loop) so one big burst
    // doesn't churn the array repeatedly.
    buffer = buffer.slice(buffer.length - capacity);
  }
}

export interface CronActivityQuery {
  /** Max entries to return, newest-first. Default: full buffer. */
  limit?: number;
  /** Filter by scope (exact match). */
  scope?: string;
  /** Entries at-or-newer than this ISO timestamp. */
  since?: string;
}

export function getCronActivity(
  query: CronActivityQuery = {},
): CronActivityEntry[] {
  let out: CronActivityEntry[] = buffer.slice().reverse();
  if (query.scope) out = out.filter((e) => e.scope === query.scope);
  if (query.since) out = out.filter((e) => e.at >= query.since!);
  if (query.limit !== undefined) out = out.slice(0, Math.max(0, query.limit));
  return out;
}

/** Summary counts over the last N milliseconds. */
export interface CronActivitySummary {
  windowMs: number;
  total: number;
  ok: number;
  failed: number;
  lastAt: string | null;
  ageMs: number | null;
}

export function summarizeCronActivity(
  windowMs: number,
  scope?: string,
): CronActivitySummary {
  const now = Date.now();
  const cutoff = now - windowMs;
  const relevant = buffer.filter((e) => {
    if (scope && e.scope !== scope) return false;
    return new Date(e.at).getTime() >= cutoff;
  });
  const ok = relevant.filter((e) => e.status === "ok").length;
  const failed = relevant.length - ok;
  const last = buffer.length > 0 ? buffer[buffer.length - 1] : null;
  const lastAt = last?.at ?? null;
  const ageMs = lastAt ? now - new Date(lastAt).getTime() : null;
  return {
    windowMs,
    total: relevant.length,
    ok,
    failed,
    lastAt,
    ageMs,
  };
}

/** Test-only: reset the buffer. */
export function __resetCronActivityForTests(nextCapacity?: number): void {
  buffer = [];
  capacity = nextCapacity ?? DEFAULT_CAPACITY;
}
