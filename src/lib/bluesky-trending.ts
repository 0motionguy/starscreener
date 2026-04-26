// Bluesky loader — trending side.
//
// Reads data/bluesky-trending.json (top AI-topic posts across curated
// query families, engagement-scored).
//
// Split from src/lib/bluesky.ts so client components that only need
// per-repo mention badges don't pull the (larger) trending JSON into
// their bundle. The future /bluesky trending page imports from here.
//
// Lazy-hydrates ageHours / trendingScore on stories produced by older
// scraper builds — mirrors hackernews-trending.ts.

import bskyTrendingData from "../../data/bluesky-trending.json";
import { getDataStore } from "./data-store";
import type { BskyPost, BskyTrendingFile } from "./bluesky";

// Mutable in-memory cache — seeded from bundled JSON, replaced via
// refreshBlueskyTrendingFromStore().
let trendingFile: BskyTrendingFile = bskyTrendingData as unknown as BskyTrendingFile;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function computeTrendingScore(
  likes: number,
  reposts: number,
  replies: number,
): number {
  return round2(likes + 2 * reposts + 0.5 * replies);
}

function hydratePost(post: BskyPost, nowMs: number): BskyPost {
  const have = post.ageHours !== undefined && post.trendingScore !== undefined;
  if (have) return post;
  const createdMs = Date.parse(post.createdAt);
  const ageHours = Number.isFinite(createdMs)
    ? Math.max(0.5, (nowMs - createdMs) / 3_600_000)
    : 0.5;
  return {
    ...post,
    ageHours: post.ageHours ?? round2(ageHours),
    trendingScore:
      post.trendingScore ??
      computeTrendingScore(post.likeCount, post.repostCount, post.replyCount),
  };
}

export function getBlueskyTrendingFile(): BskyTrendingFile {
  return trendingFile;
}

/**
 * Top N Bluesky posts by trendingScore. Hydrates derived fields on the
 * fly for any historical post written by a scraper version that didn't
 * persist them.
 */
export function getBlueskyTopPosts(
  limit = 50,
  nowMs: number = Date.now(),
): BskyPost[] {
  const hydrated = trendingFile.posts.map((p) => hydratePost(p, nowMs));
  hydrated.sort((a, b) => (b.trendingScore ?? 0) - (a.trendingScore ?? 0));
  if (hydrated.length <= limit) return hydrated;
  return hydrated.slice(0, limit);
}

/**
 * Filter trending posts to a single bucket (the topic-family label that
 * surfaced the post on its originating searchPosts call). Useful for the
 * future /bluesky/<topic> breakdown view.
 */
export function getBlueskyPostsByKeyword(
  keyword: string,
  limit = 50,
  nowMs: number = Date.now(),
): BskyPost[] {
  const k = keyword.trim().toLowerCase();
  const hydrated = trendingFile.posts
    .filter((p) => (p.matchedKeyword ?? "").toLowerCase() === k)
    .map((p) => hydratePost(p, nowMs));
  hydrated.sort((a, b) => (b.trendingScore ?? 0) - (a.trendingScore ?? 0));
  return hydrated.slice(0, limit);
}

export const BLUESKY_TRENDING_KEYWORDS: readonly string[] =
  trendingFile.keywords ?? [];

// ---------------------------------------------------------------------------
// Phase 4: refresh hook — pull latest bluesky-trending payload from data-store.
// ---------------------------------------------------------------------------

let inflight: Promise<{ source: string; ageMs: number }> | null = null;
let lastRefreshMs = 0;
const MIN_REFRESH_INTERVAL_MS = 30_000;

export async function refreshBlueskyTrendingFromStore(): Promise<{
  source: string;
  ageMs: number;
}> {
  if (inflight) return inflight;
  if (
    Date.now() - lastRefreshMs < MIN_REFRESH_INTERVAL_MS &&
    lastRefreshMs > 0
  ) {
    return { source: "memory", ageMs: Date.now() - lastRefreshMs };
  }
  inflight = (async () => {
    const result = await getDataStore().read<BskyTrendingFile>(
      "bluesky-trending",
    );
    if (result.data && result.source !== "missing") {
      trendingFile = result.data;
    }
    lastRefreshMs = Date.now();
    return { source: result.source, ageMs: result.ageMs };
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}
