// Lobsters loader — mentions side.
//
// Reads data/lobsters-mentions.json (per-repo mention buckets, last 7d)
// produced by scripts/scrape-lobsters.mjs. Mirrors the HN / Reddit /
// Bluesky / dev.to loader contract so the terminal row + cross-signal
// fusion can treat Lobsters as a drop-in 6th channel without special
// cases.
//
// IMPORTANT: Lobsters has no official API. We treat the feed as
// best-effort — if a scrape fails the cold-seed kicks in, `lobstersCold`
// flips true, badges render null, and the homepage keeps serving.

import lobstersMentionsData from "../../data/lobsters-mentions.json";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LobstersStoryRef {
  shortId: string;
  title: string;
  score: number;
  url: string;
  commentsUrl: string;
  hoursSincePosted: number;
}

export interface LobstersStory {
  shortId: string;
  title: string;
  url: string;
  commentsUrl: string;
  by: string;
  score: number;
  commentCount: number;
  createdUtc: number;
  ageHours?: number;
  trendingScore?: number;
  tags?: string[];
  description?: string;
  linkedRepos?: {
    fullName: string;
    matchType: string;
    confidence: number;
  }[];
}

export interface LobstersRepoMention {
  count7d: number;
  scoreSum7d: number;
  topStory: LobstersStoryRef | null;
  stories: LobstersStory[];
}

export interface LobstersLeaderboardEntry {
  fullName: string;
  count7d: number;
  scoreSum7d: number;
}

export interface LobstersMentionsFile {
  fetchedAt: string;
  windowDays: number;
  scannedStories: number;
  mentions: Record<string, LobstersRepoMention>;
  leaderboard: LobstersLeaderboardEntry[];
}

// ---------------------------------------------------------------------------
// Module-init — narrow JSON import + build case-insensitive lookup
// ---------------------------------------------------------------------------

const mentionsFile = lobstersMentionsData as unknown as LobstersMentionsFile;

export const lobstersFetchedAt: string = mentionsFile.fetchedAt ?? "";

// Cold = scraper has never committed a real snapshot. Missing metadata
// (empty fetchedAt or missing mentions) means no run has landed yet; the
// UI treats it as "warming up" rather than "stale." Mirrors the
// producthuntCold / blueskyCold / devtoCold contract.
export const lobstersCold: boolean =
  !mentionsFile.fetchedAt || !mentionsFile.mentions;

const mentionsByLowerName: Map<string, LobstersRepoMention> = (() => {
  const map = new Map<string, LobstersRepoMention>();
  for (const [fullName, mention] of Object.entries(
    mentionsFile.mentions ?? {},
  )) {
    map.set(fullName.toLowerCase(), mention);
  }
  return map;
})();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function getLobstersFile(): LobstersMentionsFile {
  return mentionsFile;
}

export function getLobstersMentions(
  fullName: string,
): LobstersRepoMention | null {
  if (!fullName) return null;
  return mentionsByLowerName.get(fullName.toLowerCase()) ?? null;
}

export function getAllLobstersMentions(): Record<string, LobstersRepoMention> {
  return mentionsFile.mentions ?? {};
}

export function getLobstersLeaderboard(): LobstersLeaderboardEntry[] {
  return mentionsFile.leaderboard ?? [];
}

/** Build a link to a Lobsters story given its short id. */
export function lobstersStoryHref(shortId: string): string {
  return `https://lobste.rs/s/${shortId}`;
}

export function repoFullNameToHref(fullName: string): string {
  const [owner, name] = fullName.split("/", 2);
  if (!owner || !name) return "/repo";
  return `/repo/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
}
