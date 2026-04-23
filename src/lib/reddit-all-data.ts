import { readFileSync, statSync } from "fs";
import { resolve } from "path";

import type { AllPostsStats, RedditAllPost, RedditAllPostsFile } from "./reddit-all";
import { buildAllPostsStats } from "./reddit-all";

const REDDIT_ALL_POSTS_PATH = resolve(
  process.cwd(),
  "data",
  "reddit-all-posts.json",
);
const EPOCH_ZERO = "1970-01-01T00:00:00.000Z";

interface RedditAllPostsCache {
  signature: string;
  file: RedditAllPostsFile;
}

let cache: RedditAllPostsCache | null = null;

function createFallbackFile(): RedditAllPostsFile {
  return {
    lastFetchedAt: EPOCH_ZERO,
    scannedSubreddits: [],
    windowDays: 7,
    totalPosts: 0,
    prunedOldPosts: 0,
    prunedOverflowPosts: 0,
    posts: [],
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

function normalizeFile(input: unknown): RedditAllPostsFile {
  if (!input || typeof input !== "object") {
    return createFallbackFile();
  }
  const file = input as Partial<RedditAllPostsFile>;
  return {
    lastFetchedAt:
      typeof file.lastFetchedAt === "string" && file.lastFetchedAt.trim().length > 0
        ? file.lastFetchedAt
        : EPOCH_ZERO,
    scannedSubreddits: Array.isArray(file.scannedSubreddits)
      ? file.scannedSubreddits.filter((value): value is string =>
          typeof value === "string",
        )
      : [],
    windowDays:
      typeof file.windowDays === "number" && Number.isFinite(file.windowDays)
        ? file.windowDays
        : 7,
    totalPosts:
      typeof file.totalPosts === "number" && Number.isFinite(file.totalPosts)
        ? file.totalPosts
        : 0,
    prunedOldPosts:
      typeof file.prunedOldPosts === "number" &&
      Number.isFinite(file.prunedOldPosts)
        ? file.prunedOldPosts
        : 0,
    prunedOverflowPosts:
      typeof file.prunedOverflowPosts === "number" &&
      Number.isFinite(file.prunedOverflowPosts)
        ? file.prunedOverflowPosts
        : 0,
    posts: Array.isArray(file.posts) ? (file.posts as RedditAllPost[]) : [],
  };
}

function loadAllPostsCache(): RedditAllPostsCache {
  const signature = getFileSignature(REDDIT_ALL_POSTS_PATH);
  if (cache && cache.signature === signature) return cache;

  let file = createFallbackFile();
  try {
    const raw = readFileSync(REDDIT_ALL_POSTS_PATH, "utf8");
    file = normalizeFile(JSON.parse(raw));
  } catch {
    file = createFallbackFile();
  }

  cache = { signature, file };
  return cache;
}

export function getAllPostsFile(): RedditAllPostsFile {
  return loadAllPostsCache().file;
}

export function isAllPostsCold(
  file: RedditAllPostsFile = getAllPostsFile(),
): boolean {
  return !file.lastFetchedAt || file.lastFetchedAt.startsWith("1970-");
}

export function getAllPostsFetchedAt(): string | null {
  const file = getAllPostsFile();
  return isAllPostsCold(file) ? null : file.lastFetchedAt;
}

export function getAllScoredPosts(): RedditAllPost[] {
  return getAllPostsFile().posts ?? [];
}

export function getAllPostsStats(nowMs: number = Date.now()): AllPostsStats {
  return buildAllPostsStats(getAllScoredPosts(), nowMs);
}
