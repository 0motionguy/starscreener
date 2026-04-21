// Bluesky loader — trending side.
//
// Reads data/bluesky-trending.json (top AI-keyword posts across 5
// keywords, engagement-scored).
//
// Split from src/lib/bluesky.ts so client components that only need
// per-repo mention badges don't pull the (larger) trending JSON into
// their bundle. The future /bluesky trending page imports from here.
//
// Lazy-hydrates ageHours / trendingScore on stories produced by older
// scraper builds — mirrors hackernews-trending.ts.

import bskyTrendingData from "../../data/bluesky-trending.json";
import type { BskyPost, BskyTrendingFile } from "./bluesky";

const trendingFile = bskyTrendingData as unknown as BskyTrendingFile;

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
 * Filter trending posts to a single keyword bucket (the keyword that
 * surfaced the post on its originating searchPosts call). Useful for the
 * future /bluesky/<keyword> breakdown view.
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
