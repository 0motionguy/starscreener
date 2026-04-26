// Bluesky (AT Protocol) loader — mentions side.
//
// Reads data/bluesky-mentions.json (per-repo mention buckets, last 7d)
// produced by scripts/scrape-bluesky.mjs.
//
// Trending-side getters live in bluesky-trending.ts so client components
// that only need per-repo mention badges don't pull the larger trending
// JSON into their bundle. Same split as hackernews.ts / hackernews-trending.ts.
//
// API shape mirrors src/lib/hackernews.ts: case-insensitive repo lookup,
// canonical repo href helper, leaderboard surface.

import bskyMentionsData from "../../data/bluesky-mentions.json";
import { getDataStore } from "./data-store";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BskyAuthor {
  handle: string;
  displayName?: string;
}

export interface BskyLinkedRepo {
  fullName: string;
  matchType: string;
  confidence: number;
}

export interface BskyPost {
  uri: string;
  cid: string;
  bskyUrl: string;
  text: string;
  author: BskyAuthor;
  likeCount: number;
  repostCount: number;
  replyCount: number;
  createdAt: string;
  createdUtc: number;
  ageHours?: number;
  trendingScore?: number;
  matchedKeyword?: string;
  matchedQuery?: string;
  matchedTopicId?: string;
  matchedTopicLabel?: string;
  content_tags?: string[];
  value_score?: number;
  linkedRepos?: BskyLinkedRepo[];
}

export interface BskyPostRef {
  uri: string;
  cid: string;
  bskyUrl: string;
  text: string;
  author: BskyAuthor;
  likeCount: number;
  repostCount: number;
  replyCount: number;
  createdAt: string;
  hoursSincePosted: number;
}

export interface BskyRepoMention {
  count7d: number;
  likesSum7d: number;
  repostsSum7d: number;
  repliesSum7d: number;
  topPost: BskyPostRef | null;
  posts: BskyPost[];
}

export interface BskyLeaderboardEntry {
  fullName: string;
  count7d: number;
  likesSum7d: number;
}

export interface BskyMentionsFile {
  fetchedAt: string;
  windowDays: number;
  scannedPosts: number;
  searchQuery: string;
  pagesFetched: number;
  mentions: Record<string, BskyRepoMention>;
  leaderboard: BskyLeaderboardEntry[];
}

export interface BskyTrendingFile {
  fetchedAt: string;
  discoveryVersion?: string;
  keywords: string[];
  keywordCounts: Record<string, number>;
  queries?: string[];
  queryCounts?: Record<string, number>;
  queryFamilies?: Array<{
    id: string;
    label: string;
    queries: string[];
  }>;
  scannedPosts: number;
  posts: BskyPost[];
}

// ---------------------------------------------------------------------------
// Module-init: narrow JSON imports + build the case-insensitive lookup map
// ---------------------------------------------------------------------------

// Mutable in-memory cache — seeded from bundled JSON, replaced via
// refreshBlueskyMentionsFromStore().
let mentionsFile: BskyMentionsFile = bskyMentionsData as unknown as BskyMentionsFile;

// Exposed as `null` when the stub epoch-zero fetchedAt is still in place,
// so /api/health can distinguish "never scraped" from "fresh" without
// anyone grepping the ISO string.
const EPOCH_ZERO = "1970-01-01T00:00:00.000Z";
export const blueskyFetchedAt: string | null =
  mentionsFile.fetchedAt && mentionsFile.fetchedAt !== EPOCH_ZERO
    ? mentionsFile.fetchedAt
    : null;
export const blueskyCold: boolean = blueskyFetchedAt === null;

export function getBlueskyFetchedAt(): string | null {
  return mentionsFile.fetchedAt && mentionsFile.fetchedAt !== EPOCH_ZERO
    ? mentionsFile.fetchedAt
    : null;
}

export function isBlueskyCold(): boolean {
  return getBlueskyFetchedAt() === null;
}

function buildBskyMentionsByLowerName(file: BskyMentionsFile): Map<string, BskyRepoMention> {
  const map = new Map<string, BskyRepoMention>();
  for (const [fullName, mention] of Object.entries(file.mentions)) {
    map.set(fullName.toLowerCase(), mention);
  }
  return map;
}

let mentionsByLowerName: Map<string, BskyRepoMention> =
  buildBskyMentionsByLowerName(mentionsFile);

// ---------------------------------------------------------------------------
// Public API — mentions side
// ---------------------------------------------------------------------------

export function getBlueskyFile(): BskyMentionsFile {
  return mentionsFile;
}

export function getBlueskyMentions(fullName: string): BskyRepoMention | null {
  if (!fullName) return null;
  return mentionsByLowerName.get(fullName.toLowerCase()) ?? null;
}

export function getAllBlueskyMentions(): Record<string, BskyRepoMention> {
  return mentionsFile.mentions;
}

export function getBlueskyLeaderboard(): BskyLeaderboardEntry[] {
  return mentionsFile.leaderboard;
}

/**
 * Derive a bsky.app post URL from an at:// URI, falling back to the
 * handle-resolved URL the scraper pre-computed at write time.
 */
export function bskyPostHref(uri: string, handle?: string): string {
  const parts = String(uri ?? "").split("/");
  const rkey = parts[parts.length - 1] ?? "";
  const profile = (handle ?? "").trim() || "unknown";
  return `https://bsky.app/profile/${encodeURIComponent(profile)}/post/${encodeURIComponent(rkey)}`;
}

export function repoFullNameToHref(fullName: string): string {
  const [owner, name] = fullName.split("/", 2);
  if (!owner || !name) return "/repo";
  return `/repo/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
}

// ---------------------------------------------------------------------------
// Phase 4: refresh hook — pull latest bluesky-mentions payload from data-store.
// Rebuilds the case-insensitive lookup map after a swap.
// ---------------------------------------------------------------------------

let inflight: Promise<{ source: string; ageMs: number }> | null = null;
let lastRefreshMs = 0;
const MIN_REFRESH_INTERVAL_MS = 30_000;

export async function refreshBlueskyMentionsFromStore(): Promise<{
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
    const result = await getDataStore().read<BskyMentionsFile>(
      "bluesky-mentions",
    );
    if (result.data && result.source !== "missing") {
      mentionsFile = result.data;
      mentionsByLowerName = buildBskyMentionsByLowerName(mentionsFile);
    }
    lastRefreshMs = Date.now();
    return { source: result.source, ageMs: result.ageMs };
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}
