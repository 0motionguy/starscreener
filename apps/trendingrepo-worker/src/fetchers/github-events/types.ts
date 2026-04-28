// Shared types for the github-events fetcher + downstream readers.
//
// Keep these in lockstep with the per-repo + index payload contracts in
// parser.ts, watchlist.ts, and the app-side reader at src/lib/github-events.ts.
// `repoId` is always the GitHub numeric database ID — the same value the
// repo-metadata fetcher returns as `githubId`. Using the numeric ID (not
// owner/name) means the colon-typed slug `github-events:<repoId>` stays
// stable across owner renames.

/**
 * Event types the firehose surfaces. The GH Events API emits ~25 distinct
 * types; everything not in this allow-list is dropped at parse time so
 * downstream consumers don't have to filter again. Order is illustrative
 * only — payloads are sorted by `createdAt` (newest first).
 */
export const RELEVANT_EVENT_TYPES = [
  'WatchEvent',
  'ForkEvent',
  'IssuesEvent',
  'PullRequestEvent',
  'PushEvent',
  'ReleaseEvent',
] as const;

export type RelevantEventType = (typeof RELEVANT_EVENT_TYPES)[number];

export interface NormalizedGithubEvent {
  /** GH event id — globally unique, monotonic, useful as a dedup key. */
  id: string;
  /** One of RELEVANT_EVENT_TYPES (validated by parser before emission). */
  type: string;
  actor: {
    login: string;
    /** May be null when the upstream event omits avatar URL. */
    avatarUrl: string | null;
  };
  /**
   * Type-specific GitHub payload. Kept opaque (Record<string, unknown>) so
   * we don't accidentally couple the firehose to a specific renderer; the
   * route layer can pluck fields it needs (e.g. action, ref, release.tag_name)
   * without forcing a schema migration when GitHub adds a new field.
   */
  payload: Record<string, unknown>;
  /** ISO timestamp of when the event was created on GitHub. */
  createdAt: string;
}

export interface GithubEventsPayload {
  fetchedAt: string;
  /** GitHub numeric repository ID — same as repo-metadata's `githubId`. */
  repoId: number;
  /** "owner/name" form, kept for human-readable diagnostics + route validation. */
  fullName: string;
  /** Count of normalized events in `events` (post-filter). */
  eventCount: number;
  /** Newest first, capped at 100 (one GH page). */
  events: NormalizedGithubEvent[];
  /** ETag from last successful upstream fetch — kept for diagnostics, not used as cache key (the worker's HTTP client owns the ETag cache in Redis). */
  etag: string | null;
}

export interface GithubEventsIndexEntry {
  repoId: number;
  fullName: string;
  /** 1-based rank in the watchlist; lower = higher priority. */
  rank: number;
}

export interface GithubEventsIndexPayload {
  fetchedAt: string;
  watchlistSize: number;
  /** Ordered by `rank` ascending. */
  repos: GithubEventsIndexEntry[];
}
