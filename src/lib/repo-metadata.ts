import repoMetadataJson from "../../data/repo-metadata.json";
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

// Mutable in-memory cache. Seeded from the bundled JSON; merged with Redis
// payloads via refreshRepoMetadataFromStore(). Sync getters below all read this.
const bundledData = repoMetadataJson as unknown as RepoMetadataFile;
let data: RepoMetadataFile = bundledData;

// Backwards-compat: callers that imported `repoMetadataFetchedAt` as a constant
// keep working — value reflects whatever the cache held at THEIR import time.
// New callers should use getRepoMetadataFetchedAt() to see post-refresh values.
export const repoMetadataFetchedAt: string | null = data.fetchedAt ?? null;

export function getRepoMetadataFetchedAt(): string | null {
  return data.fetchedAt ?? null;
}

let _byFullName: Map<string, RepoMetadata> | null = null;
let _byGithubId: Map<number, RepoMetadata> | null = null;

function byFullName(): Map<string, RepoMetadata> {
  if (_byFullName) return _byFullName;
  _byFullName = new Map();
  for (const item of data.items ?? []) {
    if (!item.fullName) continue;
    _byFullName.set(item.fullName.toLowerCase(), item);
  }
  return _byFullName;
}

function byGithubId(): Map<number, RepoMetadata> {
  if (_byGithubId) return _byGithubId;
  _byGithubId = new Map();
  for (const item of data.items ?? []) {
    if (typeof item.githubId !== "number") continue;
    _byGithubId.set(item.githubId, item);
  }
  return _byGithubId;
}

function timestampMs(value: string | null | undefined): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function metadataTimestampMs(
  item: RepoMetadata,
  file: RepoMetadataFile,
): number {
  return Math.max(timestampMs(item.fetchedAt), timestampMs(file.fetchedAt));
}

function mergeRepoMetadataFiles(
  storeData: RepoMetadataFile,
): RepoMetadataFile {
  const byIdentity = new Map<
    string,
    { item: RepoMetadata; timestamp: number }
  >();

  const add = (file: RepoMetadataFile) => {
    for (const item of file.items ?? []) {
      const key =
        typeof item.githubId === "number"
          ? `github:${item.githubId}`
          : `fullName:${item.fullName.toLowerCase()}`;
      const timestamp = metadataTimestampMs(item, file);
      const existing = byIdentity.get(key);
      if (!existing || timestamp >= existing.timestamp) {
        byIdentity.set(key, { item, timestamp });
      }
    }
  };

  add(bundledData);
  add(storeData);

  return {
    ...storeData,
    fetchedAt:
      timestampMs(storeData.fetchedAt) >= timestampMs(bundledData.fetchedAt)
        ? storeData.fetchedAt
        : bundledData.fetchedAt,
    sourceCount: Math.max(
      storeData.sourceCount ?? 0,
      bundledData.sourceCount ?? 0,
    ),
    items: Array.from(byIdentity.values()).map(({ item }) => item),
    failures: [
      ...(bundledData.failures ?? []),
      ...(storeData.failures ?? []),
    ],
  };
}

export function getRepoMetadata(fullName: string): RepoMetadata | null {
  return byFullName().get(fullName.toLowerCase()) ?? null;
}

export function getRepoMetadataByGithubId(
  githubId: number | string | null | undefined,
): RepoMetadata | null {
  if (githubId === null || githubId === undefined) return null;
  const parsed =
    typeof githubId === "number" ? githubId : Number.parseInt(githubId, 10);
  if (!Number.isFinite(parsed)) return null;
  return byGithubId().get(parsed) ?? null;
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
    try {
      const { getDataStore } = await import("./data-store");
      const result = await getDataStore().read<RepoMetadataFile>("repo-metadata");
      if (result.data && result.source !== "missing") {
        data = mergeRepoMetadataFiles(result.data);
        _byFullName = null;
        _byGithubId = null;
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

/**
 * Test/admin — reset the in-memory cache to the bundled seed.
 */
export function _resetRepoMetadataCacheForTests(): void {
  data = bundledData;
  _byFullName = null;
  _byGithubId = null;
  lastRefreshMs = 0;
  inflight = null;
}
