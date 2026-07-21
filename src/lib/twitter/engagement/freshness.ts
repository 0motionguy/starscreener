// X engagement — freshness filter. Pure + deterministic (inject `now`), so it
// unit-tests without any I/O. Decides whether a candidate post is worth
// replying to RIGHT NOW: recent enough, original (not a reply/retweet), not
// our own, and clearing an optional minimum-engagement floor.

import type { EngagementCandidate } from "./types";

export interface FreshnessConfig {
  /** Max post age in hours. Default 6. */
  maxAgeH: number;
  /** Minimum like count. Default 0 (off). */
  minLikes: number;
  /** Our own handle (lower-cased, no @) — never reply to ourselves. */
  ownHandle: string;
}

export const DEFAULT_MAX_AGE_H = 6;
export const DEFAULT_MIN_LIKES = 0;
export const DEFAULT_OWN_HANDLE = "trendingrepo";

/**
 * Resolve the freshness config from env. Kept separate from `isFresh` so the
 * predicate stays pure and fully testable with explicit values.
 *   ENGAGE_MAX_AGE_H   — max post age, hours (default 6)
 *   ENGAGE_MIN_LIKES   — minimum likes (default 0 = off)
 *   TWITTER_USERNAME   — our handle, so we never reply to our own posts
 */
export function freshnessConfigFromEnv(
  env: Record<string, string | undefined> = process.env,
): FreshnessConfig {
  const maxAgeRaw = Number.parseInt(env.ENGAGE_MAX_AGE_H ?? "", 10);
  const minLikesRaw = Number.parseInt(env.ENGAGE_MIN_LIKES ?? "", 10);
  const own = env.TWITTER_USERNAME?.trim().replace(/^@+/, "").toLowerCase();
  return {
    maxAgeH: Number.isFinite(maxAgeRaw) && maxAgeRaw > 0 ? maxAgeRaw : DEFAULT_MAX_AGE_H,
    minLikes: Number.isFinite(minLikesRaw) && minLikesRaw >= 0 ? minLikesRaw : DEFAULT_MIN_LIKES,
    ownHandle: own && own.length > 0 ? own : DEFAULT_OWN_HANDLE,
  };
}

/**
 * True when `post` is worth engaging with. Rejects, in order:
 *   - retweets / reposts
 *   - replies (we open value under original posts, not reply chains)
 *   - our own posts (case-insensitive handle match)
 *   - posts with an unparseable or future-dated timestamp
 *   - posts older than `maxAgeH`
 *   - posts below the `minLikes` floor
 *
 * Pure — pass `now` (epoch ms) for deterministic tests; defaults to Date.now().
 */
export function isFresh(
  post: EngagementCandidate,
  config: FreshnessConfig,
  now: number = Date.now(),
): boolean {
  if (post.isRetweet) return false;
  if (post.isReply) return false;

  const handle = post.authorHandle.trim().replace(/^@+/, "").toLowerCase();
  if (handle && handle === config.ownHandle.toLowerCase()) return false;

  const createdMs = Date.parse(post.createdAt);
  if (!Number.isFinite(createdMs)) return false;
  // A post dated in the future (clock skew / bad data) is not trustworthy.
  if (createdMs > now) return false;

  const ageH = (now - createdMs) / (60 * 60 * 1000);
  if (ageH > config.maxAgeH) return false;

  if (config.minLikes > 0 && post.likeCount < config.minLikes) return false;

  return true;
}
