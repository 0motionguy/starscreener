// dev.to loader — mentions side.
//
// Reads data/devto-mentions.json (per-repo article buckets, last 7d)
// produced by scripts/scrape-devto.mjs.
//
// Trending-side getters live in devto-trending.ts so client components
// that only need per-repo mention badges don't pull the larger trending
// JSON into their bundle. Same split as hackernews.ts ↔ hackernews-trending.ts.
//
// Mirrors the API surface of src/lib/hackernews.ts: case-insensitive
// repo lookup, leaderboard accessor, fetched-at exposure.

import devtoMentionsData from "../../data/devto-mentions.json";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DevtoArticleAuthor {
  username: string;
  name: string;
  profileImage: string;
}

export interface DevtoArticleLinkedRepo {
  fullName: string;
  location: "title" | "description" | "tag" | "body";
}

export interface DevtoArticle {
  id: number;
  title: string;
  description: string;
  url: string;
  author: DevtoArticleAuthor;
  reactionsCount: number;
  commentsCount: number;
  readingTime: number;
  publishedAt: string;
  tags: string[];
  trendingScore: number;
  linkedRepos: DevtoArticleLinkedRepo[];
}

export interface DevtoTopArticleRef {
  id: number;
  title: string;
  url: string;
  author: string;
  reactions: number;
  comments: number;
  hoursSincePosted: number | null;
  readingTime: number;
}

export interface DevtoRepoMention {
  count7d: number;
  reactionsSum7d: number;
  commentsSum7d: number;
  topArticle: DevtoTopArticleRef | null;
  articles: DevtoArticle[];
}

export interface DevtoLeaderboardEntry {
  fullName: string;
  count7d: number;
  reactionsSum7d: number;
}

export type DevtoBodyFetchMode = "full" | "partial" | "description-only";

export interface DevtoMentionsFile {
  fetchedAt: string;
  discoveryVersion?: string;
  windowDays: number;
  scannedArticles: number;
  bodyFetchMode: DevtoBodyFetchMode;
  priorityTags?: string[];
  discoverySlices?: Array<{
    id: string;
    label: string;
    tag?: string;
    top?: number;
    state?: "fresh" | "rising" | "all";
  }>;
  sliceCounts?: Record<string, number>;
  mentions: Record<string, DevtoRepoMention>;
  leaderboard: DevtoLeaderboardEntry[];
}

// ---------------------------------------------------------------------------
// Module-init
// ---------------------------------------------------------------------------

const mentionsFile = devtoMentionsData as unknown as DevtoMentionsFile;

export const devtoFetchedAt: string = mentionsFile.fetchedAt;
export const devtoBodyFetchMode: DevtoBodyFetchMode = mentionsFile.bodyFetchMode;

// "Cold" = scraper has never produced real data yet (epoch-zero stub
// committed at repo init or zero scanned articles). Health endpoint
// suppresses the freshness gate while cold; once a real run lands the
// daily-cron staleness threshold kicks in.
export const devtoCold: boolean =
  !mentionsFile.fetchedAt ||
  mentionsFile.fetchedAt.startsWith("1970-") ||
  mentionsFile.scannedArticles === 0;

const mentionsByLowerName: Map<string, DevtoRepoMention> = (() => {
  const map = new Map<string, DevtoRepoMention>();
  for (const [fullName, mention] of Object.entries(mentionsFile.mentions)) {
    map.set(fullName.toLowerCase(), mention);
  }
  return map;
})();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function getDevtoFile(): DevtoMentionsFile {
  return mentionsFile;
}

export function getDevtoMentions(fullName: string): DevtoRepoMention | null {
  if (!fullName) return null;
  return mentionsByLowerName.get(fullName.toLowerCase()) ?? null;
}

export function getAllDevtoMentions(): Record<string, DevtoRepoMention> {
  return mentionsFile.mentions;
}

export function getDevtoLeaderboard(): DevtoLeaderboardEntry[] {
  return mentionsFile.leaderboard;
}

export function devtoArticleHref(url: string): string {
  return url || "https://dev.to";
}

/**
 * Convenience adapter — builds the slim badge-shape rollup from the
 * full mention bucket so surfaces that don't have access to a derived
 * Repo (sidebar preview) can render the badge without re-doing the
 * shape transformation by hand.
 */
export function getDevtoBadgeRollup(fullName: string): {
  mentions7d: number;
  reactions7d: number;
  comments7d: number;
  topArticle?: {
    id: number;
    title: string;
    url: string;
    author: string;
    reactions: number;
    comments: number;
    readingTime: number;
  };
} | null {
  const m = getDevtoMentions(fullName);
  if (!m) return null;
  return {
    mentions7d: m.count7d,
    reactions7d: m.reactionsSum7d,
    comments7d: m.commentsSum7d,
    topArticle: m.topArticle
      ? {
          id: m.topArticle.id,
          title: m.topArticle.title,
          url: m.topArticle.url,
          author: m.topArticle.author,
          reactions: m.topArticle.reactions,
          comments: m.topArticle.comments,
          readingTime: m.topArticle.readingTime,
        }
      : undefined,
  };
}
