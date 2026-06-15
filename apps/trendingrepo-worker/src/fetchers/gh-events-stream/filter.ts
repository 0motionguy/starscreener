// Pure event filtering + aggregation for gh-events-stream.
//
// Side-effect free so unit tests can exercise the windowing + byType
// breakdown without touching Redis / HTTP / env. Mirrors the same split
// github-events uses (parser.ts vs index.ts).

import {
  STREAM_EVENT_TYPES,
  type ByTypeCounts,
  type RepoEventCounts,
  type StreamEventType,
} from './types.js';

const STREAM_TYPE_SET: ReadonlySet<string> = new Set(STREAM_EVENT_TYPES);

/** Default window for the rolling aggregate. v3 deltas spec target. */
export const WINDOW_DAYS = 7;
const WINDOW_MS = WINDOW_DAYS * 24 * 60 * 60 * 1000;

interface RawEvent {
  type?: unknown;
  created_at?: unknown;
}

function eventTimestamp(raw: unknown): number | null {
  if (!raw || typeof raw !== 'object') return null;
  const e = raw as RawEvent;
  if (typeof e.created_at !== 'string') return null;
  const ts = Date.parse(e.created_at);
  return Number.isFinite(ts) ? ts : null;
}

function eventTypeOf(raw: unknown): StreamEventType | null {
  if (!raw || typeof raw !== 'object') return null;
  const e = raw as RawEvent;
  if (typeof e.type !== 'string') return null;
  return STREAM_TYPE_SET.has(e.type) ? (e.type as StreamEventType) : null;
}

/**
 * Per-event predicate: keep only the 4 substantive contributor event types
 * AND only those within the rolling window. Both predicates are needed —
 * GH's per-repo /events endpoint returns up to 90 days of history so the
 * window filter is the actual aggregation gate, not the API.
 */
export function isWithinWindow(
  raw: unknown,
  nowMs: number,
  windowMs: number = WINDOW_MS,
): boolean {
  const ts = eventTimestamp(raw);
  if (ts === null) return false;
  // Strictly older than (now - window) → drop. Equal timestamps are kept
  // (deterministic boundary).
  return nowMs - ts <= windowMs;
}

/**
 * Aggregate a raw GH events array into RepoEventCounts. Events outside
 * the 7d window or not in STREAM_EVENT_TYPES are dropped; everything else
 * is binned by event family into the byType map.
 *
 * `nowMs` is injected (not Date.now()) so tests can pin time. Production
 * callers pass Date.now() once per tick so all repos share the same window.
 */
export function aggregateEvents(
  rawEvents: unknown,
  nowMs: number,
  windowMs: number = WINDOW_MS,
): RepoEventCounts {
  const byType: ByTypeCounts = { pr: 0, issues: 0, push: 0, release: 0 };
  if (!Array.isArray(rawEvents)) {
    return { events7d: 0, byType };
  }
  let total = 0;
  for (const raw of rawEvents) {
    if (!isWithinWindow(raw, nowMs, windowMs)) continue;
    const type = eventTypeOf(raw);
    if (type === null) continue;
    total += 1;
    switch (type) {
      case 'PullRequestEvent':
        byType.pr += 1;
        break;
      case 'IssuesEvent':
        byType.issues += 1;
        break;
      case 'PushEvent':
        byType.push += 1;
        break;
      case 'ReleaseEvent':
        byType.release += 1;
        break;
    }
  }
  return { events7d: total, byType };
}
