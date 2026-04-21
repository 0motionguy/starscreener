// Reddit mentions loader.
//
// Reads data/reddit-mentions.json (produced by scripts/scrape-reddit.mjs)
// and exposes a typed surface for the /reddit page.
//
// The on-disk format is append-only across phases: newer scrapes may include
// `allPosts` + `leaderboard`, while older files may only have `topPosts` and
// per-repo mention buckets. This loader normalizes legacy files so the UI
// still has velocity fields, baseline labels, and a full deduped feed.

import redditData from "../../data/reddit-mentions.json";

import type {
  BaselineConfidence,
  BaselineTier,
  BaselineRatioResult,
} from "./reddit-baselines";
import { computeBaselineRatio } from "./reddit-baselines";

export interface RedditPost {
  id: string;
  subreddit: string;
  title: string;
  url: string;
  permalink: string;
  score: number;
  numComments: number;
  createdUtc: number;
  author: string;
  /** owner/name of the GitHub repo mentioned in this post, if any. */
  repoFullName: string | null;
  /**
   * post.score / subreddit.median_upvotes from reddit-baselines.json.
   * null when the sub has no baseline yet (new sub, or baseline fetch
   * failed). Written by scripts/scrape-reddit.mjs; stays null on files
   * predating Phase 1.
   */
  baselineRatio?: number | null;
  baselineTier?: BaselineTier;
  baselineConfidence?: BaselineConfidence | null;
  /**
   * Phase 2 velocity fields. All optional for backwards compat with
   * reddit-mentions.json files produced before Phase 2 landed.
   */
  ageHours?: number;
  velocity?: number;
  trendingScore?: number;
  /**
   * Phase 3 content classification. Tags produced by scripts/classify-post.mjs,
   * value_score = sum of value tags minus 1 for is-meme. Optional for the
   * same backwards-compat reason as velocity fields above.
   */
  content_tags?: string[];
  value_score?: number;
}

// ---------------------------------------------------------------------------
// Phase 2: tabbed view
// ---------------------------------------------------------------------------

export type RedditTab = "trending-now" | "hot-7d" | "all-mentions";

export const REDDIT_TAB_IDS: RedditTab[] = [
  "trending-now",
  "hot-7d",
  "all-mentions",
];

export const REDDIT_TAB_LABELS: Record<RedditTab, string> = {
  "trending-now": "Trending Now",
  "hot-7d": "Hot 7d",
  "all-mentions": "All Mentions",
};

/**
 * Apply the tab's filter + sort to the provided post list. `nowMs` is
 * injectable so server-render stays deterministic within a request and
 * tests can pin the clock.
 */
export function getPostsByTab(
  posts: RedditPost[],
  tab: RedditTab,
  nowMs: number = Date.now(),
): RedditPost[] {
  const HOUR = 60 * 60 * 1000;
  const cutoff24h = nowMs - 24 * HOUR;
  const cutoff7d = nowMs - 7 * 24 * HOUR;

  const withinMs = (p: RedditPost, cutoff: number) =>
    p.createdUtc * 1000 >= cutoff;

  switch (tab) {
    case "trending-now":
      return posts
        .filter((p) => withinMs(p, cutoff24h))
        .slice()
        .sort(
          (a, b) => (b.trendingScore ?? 0) - (a.trendingScore ?? 0),
        );
    case "hot-7d":
      return posts
        .filter((p) => withinMs(p, cutoff7d))
        .slice()
        .sort((a, b) => {
          // baseline_ratio × upvotes — reach × normalized quality
          const av = (a.baselineRatio ?? 1) * a.score;
          const bv = (b.baselineRatio ?? 1) * b.score;
          return bv - av;
        });
    case "all-mentions":
      return posts
        .slice()
        .sort((a, b) => b.score - a.score);
  }
}

/**
 * Count of breakout-tier posts (baselineTier === "breakout") in last 24h.
 * Replaces the Phase-1 "top repo" stat tile with a velocity-aware number.
 */
export function getBreakoutCountLast24h(
  posts: RedditPost[],
  nowMs: number = Date.now(),
): number {
  const cutoff = nowMs - 24 * 60 * 60 * 1000;
  let n = 0;
  for (const p of posts) {
    if (p.baselineTier !== "breakout") continue;
    if (p.createdUtc * 1000 < cutoff) continue;
    n += 1;
  }
  return n;
}

export interface RedditRepoMention {
  count7d: number;
  upvotes7d: number;
  posts: RedditPost[];
}

export interface RedditLeaderboardEntry {
  fullName: string;
  count7d: number;
  upvotes7d: number;
}

export interface RedditMentionsFile {
  fetchedAt: string;
  cold: boolean;
  scannedSubreddits: string[];
  scannedPostsTotal: number;
  mentions: Record<string, RedditRepoMention>;
  topPosts: RedditPost[];
  allPosts?: RedditPost[];
  leaderboard?: RedditLeaderboardEntry[];
}

const data = redditData as unknown as RedditMentionsFile;

export const redditFetchedAt: string = data.fetchedAt;
export const redditCold: boolean = data.cold === true;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function computeVelocityMetrics(
  score: number,
  createdUtc: number,
  nowMs: number = Date.now(),
): Pick<RedditPost, "ageHours" | "velocity" | "trendingScore"> {
  const nowSec = Math.floor(nowMs / 1000);
  const ageSec = Math.max(0, nowSec - createdUtc);
  const ageHours = Math.max(0.5, ageSec / 3600);
  const velocity = score / ageHours;
  const logMagnitude = Math.log10(Math.max(1, score));
  return {
    ageHours: round2(ageHours),
    velocity: round2(velocity),
    trendingScore: round2(velocity * logMagnitude),
  };
}

