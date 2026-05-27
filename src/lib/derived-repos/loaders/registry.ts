// Persistent repo-registry loader (DATA-STORE backed: redis → memory).
//
// Reads the `repo-registry` slug (written by the worker's repo-registry
// fetcher), which accumulates every repo ever seen — including ones that have
// dropped out of the live `trending` feed. getDerivedRepos() folds these in as
// a supplemental source so the tracked count grows past 1000 and dropped repos
// are RETAINED with their last-known stats (the app overlays getRepoMetadata
// for fresh stars/description at assembly time). Mirrors the createPayloadReader
// pattern in src/lib/cross-source-mentions.ts.

import { createPayloadReader } from "../../data-store-reader";
import type { Repo } from "../../types";
import { slugToId } from "../../utils";

export interface RegistryEntry {
  fullName: string;
  repoId: string | null;
  language: string | null;
  description: string;
  stars: number;
  forks: number;
  totalScore: number | null;
  firstSeenAt: string;
  lastSeenAt: string;
  lastSource: string;
}

export interface RegistryPayload {
  version?: number;
  writtenAt?: string;
  count?: number;
  repos: Record<string, RegistryEntry>;
}

const EMPTY: RegistryPayload = { repos: {} };

const reader = createPayloadReader<RegistryPayload>({
  key: "repo-registry",
  emptyPayload: EMPTY,
  normalize: (raw) =>
    raw && typeof raw === "object" && !Array.isArray(raw) && typeof (raw as RegistryPayload).repos === "object"
      ? (raw as RegistryPayload)
      : EMPTY,
});

/** Hydrate the registry from the data-store (redis → memory). Cheap per-render. */
export const refreshRepoRegistryFromStore = reader.refresh;

/** All registry entries (every repo ever seen). Empty until first refresh. */
export function getRegistryRepos(): RegistryEntry[] {
  const repos = reader.getPayload().repos ?? {};
  return Object.values(repos);
}

/** Data-store writtenAt — feeds getDerivedRepos()'s cache key so a fresh
 *  registry write invalidates the assembled Repo[] without a redeploy. */
export function getRepoRegistryDataVersion(): string {
  return reader.getEntry()?.writtenAt ?? "";
}

/**
 * Build a base Repo from a registry entry — mirrors buildBaseRepoFromRecent.
 * Dropped repos have no current movement, so deltas are zero/missing; stars +
 * metadata are overlaid by getDerivedRepos() via getRepoMetadata at assembly.
 */
export function buildBaseRepoFromRegistry(entry: RegistryEntry): Repo {
  const slash = entry.fullName.indexOf("/");
  const owner = slash > 0 ? entry.fullName.slice(0, slash) : "";
  const name = slash > 0 ? entry.fullName.slice(slash + 1) : entry.fullName;
  return {
    id: slugToId(entry.fullName),
    fullName: entry.fullName,
    name,
    owner,
    ownerAvatarUrl: "",
    description: entry.description ?? "",
    url: `https://github.com/${entry.fullName}`,
    language: entry.language,
    topics: [],
    categoryId: "other",
    stars: entry.stars ?? 0,
    forks: entry.forks ?? 0,
    contributors: 0,
    openIssues: 0,
    lastCommitAt: entry.lastSeenAt,
    lastReleaseAt: null,
    lastReleaseTag: null,
    createdAt: entry.firstSeenAt,
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

/** Test-only — clear the in-memory cache. */
export const __resetRepoRegistryForTests = reader.reset;
