// video-mentions — payload shape for the YouTube-v1 mention counter.
//
// The fetcher writes `ss:data:v1:video-mentions` with one entry per repo
// fullName lowercased; the read path treats anything older than
// staleness_seconds as missing (TTL gate is consumer-side per the ULTRA plan
// hard rule for new fetchers).
//
// `count7d` is the upstream-reported `pageInfo.totalResults` from a YouTube
// Data API v3 Search:list call with `publishedAfter = now - 7d`. It's a count
// of public videos matching the repo fullName as a free-text query — not
// click-throughs, watch time, or any quality signal. Operators can promote it
// to a cross-source signal in consensus-trending once the YouTube quota
// settles and a few weeks of comparison data exists.

export interface VideoMentionsTopVideo {
  title: string;
  url: string;
  channelTitle?: string;
  publishedAt?: string;
}

export interface VideoMentionsEntry {
  /** Upstream pageInfo.totalResults for `q=<fullName>` over the last 7d. */
  count7d: number;
  /** Up to 5 sample videos, for hover/preview on the eventual UI. */
  topVideos: VideoMentionsTopVideo[];
  /** ISO timestamp this entry was scored. */
  fetchedAt: string;
}

export interface VideoMentionsPayload {
  /** When this snapshot was published. */
  computedAt: string;
  /**
   * Hard TTL for the payload in seconds. Consumers MUST treat the payload as
   * missing once `now - computedAt > staleness_seconds`. Default 24h covers
   * the full top-200 sweep at 100 repos/hour with one cycle buffer.
   */
  staleness_seconds: number;
  /** Cursor position in the top-200 sweep at the end of this run. */
  cursor: number;
  /** How many repos this run refreshed. */
  scanned: number;
  /** How many repos failed (rate-limit, 4xx, timeout, etc.). */
  failed: number;
  /** Repo fullName (lowercased) → mention entry. */
  items: Record<string, VideoMentionsEntry>;
}

export const VIDEO_MENTIONS_SLUG = 'video-mentions';
export const VIDEO_MENTIONS_CURSOR_KEY = 'ss:video-mentions:cursor';
export const VIDEO_MENTIONS_DEFAULT_STALENESS_SECONDS = 24 * 60 * 60;
