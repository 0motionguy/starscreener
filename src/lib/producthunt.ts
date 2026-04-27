// ProductHunt loader.
//
// Reads data/producthunt-launches.json (AI-adjacent launches last 7d)
// produced by scripts/scrape-producthunt.mjs. Mirrors the shape of
// src/lib/hackernews.ts: case-insensitive fullName lookup, cold flag so
// /api/health can distinguish "never scraped" from "stale".

import phData from "../../data/producthunt-launches.json";

// data-store import is dynamic: pulling it statically here drags ioredis
// (Node-only `dns` dep) into client bundles whenever a client component
// imports `getLaunchForRepo`. The refresh function below is server-only
// and resolves the dep at runtime.

export interface Launch {
  id: string;
  name: string;
  tagline: string;
  description: string;
  url: string;
  website: string | null;
  xUrl?: string | null;
  votesCount: number;
  commentsCount: number;
  createdAt: string;
  thumbnail: string | null;
  topics: string[];
  makers: {
    name: string;
    username: string;
    twitterUsername?: string | null;
    websiteUrl?: string | null;
  }[];
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

// Mutable in-memory cache — seeded from bundled JSON, replaced via
// refreshProducthuntLaunchesFromStore().
let file: ProductHuntFile = phData as unknown as ProductHuntFile;

export const producthuntFetchedAt: string = file.lastFetchedAt;

// "Cold" means the scraper has NEVER run — no lastFetchedAt committed yet.
// A successful run that returns zero launches (off-day for AI launches)
// is still fresh data; we must not treat it as cold or /api/health will
// suppress stale-alert gating and we lose visibility when the scraper
// silently fails. Previously this also gated on `launches.length === 0`
// which conflated "no data ever" with "quiet day" — fixed here.
export const producthuntCold: boolean =
  !file.lastFetchedAt || !Array.isArray(file.launches);

export function getProducthuntFetchedAt(): string {
  return file.lastFetchedAt;
}

export function isProducthuntCold(): boolean {
  return !file.lastFetchedAt || !Array.isArray(file.launches);
}

function buildLaunchesByRepo(input: ProductHuntFile): Map<string, Launch> {
  const map = new Map<string, Launch>();
  if (!Array.isArray(input.launches)) return map;
  for (const l of input.launches) {
    if (!l.linkedRepo) continue;
    const key = l.linkedRepo.toLowerCase();
    const existing = map.get(key);
    if (!existing || l.votesCount > existing.votesCount) map.set(key, l);
  }
  return map;
}

// Pre-compute lookup: lowercased fullName -> best (highest-voted) launch.
// A single tracked repo could in theory have two launches in the 7d window
// (e.g. relaunch) — we always surface the one with more votes.
let launchesByRepo: Map<string, Launch> = buildLaunchesByRepo(file);

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

// ---------------------------------------------------------------------------
// Phase 4: refresh hook — pull latest producthunt-launches payload from data-store.
// Rebuilds the case-insensitive launchesByRepo lookup after a swap.
// ---------------------------------------------------------------------------

let inflight: Promise<{ source: string; ageMs: number }> | null = null;
let lastRefreshMs = 0;
const MIN_REFRESH_INTERVAL_MS = 30_000;

export async function refreshProducthuntLaunchesFromStore(): Promise<{
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
    const result = await getDataStore().read<ProductHuntFile>(
      "producthunt-launches",
    );
    if (result.data && result.source !== "missing") {
      file = result.data;
      launchesByRepo = buildLaunchesByRepo(file);
    }
    lastRefreshMs = Date.now();
    return { source: result.source, ageMs: result.ageMs };
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}
