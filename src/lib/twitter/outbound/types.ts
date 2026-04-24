// Outbound Twitter/X publishing — adapter interface.
//
// We don't bind the rest of the codebase to a specific Twitter SDK or
// auth model. Composers produce structured posts; an adapter does the
// last-mile call to whichever transport is configured (API v2 in prod,
// console logging in dev, no-op when creds are missing).
//
// No node:* imports here — pure types so this can be re-exported into
// client surfaces if we ever surface the composer output in the UI
// (e.g. a "preview the daily thread" admin view).

/**
 * One tweet in a composed thread. The first post in a list opens the
 * thread; subsequent posts reply to whatever the adapter returned for
 * the previous post.
 */
export interface ComposedPost {
  /** Plain text body. The composer is responsible for length budgeting. */
  text: string;
  /**
   * Optional URL appended at the end. Twitter's link shortener counts
   * URLs as 23 characters regardless of length, so the composer can
   * size text up to ~257 chars before adding a URL.
   */
  url?: string;
  /**
   * Tag for accounting / cron audit logs. e.g.
   * "daily_breakouts", "idea_published", "weekly_recap".
   */
  kind: OutboundPostKind;
}

export type OutboundPostKind =
  | "daily_breakouts_intro"
  | "daily_breakouts_item"
  | "daily_breakouts_idea_spotlight"
  | "weekly_recap_intro"
  | "weekly_recap_item"
  | "idea_published";

export interface AdapterPostResult {
  /** Provider tweet id, when the adapter actually published. */
  remoteId: string | null;
  /** Public URL for the published tweet, when known. */
  url: string | null;
  /** Distinguishes real-publish vs dry-run logging vs no-op. */
  status: "published" | "logged" | "skipped";
}

export interface AdapterThreadResult {
  posts: AdapterPostResult[];
  threadUrl: string | null;
}

export interface OutboundAdapter {
  readonly name: string;
  /**
   * Whether this adapter actually publishes to Twitter. The cron route
   * uses this to decide whether to record the run as "published" vs
   * "dry_run" in the audit table.
   */
  readonly publishes: boolean;
  /**
   * Publish a thread. Adapter returns one result per ComposedPost in
   * order — even no-op adapters return a result list of the same length
   * so the audit row is symmetrical.
   */
  postThread(thread: ComposedPost[]): Promise<AdapterThreadResult>;
}

export interface OutboundRunRecord {
  id: string;
  kind: OutboundPostKind | "daily_breakouts" | "weekly_recap";
  adapterName: string;
  status: "published" | "logged" | "skipped" | "error";
  threadUrl: string | null;
  postCount: number;
  startedAt: string;
  finishedAt: string;
  errorMessage: string | null;
}
