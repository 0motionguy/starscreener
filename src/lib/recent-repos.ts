import recentReposJson from "../../data/recent-repos.json";
import type { Repo } from "./types";
import { slugToId } from "./utils";
export interface RecentRepoRow {
  githubId: number;
  fullName: string;
  name: string;
  owner: string;
  ownerAvatarUrl: string;
  description: string;
  url: string;
  language: string | null;
  topics: string[];
  stars: number;
  forks: number;
  openIssues: number;
  createdAt: string;
  updatedAt: string;
  pushedAt: string;
}

interface RecentReposFile {
  fetchedAt: string | null;
  items: RecentRepoRow[];
}

// Mutable in-memory cache. Seeded from the bundled JSON; replaced by Redis
// payloads via refreshRecentReposFromStore(). Sync getters below all read this.
let data: RecentReposFile = recentReposJson as unknown as RecentReposFile;

// Backwards-compat: existing callers keep their import. New callers should
// use getRecentReposFetchedAt() to see post-refresh values.
export const recentReposFetchedAt = data.fetchedAt ?? null;

export function getRecentReposFetchedAt(): string | null {
  return data.fetchedAt ?? null;
}

export function getRecentRepos(): RecentRepoRow[] {
  return Array.isArray(data.items) ? data.items : [];
}

export function buildBaseRepoFromRecent(row: RecentRepoRow): Repo {
  return {
    id: slugToId(row.fullName),
    fullName: row.fullName,
    name: row.name,
    owner: row.owner,
    ownerAvatarUrl: row.ownerAvatarUrl,
    description: row.description ?? "",
    url: row.url,
    language: row.language,
    topics: row.topics ?? [],
    categoryId: "other",
    stars: row.stars,
    forks: row.forks,
    contributors: 0,
    openIssues: row.openIssues,
    lastCommitAt: row.pushedAt || row.updatedAt || row.createdAt,
    lastReleaseAt: null,
    lastReleaseTag: null,
    createdAt: row.createdAt,
    starsDelta24h: 0,
    starsDelta7d: 0,
    starsDelta30d: 0,
    hasMovementData: false,
    starsDelta24hMissing: true,
    starsDelta7dMissing: true,
    starsDelta30dMissing: true,
    forksDelta7dMissing: true,
    contributorsDelta30dMissing: true,
    trendScore24h: 0,
    trendScore7d: 0,
    trendScore30d: 0,
    forksDelta7d: 0,
    contributorsDelta30d: 0,
    momentumScore: 0,
    movementStatus: "stable",
    rank: 0,
    categoryRank: 0,
    sparklineData: [],
    socialBuzzScore: 0,
    mentionCount24h: 0,
    tags: [],
  };
}

// ---------------------------------------------------------------------------
// Refresh hook — pulls fresh recent-repos from the data-store.
// ---------------------------------------------------------------------------

interface RefreshResult {
  source: "redis" | "file" | "memory" | "missing";
  ageMs: number;
}

let inflight: Promise<RefreshResult> | null = null;
let lastRefreshMs = 0;
const MIN_REFRESH_INTERVAL_MS = 30_000;

/**
 * Pull the freshest recent-repos payload from the data-store and swap it
 * into the in-memory cache. Cheap to call multiple times — internal dedupe +
 * rate-limit ensure we hit Redis at most once per 30s per process.
 */
export async function refreshRecentReposFromStore(): Promise<RefreshResult> {
  if (inflight) return inflight;
  const sinceLast = Date.now() - lastRefreshMs;
  if (sinceLast < MIN_REFRESH_INTERVAL_MS && lastRefreshMs > 0) {
    return { source: "memory", ageMs: sinceLast };
  }

  inflight = (async (): Promise<RefreshResult> => {
    try {
      const { getDataStore } = await import("./data-store");
      const result = await getDataStore().read<RecentReposFile>("recent-repos");
      if (result.data && result.source !== "missing") {
        data = result.data;
      }
      lastRefreshMs = Date.now();
      return { source: result.source, ageMs: result.ageMs };
    } catch {
      lastRefreshMs = Date.now();
      return { source: "missing", ageMs: 0 };
    }
  })().finally(() => {
    inflight = null;
  });

  return inflight;
}

/** Test/admin — reset the in-memory cache to the bundled seed. */
export function _resetRecentReposCacheForTests(): void {
  data = recentReposJson as unknown as RecentReposFile;
  lastRefreshMs = 0;
  inflight = null;
}

