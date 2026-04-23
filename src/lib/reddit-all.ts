// Shared types for data/reddit-all-posts.json.
//
// Pure module only. Server-side file loading lives in src/lib/reddit-all-data.ts.

import type { RedditPost } from "./reddit";

export interface RedditLinkedRepoMatch {
  fullName: string;
  matchType:
    | "url"
    | "repo_slug"
    | "repo_name"
    | "project_name"
    | "package_name"
    | "homepage_domain"
    | "owner_context"
    | "keyword"
    | "topic";
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

export interface AllPostsStats {
  totalPosts: number;
  breakouts24h: number;
  topicsSurfaced: number;
  postsWithLinkedRepos: number;
}

export function buildAllPostsStats(
  posts: RedditAllPost[],
  nowMs: number = Date.now(),
): AllPostsStats {
  const cutoff24h = nowMs - 24 * 60 * 60 * 1000;
  let breakouts24h = 0;
  let postsWithLinkedRepos = 0;
  for (const post of posts) {
    if (
      post.baselineTier === "breakout" &&
      post.createdUtc * 1000 >= cutoff24h
    ) {
      breakouts24h += 1;
    }
    if (Array.isArray(post.linkedRepos) && post.linkedRepos.length > 0) {
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
