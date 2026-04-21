// ProductHunt loader.
//
// Reads data/producthunt-launches.json (AI-adjacent launches last 7d)
// produced by scripts/scrape-producthunt.mjs. Mirrors the shape of
// src/lib/hackernews.ts: case-insensitive fullName lookup, cold flag so
// /api/health can distinguish "never scraped" from "stale".

import phData from "../../data/producthunt-launches.json";

export interface Launch {
  id: string;
  name: string;
  tagline: string;
  description: string;
  url: string;
  website: string | null;
  votesCount: number;
  commentsCount: number;
  createdAt: string;
  thumbnail: string | null;
  topics: string[];
  makers: { name: string; username: string }[];
  githubUrl: string | null;
  linkedRepo: string | null;
  daysSinceLaunch: number;
  /** Set by the scraper: true when the launch is AI-adjacent (topic or
   * keyword match). Drives the /producthunt?tab=ai view. All launches are
   * stored; the UI filters. */
  aiAdjacent?: boolean;
  /** Keyword tags derived server-side from GitHub topics + README snippet.
   * Examples: ['mcp','agent','llm','rag','claude-skill']. Empty when no
   * github repo could be resolved. */
  tags?: string[];
  /** GitHub enrichment payload — populated only when the scraper resolved
   * a github.com URL for this launch and successfully fetched the repo.
   * Lets the detail row show stars + topics + README snippet alongside
   * the PH vote count. */
  githubRepo?: {
    stars: number;
    topics: string[];
    readmeSnippet: string;
  };
}

export interface ProductHuntFile {
  lastFetchedAt: string;
  windowDays: number;
  launches: Launch[];
}

const file = phData as unknown as ProductHuntFile;

export const producthuntFetchedAt: string = file.lastFetchedAt;

// "Cold" means the scraper has NEVER run — no lastFetchedAt committed yet.
// A successful run that returns zero launches (off-day for AI launches)
// is still fresh data; we must not treat it as cold or /api/health will
// suppress stale-alert gating and we lose visibility when the scraper
// silently fails. Previously this also gated on `launches.length === 0`
// which conflated "no data ever" with "quiet day" — fixed here.
export const producthuntCold: boolean =
  !file.lastFetchedAt || !Array.isArray(file.launches);

// Pre-compute lookup: lowercased fullName -> best (highest-voted) launch.
// A single tracked repo could in theory have two launches in the 7d window
// (e.g. relaunch) — we always surface the one with more votes.
const launchesByRepo: Map<string, Launch> = (() => {
  const map = new Map<string, Launch>();
  if (!Array.isArray(file.launches)) return map;
  for (const l of file.launches) {
    if (!l.linkedRepo) continue;
    const key = l.linkedRepo.toLowerCase();
    const existing = map.get(key);
    if (!existing || l.votesCount > existing.votesCount) map.set(key, l);
  }
  return map;
})();

export function getPhFile(): ProductHuntFile {
  return file;
}

export function getRecentLaunches(days = 7, limit?: number): Launch[] {
  const filtered = (file.launches ?? []).filter(
    (l) => l.daysSinceLaunch <= days,
  );
  return typeof limit === "number" ? filtered.slice(0, limit) : filtered;
}

/**
 * AI-adjacent subset — launches whose topic/tagline/description matched
 * the scraper's keyword filter. Drives the /producthunt?tab=ai view and
 * the homepage Recent Launches section.
 *
 * Falls back to the full set for payloads predating the aiAdjacent flag.
 * That keeps the loader usable against older JSON during rollout.
 */
export function getAiLaunches(days = 7, limit?: number): Launch[] {
  const all = file.launches ?? [];
  const hasFlag = all.some((l) => l.aiAdjacent !== undefined);
  const filtered = all.filter((l) => {
    if (l.daysSinceLaunch > days) return false;
    if (hasFlag) return l.aiAdjacent === true;
    return true;
  });
  return typeof limit === "number" ? filtered.slice(0, limit) : filtered;
}

export function getLaunchForRepo(fullName: string): Launch | null {
  if (!fullName) return null;
  return launchesByRepo.get(fullName.toLowerCase()) ?? null;
}

export function getAllPhLaunches(): Launch[] {
  return file.launches ?? [];
}
