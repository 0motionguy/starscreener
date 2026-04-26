import repoMetadataJson from "../../data/repo-metadata.json";
import { getDataStore } from "./data-store";

export interface RepoMetadata {
  githubId: number | null;
  fullName: string;
  name: string;
  owner: string;
  ownerAvatarUrl: string;
  description: string;
  url: string;
  homepageUrl?: string | null;
  language: string | null;
  topics: string[];
  stars: number;
  forks: number;
  openIssues: number;
  createdAt: string;
  updatedAt: string;
  pushedAt: string;
  defaultBranch: string | null;
  archived: boolean;
  disabled: boolean;
  fork: boolean;
  fetchedAt: string;
}

export interface RepoMetadataFailure {
  fullName: string;
  reason: string;
  error?: string;
}

interface RepoMetadataFile {
  fetchedAt: string | null;
  sourceCount?: number;
  items: RepoMetadata[];
  failures?: RepoMetadataFailure[];
}

// Mutable in-memory cache. Seeded from the bundled JSON; replaced by Redis
// payloads via refreshRepoMetadataFromStore(). Sync getters below all read this.
let data: RepoMetadataFile = repoMetadataJson as unknown as RepoMetadataFile;

// Backwards-compat: callers that imported `repoMetadataFetchedAt` as a constant
// keep working — value reflects whatever the cache held at THEIR import time.
// New callers should use getRepoMetadataFetchedAt() to see post-refresh values.
export const repoMetadataFetchedAt: string | null = data.fetchedAt ?? null;

export function getRepoMetadataFetchedAt(): string | null {
  return data.fetchedAt ?? null;
}

let _byFullName: Map<string, RepoMetadata> | null = null;

function byFullName(): Map<string, RepoMetadata> {
  if (_byFullName) return _byFullName;
  _byFullName = new Map();
  for (const item of data.items ?? []) {
    if (!item.fullName) continue;
    _byFullName.set(item.fullName.toLowerCase(), item);
  }
  return _byFullName;
}

export function getRepoMetadata(fullName: string): RepoMetadata | null {
  return byFullName().get(fullName.toLowerCase()) ?? null;
}

export function listRepoMetadata(): RepoMetadata[] {
  return data.items ?? [];
}

export function getRepoMetadataCount(): number {
  return data.items?.length ?? 0;
}

export function getRepoMetadataSourceCount(): number {
  return data.sourceCount ?? 0;
}

export function getRepoMetadataFailures(): RepoMetadataFailure[] {
  return Array.isArray(data.failures) ? data.failures : [];
}

export function getRepoMetadataCoveragePct(): number {
  const sourceCount = getRepoMetadataSourceCount();
  if (sourceCount <= 0) return 0;
  return (getRepoMetadataCount() * 100) / sourceCount;
}

// ---------------------------------------------------------------------------
// Refresh hook — pulls fresh repo-metadata from the data-store.
// ---------------------------------------------------------------------------

interface RefreshResult {
  source: "redis" | "file" | "memory" | "missing";
  ageMs: number;
}

let inflight: Promise<RefreshResult> | null = null;
let lastRefreshMs = 0;
const MIN_REFRESH_INTERVAL_MS = 30_000;

/**
 * Pull the freshest repo-metadata payload from the data-store and swap it
 * into the in-memory cache. Cheap to call multiple times — internal dedupe +
 * rate-limit ensure we hit Redis at most once per 30s per process.
 *
 * Safe to call from any server-component / route handler before reading any
 * sync getter. Never throws — on Redis miss the existing cache is preserved.
 */
export async function refreshRepoMetadataFromStore(): Promise<RefreshResult> {
  if (inflight) return inflight;
  const sinceLast = Date.now() - lastRefreshMs;
  if (sinceLast < MIN_REFRESH_INTERVAL_MS && lastRefreshMs > 0) {
    return { source: "memory", ageMs: sinceLast };
  }

  inflight = (async (): Promise<RefreshResult> => {
    const result = await getDataStore().read<RepoMetadataFile>("repo-metadata");
    if (result.data && result.source !== "missing") {
      data = result.data;
      _byFullName = null; // invalidate derived index
    }
    lastRefreshMs = Date.now();
    return { source: result.source, ageMs: result.ageMs };
  })().finally(() => {
    inflight = null;
  });

  return inflight;
}

/**
 * Test/admin — reset the in-memory cache to the bundled seed.
 */
export function _resetRepoMetadataCacheForTests(): void {
  data = repoMetadataJson as unknown as RepoMetadataFile;
  _byFullName = null;
  lastRefreshMs = 0;
  inflight = null;
}
