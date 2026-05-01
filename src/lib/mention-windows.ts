// Shared helper for windowed mention counts (W5-MENTWINDOW, Phase 5).
//
// Per-source mention loaders (reddit-data, hackernews, bluesky, devto,
// lobsters) historically only emit a `count7d` rollup. The cross-signal
// scorer + UI mention badges want 24h / 7d / 30d windows alongside the
// 7d aggregate so we can show "X mentions in last 24h" without re-doing
// the post-by-post bucketing in every caller.
//
// This helper is intentionally tiny + pure: no I/O, no module state, no
// data-store coupling. Loaders compute their windowed counts at refresh
// time from the same raw rows they already iterate.
//
// Timestamp formats found in the wild (verified against current shapes):
//   - HnStory + LobstersStory + RedditPost: `createdUtc: number` (epoch *seconds*)
//   - BskyPost: `createdAt: string` (ISO) AND `createdUtc: number` (epoch seconds)
//   - DevtoArticle: `publishedAt: string` (ISO)
//   - TwitterRepoSignal: `postedAt: string` (ISO)
//
// We accept all three keys defensively so a single helper covers every
// per-source loader without a per-source adapter.

export interface MentionWindowEntry {
  /** ISO 8601 string (dev.to publishedAt, twitter postedAt). */
  postedAt?: string | number | null;
  /** Epoch *seconds* (HN, Reddit, Lobsters, Bluesky `createdUtc`). */
  createdUtc?: number | null;
  /** ISO 8601 string (Bluesky `createdAt`, fallback for any source that
   *  uses snake_case). */
  created_at?: string | null;
}

/**
 * Resolve a row's posted-at timestamp to milliseconds since epoch.
 * Returns NaN when no recognizable timestamp is present so callers can
 * skip the row instead of silently bucketing a 1970-epoch post.
 */
function resolvePostedAtMs(row: MentionWindowEntry): number {
  // Prefer ISO postedAt when it's a string. Numeric postedAt is treated
  // as epoch ms (twitter pipeline uses both shapes).
  if (typeof row.postedAt === "string" && row.postedAt.length > 0) {
    const ms = Date.parse(row.postedAt);
    if (Number.isFinite(ms)) return ms;
  }
  if (typeof row.postedAt === "number" && Number.isFinite(row.postedAt)) {
    // Heuristic: a 10-digit number is epoch seconds; 13-digit is ms.
    return row.postedAt < 1e12 ? row.postedAt * 1000 : row.postedAt;
  }
  if (typeof row.createdUtc === "number" && Number.isFinite(row.createdUtc)) {
    // Always epoch *seconds* in our codebase.
    return row.createdUtc * 1000;
  }
  if (typeof row.created_at === "string" && row.created_at.length > 0) {
    const ms = Date.parse(row.created_at);
    if (Number.isFinite(ms)) return ms;
  }
  return Number.NaN;
}

/**
 * Count rows in `rows` posted within the last `windowMs` from `nowMs`.
 *
 * Defensive: rows missing every timestamp field are skipped (not counted
 * toward the window).
 */
export function countMentionsInWindow<T extends MentionWindowEntry>(
  rows: readonly T[] | null | undefined,
  windowMs: number,
  nowMs: number = Date.now(),
): number {
  if (!Array.isArray(rows) || rows.length === 0) return 0;
  if (!Number.isFinite(windowMs) || windowMs <= 0) return 0;
  const cutoff = nowMs - windowMs;
  let count = 0;
  for (const row of rows) {
    if (!row) continue;
    const ms = resolvePostedAtMs(row);
    if (!Number.isFinite(ms)) continue;
    if (ms >= cutoff) count += 1;
  }
  return count;
}

// Convenience constants — keep loaders readable (`countMentionsInWindow(rows, WINDOW_24H)`).
export const WINDOW_24H = 24 * 60 * 60 * 1000;
export const WINDOW_7D = 7 * 24 * 60 * 60 * 1000;
export const WINDOW_30D = 30 * 24 * 60 * 60 * 1000;

/**
 * Mixin type for source-specific RepoMention rollups so each loader can
 * spread the same windowed-count slot rather than redeclaring three
 * optionals. Kept additive — `count7d` lives on the per-source rollup
 * type itself with its source-specific semantics intact.
 */
export interface WindowedMentionCounts {
  count24h?: number;
  count30d?: number;
}
