import { readFileSync, statSync } from "fs";
import { resolve } from "path";

import type {
  RedditLeaderboardEntry,
  RedditMentionsFile,
  RedditPost,
  RedditRepoMention,
  RedditStats,
} from "./reddit";
import { buildGlobalRedditPosts, buildRedditStats } from "./reddit";

const REDDIT_MENTIONS_PATH = resolve(
  process.cwd(),
  "data",
  "reddit-mentions.json",
);
const EPOCH_ZERO = "1970-01-01T00:00:00.000Z";

interface RedditCache {
  signature: string;
  file: RedditMentionsFile;
  mentionsByLowerName: Map<string, RedditRepoMention>;
}

let cache: RedditCache | null = null;

function createFallbackFile(): RedditMentionsFile {
  return {
    fetchedAt: EPOCH_ZERO,
    cold: true,
    scannedSubreddits: [],
    scannedPostsTotal: 0,
    mentions: {},
    topPosts: [],
    allPosts: [],
    leaderboard: [],
  };
}

function getFileSignature(path: string): string {
  try {
    const stat = statSync(path);
    return `${stat.mtimeMs}:${stat.size}`;
  } catch {
    return "missing";
  }
}

function normalizeFile(input: unknown): RedditMentionsFile {
  if (!input || typeof input !== "object") {
    return createFallbackFile();
  }
  const file = input as Partial<RedditMentionsFile>;
  const mentions =
    file.mentions && typeof file.mentions === "object"
      ? (file.mentions as Record<string, RedditRepoMention>)
      : {};
  const topPosts = Array.isArray(file.topPosts)
    ? (file.topPosts as RedditPost[])
    : [];
  const allPosts = Array.isArray(file.allPosts)
    ? (file.allPosts as RedditPost[])
    : [];
  const leaderboard = Array.isArray(file.leaderboard)
    ? (file.leaderboard as RedditLeaderboardEntry[])
    : [];

  return {
    fetchedAt:
      typeof file.fetchedAt === "string" && file.fetchedAt.trim().length > 0
        ? file.fetchedAt
        : EPOCH_ZERO,
    cold: file.cold === true,
    authMode:
      file.authMode === "oauth" || file.authMode === "public-json"
        ? file.authMode
        : undefined,
    effectiveFetchMode:
      file.effectiveFetchMode === "oauth" ||
      file.effectiveFetchMode === "public-json"
        ? file.effectiveFetchMode
        : undefined,
    fallbackUsed: file.fallbackUsed === true,
    oauthFailures:
      typeof file.oauthFailures === "number" &&
      Number.isFinite(file.oauthFailures)
        ? file.oauthFailures
        : 0,
    successfulSubreddits:
      typeof file.successfulSubreddits === "number" &&
      Number.isFinite(file.successfulSubreddits)
        ? file.successfulSubreddits
        : undefined,
    failedSubreddits:
      typeof file.failedSubreddits === "number" &&
      Number.isFinite(file.failedSubreddits)
        ? file.failedSubreddits
        : undefined,
    oauthRequests:
      typeof file.oauthRequests === "number" &&
      Number.isFinite(file.oauthRequests)
        ? file.oauthRequests
        : undefined,
    publicRequests:
      typeof file.publicRequests === "number" &&
      Number.isFinite(file.publicRequests)
        ? file.publicRequests
        : undefined,
    scannedSubreddits: Array.isArray(file.scannedSubreddits)
      ? file.scannedSubreddits.filter((value): value is string =>
          typeof value === "string",
        )
      : [],
    scannedPostsTotal:
      typeof file.scannedPostsTotal === "number" &&
      Number.isFinite(file.scannedPostsTotal)
        ? file.scannedPostsTotal
        : 0,
    mentions,
    topPosts,
    allPosts,
    leaderboard,
  };
}

function loadRedditCache(): RedditCache {
  const signature = getFileSignature(REDDIT_MENTIONS_PATH);
  if (cache && cache.signature === signature) return cache;

  let file = createFallbackFile();
  try {
    const raw = readFileSync(REDDIT_MENTIONS_PATH, "utf8");
    file = normalizeFile(JSON.parse(raw));
  } catch {
    file = createFallbackFile();
  }

  const mentionsByLowerName = new Map<string, RedditRepoMention>();
  for (const [fullName, mention] of Object.entries(file.mentions)) {
    mentionsByLowerName.set(fullName.toLowerCase(), mention);
  }

  cache = {
    signature,
    file,
    mentionsByLowerName,
  };
  return cache;
}

export function getRedditDataVersion(): string {
  return loadRedditCache().signature;
}

export function getRedditFile(): RedditMentionsFile {
  return loadRedditCache().file;
}

export function isRedditCold(file: RedditMentionsFile = getRedditFile()): boolean {
  return (
    !file.fetchedAt ||
    file.fetchedAt.startsWith("1970-") ||
    file.scannedPostsTotal === 0
  );
}

export function getRedditFetchedAt(): string | null {
  const file = getRedditFile();
  return isRedditCold(file) ? null : file.fetchedAt;
}

export function getRedditMentions(fullName: string): RedditRepoMention | null {
  if (!fullName) return null;
  return loadRedditCache().mentionsByLowerName.get(fullName.toLowerCase()) ?? null;
}

export function getAllRedditMentions(): Record<string, RedditRepoMention> {
  return getRedditFile().mentions;
}

export function getAllRedditPosts(nowMs: number = Date.now()): RedditPost[] {
  return buildGlobalRedditPosts(getRedditFile(), nowMs);
}

export function getRedditTopPosts(
  limit = 50,
  nowMs: number = Date.now(),
): RedditPost[] {
  const posts = buildGlobalRedditPosts(getRedditFile(), nowMs)
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
  return getRedditFile().scannedSubreddits;
}

export function getRedditStats(): RedditStats {
  return buildRedditStats(getRedditFile());
}
