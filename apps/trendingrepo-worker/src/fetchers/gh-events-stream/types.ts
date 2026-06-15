// Types for the gh-events-stream fetcher.
//
// Closes the OSSInsight "10B+ GitHub events tracked since 2011" depth gap
// from the v3 deltas audit (impact 4.0). Unlike the per-repo github-events
// firehose (which keeps a rolling buffer of normalized events for the live
// activity wall), this fetcher computes a 7-day rolling aggregate per repo
// across PullRequest/Issues/Push/Release events, suitable as a new
// `ghEvents` component in engagement-composite scoring.
//
// Slug: `gh-events-stream`. Payload shape is intentionally small (one
// integer + 4-key byType map per repo) so the entire top-200 fits in <8KB
// uncompressed — well under the writeDataStore() gzip threshold (50KB).

/**
 * Event types this fetcher aggregates. Smaller than github-events'
 * RELEVANT_EVENT_TYPES on purpose: we score *substantive contributor*
 * activity, not passive Watch/Fork stars (which engagement-composite
 * already captures via the `ghStars` velocity component).
 */
export const STREAM_EVENT_TYPES = [
  'PullRequestEvent',
  'IssuesEvent',
  'PushEvent',
  'ReleaseEvent',
] as const;

export type StreamEventType = (typeof STREAM_EVENT_TYPES)[number];

export interface ByTypeCounts {
  pr: number;
  issues: number;
  push: number;
  release: number;
}

export interface RepoEventCounts {
  /** Total events of relevant types within the 7-day window. */
  events7d: number;
  /** Breakdown by event family. Sum equals events7d. */
  byType: ByTypeCounts;
}

export interface GhEventsStreamPayload {
  computedAt: string;
  /**
   * Cohort-wide staleness in seconds. Engagement-composite's read path
   * MUST drop the ghEvents component for any repo where the snapshot is
   * older than 90 minutes (the no-publicly-stale-batches rule). Recorded
   * at write time so consumers don't need to recompute against their own
   * clock skew.
   */
  staleness_seconds: number;
  /** Count of repos in the snapshot. */
  cohortSize: number;
  /** Window the byType counts apply to, in days. */
  windowDays: number;
  /** Keyed by `owner/name` (matches engagement-composite's fullName). */
  repos: Record<string, RepoEventCounts>;
  /** Diagnostic counter: how many repos hit a fetch error this tick. */
  errorCount: number;
}