function resolveBaseline(
  post: RedditPost,
): BaselineRatioResult {
  if (post.baselineTier !== undefined) {
    return {
      ratio: post.baselineRatio ?? null,
      tier: post.baselineTier,
      confidence: post.baselineConfidence ?? null,
    };
  }
  return computeBaselineRatio(post.subreddit, post.score);
}

export function hydrateRedditPost(
  post: RedditPost,
  nowMs: number = Date.now(),
): RedditPost {
  const baseline = resolveBaseline(post);
  const computed = computeVelocityMetrics(post.score, post.createdUtc, nowMs);
  const effectiveRatio = (post.baselineRatio ?? baseline.ratio) ?? 1.0;
  const trendingScore =
    post.trendingScore ??
    round2((computed.velocity ?? 0) * effectiveRatio * Math.log10(Math.max(1, post.score)));

  return {
    ...post,
    baselineRatio: post.baselineRatio ?? baseline.ratio,
    baselineTier: post.baselineTier ?? baseline.tier,
    baselineConfidence: post.baselineConfidence ?? baseline.confidence,
    ageHours: post.ageHours ?? computed.ageHours,
    velocity: post.velocity ?? computed.velocity,
    trendingScore,
  };
}

function flattenMentionPosts(file: RedditMentionsFile): RedditPost[] {
  const out: RedditPost[] = [];
  for (const mention of Object.values(file.mentions)) {
    for (const post of mention.posts) out.push(post);
  }
  return out;
}

export function buildGlobalRedditPosts(
  file: RedditMentionsFile,
  nowMs: number = Date.now(),
): RedditPost[] {
  const byId = new Map<string, RedditPost>();
  const sources: RedditPost[][] = [];
  if (Array.isArray(file.allPosts) && file.allPosts.length > 0) {
    sources.push(file.allPosts);
  }
  if (Array.isArray(file.topPosts) && file.topPosts.length > 0) {
    sources.push(file.topPosts);
  }
  sources.push(flattenMentionPosts(file));

  for (const posts of sources) {
    for (const raw of posts) {
      if (!raw || !raw.id) continue;
      if (byId.has(raw.id)) continue;
      byId.set(raw.id, hydrateRedditPost(raw, nowMs));
    }
  }

  return Array.from(byId.values());
}

function sortLeaderboard(
  rows: RedditLeaderboardEntry[],
): RedditLeaderboardEntry[] {
  return rows
    .slice()
    .sort((a, b) => {
      if (b.upvotes7d !== a.upvotes7d) return b.upvotes7d - a.upvotes7d;
      if (b.count7d !== a.count7d) return b.count7d - a.count7d;
      return a.fullName.localeCompare(b.fullName);
    });
}

function buildLeaderboardFromPosts(
  posts: RedditPost[],
): RedditLeaderboardEntry[] {
  const grouped = new Map<string, RedditLeaderboardEntry>();
  for (const post of posts) {
    if (!post.repoFullName) continue;
    const row = grouped.get(post.repoFullName) ?? {
      fullName: post.repoFullName,
      count7d: 0,
      upvotes7d: 0,
    };
    row.count7d += 1;
    row.upvotes7d += post.score;
    grouped.set(post.repoFullName, row);
  }
  return sortLeaderboard(Array.from(grouped.values()));
}

export function buildRedditStats(
  file: RedditMentionsFile,
  nowMs: number = Date.now(),
): RedditStats {
  const globalPosts = buildGlobalRedditPosts(file, nowMs);
  const topRepos =
    Array.isArray(file.leaderboard) && file.leaderboard.length > 0
      ? sortLeaderboard(file.leaderboard).slice(0, 20)
      : buildLeaderboardFromPosts(globalPosts).slice(0, 20);
  const entries = Object.entries(file.mentions);

  return {
    totalMentions: globalPosts.length,
    reposWithMentions: entries.length,
    subredditsScanned: file.scannedSubreddits.length,
    postsScanned: file.scannedPostsTotal,
    topRepos,
  };
}

export function repoFullNameToHref(fullName: string): string {
  const [owner, name] = fullName.split("/", 2);
  if (!owner || !name) return "/repo";
  return `/repo/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
}

export function getRedditFile(): RedditMentionsFile {
  return data;
}

export function getRedditMentions(fullName: string): RedditRepoMention | null {
  const entry = data.mentions[fullName];
  return entry ?? null;
}

export function getAllRedditMentions(): Record<string, RedditRepoMention> {
  return data.mentions;
}

export function getAllRedditPosts(nowMs: number = Date.now()): RedditPost[] {
  return buildGlobalRedditPosts(data, nowMs);
}

export function getRedditTopPosts(
  limit = 50,
  nowMs: number = Date.now(),
): RedditPost[] {
  const posts = buildGlobalRedditPosts(data, nowMs)
    .slice()
    .sort((a, b) => {
      const delta = (b.trendingScore ?? 0) - (a.trendingScore ?? 0);
      if (delta !== 0) return delta;
      return b.score - a.score;
    });
  if (posts.length <= limit) return posts;
  return posts.slice(0, limit);
}

export function getRedditSubreddits(): string[] {
  return data.scannedSubreddits;
}

export interface RedditStats {
  totalMentions: number;
  reposWithMentions: number;
  subredditsScanned: number;
  postsScanned: number;
  topRepos: RedditLeaderboardEntry[];
}

export function getRedditStats(): RedditStats {
  return buildRedditStats(data);
}
