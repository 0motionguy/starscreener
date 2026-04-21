// Hacker News loader — mentions side.
//
// Reads data/hackernews-repo-mentions.json (per-repo mention buckets, last
// 7d) produced by scripts/scrape-hackernews.mjs.
//
// Trending-side getters (getHnTopStories, getHnTrendingFile) live in
// hackernews-trending.ts so client components on the homepage that only
// need per-repo mention badges don't pull the 316KB trending JSON into
// their bundle.
//
// Mirrors the API surface of src/lib/reddit.ts: case-insensitive repo
// lookup, canonical repo route helper.

import hnMentionsData from "../../data/hackernews-repo-mentions.json";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HnStory {
  id: number;
  title: string;
  url: string;
  by: string;
  score: number;
  descendants: number;
  createdUtc: number;
  ageHours?: number;
  velocity?: number;
  trendingScore?: number;
  everHitFrontPage: boolean;
  content_tags?: string[];
  value_score?: number;
  storyText?: string;
  linkedRepos?: { fullName: string; matchType: string; confidence: number }[];
}

export interface HnStoryRef {
  id: number;
  title: string;
  score: number;
  url: string;
  hoursSincePosted: number;
}

export interface HnRepoMention {
  count7d: number;
  scoreSum7d: number;
  topStory: HnStoryRef | null;
  everHitFrontPage: boolean;
  stories: HnStory[];
}

export interface HnLeaderboardEntry {
  fullName: string;
  count7d: number;
  scoreSum7d: number;
}

export interface HnMentionsFile {
  fetchedAt: string;
  windowDays: number;
  scannedAlgoliaHits: number;
  scannedFirebaseItems: number;
  mentions: Record<string, HnRepoMention>;
  leaderboard: HnLeaderboardEntry[];
}

export interface HnTrendingFile {
  fetchedAt: string;
  windowHours: number;
  scannedTotal: number;
  firebaseCount: number;
  algoliaCount: number;
  stories: HnStory[];
}

// ---------------------------------------------------------------------------
// Module-init: narrow JSON imports + build the case-insensitive lookup map
// ---------------------------------------------------------------------------

const mentionsFile = hnMentionsData as unknown as HnMentionsFile;

export const hnFetchedAt: string = mentionsFile.fetchedAt;

// "Cold" means the scraper has never committed a mentions file yet. A
// valid run with zero mentions is still fresh data (quiet dev-OSS day);
// we guard only on missing fetchedAt metadata so /api/health can
// distinguish "never scraped" from "stale committed snapshot." Mirrors
// producthuntCold / blueskyCold.
export const hnCold: boolean =
  !mentionsFile.fetchedAt || !mentionsFile.mentions;

const mentionsByLowerName: Map<string, HnRepoMention> = (() => {
  const map = new Map<string, HnRepoMention>();
  for (const [fullName, mention] of Object.entries(mentionsFile.mentions)) {
    map.set(fullName.toLowerCase(), mention);
  }
  return map;
})();

// ---------------------------------------------------------------------------
// Public API — mentions side
// ---------------------------------------------------------------------------

export function getHnFile(): HnMentionsFile {
  return mentionsFile;
}

export function getHnMentions(fullName: string): HnRepoMention | null {
  if (!fullName) return null;
  return mentionsByLowerName.get(fullName.toLowerCase()) ?? null;
}

export function getAllHnMentions(): Record<string, HnRepoMention> {
  return mentionsFile.mentions;
}

export function getHnLeaderboard(): HnLeaderboardEntry[] {
  // The on-disk file is already sorted by the scraper. Surface as-is.
  return mentionsFile.leaderboard;
}

export function hnItemHref(id: number): string {
  return `https://news.ycombinator.com/item?id=${id}`;
}

export function repoFullNameToHref(fullName: string): string {
  const [owner, name] = fullName.split("/", 2);
  if (!owner || !name) return "/repo";
  return `/repo/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
}
