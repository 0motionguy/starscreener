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
}

export interface ProductHuntFile {
  lastFetchedAt: string;
  windowDays: number;
  launches: Launch[];
}

const file = phData as unknown as ProductHuntFile;

export const producthuntFetchedAt: string = file.lastFetchedAt;
export const producthuntCold: boolean =
  !file.lastFetchedAt || !Array.isArray(file.launches) || file.launches.length === 0;

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

export function getLaunchForRepo(fullName: string): Launch | null {
  if (!fullName) return null;
  return launchesByRepo.get(fullName.toLowerCase()) ?? null;
}

export function getAllPhLaunches(): Launch[] {
  return file.launches ?? [];
}
