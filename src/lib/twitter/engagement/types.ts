// X (Twitter) engagement engine — shared types.
//
// This engine READS fresh posts from curated AI/dev accounts + topic
// searches, composes an on-brand reply in our voice, and (in live mode only)
// posts it as a reply to the target tweet via the existing outbound adapter's
// `in_reply_to_tweet_id` path. Anti-spam caps + a hard kill switch gate every
// step — see gate.ts (TWITTER_ENGAGEMENT_MODE) and ledger.ts (Redis caps).
//
// No node:* imports here — pure types, safe to re-export into any surface.

/**
 * Kill switch / arming gate. SEPARATE from TWITTER_OUTBOUND_MODE so replies
 * arm independently of the 7x/day broadcast autopilot.
 *   - off  : hard kill — do nothing, post nothing (default everywhere).
 *   - dry  : run the full pipeline, compose drafts, write audit, post NOTHING.
 *   - live : compose + actually post the reply, consume caps, record ledger.
 */
export type EngagementMode = "off" | "dry" | "live";

/** Tier of a curated engagement target — drives ranking + reply angle. */
export type EngagementTier = "operator" | "curator" | "builder" | "tool";

/**
 * A curated engagement target — an account whose posts the brand wants to add
 * genuine value under. Operator-editable (see targets.ts + ENGAGE_TARGETS_JSON).
 */
export interface EngagementTarget {
  /** X handle WITHOUT the leading @. */
  handle: string;
  /** operator | curator | builder | tool — audience/role class. */
  tier: EngagementTier;
  /** Approximate follower count (context for ranking / prioritisation). */
  followerCount: number;
  /** Topic tags — the account's beat, used to scope relevance. */
  topicTags: string[];
  /** How to reply well to this account (per-account guidance for the composer). */
  replyAngle: string;
  /**
   * Per-account caution flags that drive the pre-compose classifier, e.g.
   * "crypto-politics-firehose", "no-hot-takes", "skip-hype", "skip-link-only",
   * "low-roi", "skip-heavy". Empty for accounts with no special handling.
   */
  cautionFlags: string[];
}

/**
 * Neutral candidate post shape returned by the X search provider. Mirrors the
 * fields the freshness filter + reply composer + ledger need, decoupled from
 * whichever engine (toolbox nitter, GraphQL) produced it.
 */
export interface EngagementCandidate {
  /** Tweet id — the `in_reply_to_tweet_id` target when we reply. */
  id: string;
  /** Canonical post URL (for the audit trail / operator review). */
  url: string;
  /**
   * Stable author key for the 1-reply-per-author cooldown. Numeric id when the
   * provider exposes one, else the lower-cased handle (nitter has no numeric id).
   */
  authorId: string;
  /** Author handle WITHOUT the leading @. */
  authorHandle: string;
  /** Post body text. */
  text: string;
  /** ISO timestamp the post was created. */
  createdAt: string;
  /** True when the post is a reply (we skip replying to replies). */
  isReply: boolean;
  /** True when the post is a retweet/repost (we skip retweets). */
  isRetweet: boolean;
  /** Like count when known (0 when the provider has no engagement metrics). */
  likeCount: number;
  /** What surfaced this candidate — a target handle or topic query — for audit. */
  matchedReason: string;
}

/** One row of the durable engagement audit trail (operator review surface). */
export interface EngagementRecord {
  /** ISO timestamp of the attempt. */
  ts: string;
  /** YYYY-MM-DD (UTC) — groups by day for the cap. */
  date: string;
  /** Mode the attempt ran under. */
  mode: "dry" | "live";
  /** Outcome of the attempt. */
  status: "drafted" | "posted" | "skipped" | "error";
  /** Stable author key of the target. */
  authorId: string;
  /** Target author handle (no @). */
  authorHandle: string;
  /** Target tweet id we replied (or would reply) to. */
  postId: string;
  /** Target tweet URL. */
  postUrl: string;
  /** Why this target was chosen, or the skip/error reason. */
  reason: string;
  /** The composed reply text — null when we couldn't compose one. */
  replyText: string | null;
  /** Our reply's tweet id when posted (live only). */
  tweetId: string | null;
  /** Our reply's public URL when posted. */
  replyUrl: string | null;
}

/** Structured result returned by runEngagement — never throws. */
export interface EngagementResult {
  ok: true;
  mode: EngagementMode;
  /** One-line reason when the run was a no-op (mode-off, budget-exhausted, ...). */
  reason?: string;
  /** Candidate posts fetched across all queries (post-dedupe). */
  scanned: number;
  /** Candidates that passed freshness + ledger gates. */
  eligible: number;
  /** Replies drafted (dry mode) or composed pre-post. */
  drafted: number;
  /** Replies actually posted (live mode). */
  posted: number;
  /** Candidates skipped (compose-null / no transport). */
  skipped: number;
  /** Remaining daily reply budget at the end of the run. */
  dailyBudgetRemaining: number;
  /** Audit rows produced this run (drafted / posted / notable skips). */
  records: EngagementRecord[];
}
