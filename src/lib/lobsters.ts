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
// data-store is loaded lazily (dynamic import) inside the async refresh
// helper. Static-importing it pulls the ioredis dependency into client
// bundles via /lib/lobsters → /components/repo-signals/RepoMentionBadges
// (a "use client" file), which crashes turbopack with a `dns` resolution
// error. The sync getters above this line don't need the store.

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

// Mutable in-memory cache — seeded from bundled JSON, replaced via
// refreshLobstersMentionsFromStore().
let mentionsFile: LobstersMentionsFile = lobstersMentionsData as unknown as LobstersMentionsFile;

export const lobstersFetchedAt: string = mentionsFile.fetchedAt ?? "";

// Cold = scraper has never committed a real snapshot. Missing metadata
// (empty fetchedAt or missing mentions) means no run has landed yet; the
// UI treats it as "warming up" rather than "stale." Mirrors the
// producthuntCold / blueskyCold / devtoCold contract.
export const lobstersCold: boolean =
  !mentionsFile.fetchedAt || !mentionsFile.mentions;

export function getLobstersFetchedAt(): string {
  return mentionsFile.fetchedAt ?? "";
}

export function isLobstersCold(): boolean {
  return !mentionsFile.fetchedAt || !mentionsFile.mentions;
}

function buildLobstersMentionsByLowerName(file: LobstersMentionsFile): Map<string, LobstersRepoMention> {
  const map = new Map<string, LobstersRepoMention>();
  for (const [fullName, mention] of Object.entries(file.mentions ?? {})) {
    map.set(fullName.toLowerCase(), mention);
  }
  return map;
}

let mentionsByLowerName: Map<string, LobstersRepoMention> =
  buildLobstersMentionsByLowerName(mentionsFile);

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

// ---------------------------------------------------------------------------
// Phase 4: refresh hook — pull latest lobsters-mentions payload from data-store.
// Rebuilds the case-insensitive lookup map after a swap.
// ---------------------------------------------------------------------------

let inflight: Promise<{ source: string; ageMs: number }> | null = null;
let lastRefreshMs = 0;
const MIN_REFRESH_INTERVAL_MS = 30_000;

export async function refreshLobstersMentionsFromStore(): Promise<{
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
    const { getDataStore } = await import("./data-store");
    const result = await getDataStore().read<LobstersMentionsFile>(
      "lobsters-mentions",
    );
    if (result.data && result.source !== "missing") {
      mentionsFile = result.data;
      mentionsByLowerName = buildLobstersMentionsByLowerName(mentionsFile);
    }
    lastRefreshMs = Date.now();
    return { source: result.source, ageMs: result.ageMs };
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}
