// Loader for data/reddit-all-posts.json — the full scored-post universe
// (every post scanned across 45 subs, NOT filtered to repo-linked posts).
//
// Feeds the /reddit/trending topic mindshare map + feed. Uses fs.readFileSync
// at module init rather than a static JSON import because the file is 3-4 MB
// and Turbopack's chunk generator chokes on JSONs that large. This file is
// server-only; the JSON never ships to the browser.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { RedditPost } from "./reddit";

export interface RedditLinkedRepoMatch {
  fullName: string;
  matchType: "url" | "keyword" | "topic";
  confidence: number;
}

export interface RedditAllPost extends RedditPost {
  selftext?: string;
  linkedRepos?: RedditLinkedRepoMatch[];
}

export interface RedditAllPostsFile {
  lastFetchedAt: string;
  scannedSubreddits: string[];
  windowDays: number;
  totalPosts: number;
  prunedOldPosts: number;
  prunedOverflowPosts: number;
  posts: RedditAllPost[];
}

// Eager read at module init — mirrors the static-import ergonomics without
// tripping Turbopack's JSON chunk limit. Falls back to a cold seed shape if
// the file is missing (fresh clone before any scraper run).
function loadAllPostsFile(): RedditAllPostsFile {
  const p = resolve(process.cwd(), "data", "reddit-all-posts.json");
  try {
    const raw = readFileSync(p, "utf8");
    return JSON.parse(raw) as RedditAllPostsFile;
  } catch {
    return {
      lastFetchedAt: "1970-01-01T00:00:00.000Z",
      scannedSubreddits: [],
      windowDays: 7,
      totalPosts: 0,
      prunedOldPosts: 0,
      prunedOverflowPosts: 0,
      posts: [],
    };
  }
}

const data: RedditAllPostsFile = loadAllPostsFile();

export const allPostsFetchedAt: string = data.lastFetchedAt;
export const allPostsCold: boolean =
  !Array.isArray(data.posts) || data.posts.length === 0;

export function getAllScoredPosts(): RedditAllPost[] {
  return data.posts ?? [];
}

export function getAllPostsFile(): RedditAllPostsFile {
  return data;
}

export interface AllPostsStats {
  totalPosts: number;
  breakouts24h: number;
  topicsSurfaced: number; // filled by caller after topic extraction
  postsWithLinkedRepos: number;
}

export function getAllPostsStats(nowMs: number = Date.now()): AllPostsStats {
  const posts = getAllScoredPosts();
  const cutoff24h = nowMs - 24 * 60 * 60 * 1000;
  let breakouts24h = 0;
  let postsWithLinkedRepos = 0;
  for (const p of posts) {
    if (p.baselineTier === "breakout" && p.createdUtc * 1000 >= cutoff24h) {
      breakouts24h += 1;
    }
    if (Array.isArray(p.linkedRepos) && p.linkedRepos.length > 0) {
      postsWithLinkedRepos += 1;
    }
  }
  return {
    totalPosts: posts.length,
    breakouts24h,
    topicsSurfaced: 0,
    postsWithLinkedRepos,
  };
}
