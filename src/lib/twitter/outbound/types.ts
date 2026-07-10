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
  | "daily_breakouts_vertical_spotlight"
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
  /**
   * fullNames of repos featured in this run. Optional — rows written
   * before the field existed lack it. The daily selector reads this to
   * keep a repo from headlining two days in a row.
   */
  featuredRepos?: string[];
  /**
   * The composed thread as it went to the adapter, zipped with the
   * adapter's per-post outcome. Optional — rows written before the
   * field existed lack it. This is what makes console/null-mode runs
   * reviewable: an operator can read exactly what WOULD have been
   * posted from the audit trail (surfaced via
   * GET /api/admin/twitter-outbound).
   */
  posts?: OutboundRunPost[];
}

export interface OutboundRunPost {
  kind: OutboundPostKind;
  text: string;
  url: string | null;
  status: AdapterPostResult["status"];
}

/**
 * Bearer-token source for publishing adapters. A static env token
 * satisfies this trivially; the OAuth2 refresh-rotation manager
 * implements the full contract. Pure interface (no node:* imports)
 * per this module's header rule.
 */
export interface OutboundTokenProvider {
  /** Current access token, refreshing first if it's expired/near expiry. */
  getAccessToken(): Promise<string>;
  /**
   * Drop the cached token and force a refresh — called when the API
   * rejects a token the provider thought was valid (401 mid-thread).
   */
  invalidateAndRefresh(): Promise<string>;
}
