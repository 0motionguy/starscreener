import hotCollectionsJson from "../../data/hot-collections.json";
import { loadAllCollections, type CollectionFile } from "./collections";
import { getDataStore } from "./data-store";

export interface HotCollectionRepo {
  repoId: number | null;
  repoName: string;
  currentRank: number | null;
  pastRank: number | null;
  rankChanges: number | null;
}

export interface HotCollection {
  id: number;
  slug: string | null;
  name: string;
  repos: number | null;
  topRepos: HotCollectionRepo[];
}

interface HotCollectionRow {
  id: number | null;
  name: string;
  repos: number | null;
  repoId: number | null;
  repoName: string;
  repoCurrentPeriodRank: number | null;
  repoPastPeriodRank: number | null;
  repoRankChanges: number | null;
}

interface HotCollectionsFile {
  fetchedAt: string;
  rows: HotCollectionRow[];
}

// Mutable in-memory cache. Seeded from the bundled JSON; replaced by Redis
// payloads via refreshHotCollectionsFromStore(). Sync getters below all read this.
let data: HotCollectionsFile = hotCollectionsJson as unknown as HotCollectionsFile;

export const hotCollectionsFetchedAt = data.fetchedAt;

export function getHotCollectionsFetchedAt(): string {
  return data.fetchedAt;
}

export function groupHotCollectionRows(
  rows: HotCollectionRow[],
  collections: CollectionFile[] = loadAllCollections(),
): HotCollection[] {
  const slugById = new Map(collections.map((collection) => [collection.id, collection.slug]));
  const groups = new Map<number, HotCollection>();
  const order: number[] = [];

  for (const row of rows) {
    if (row.id === null || !row.name) continue;
    let group = groups.get(row.id);
    if (!group) {
      group = {
        id: row.id,
        slug: slugById.get(row.id) ?? null,
        name: row.name,
        repos: row.repos,
        topRepos: [],
      };
      groups.set(row.id, group);
      order.push(row.id);
    }
    group.topRepos.push({
      repoId: row.repoId,
      repoName: row.repoName,
      currentRank: row.repoCurrentPeriodRank,
      pastRank: row.repoPastPeriodRank,
      rankChanges: row.repoRankChanges,
    });
  }

  return order.map((id) => groups.get(id)).filter((group): group is HotCollection => !!group);
}

export function getHotCollections(): HotCollection[] {
  return groupHotCollectionRows(data.rows);
}

export function getHotAiCollections(
  collections: CollectionFile[] = loadAllCollections(),
): HotCollection[] {
  const aiIds = new Set(collections.map((collection) => collection.id));
  return groupHotCollectionRows(data.rows, collections).filter((collection) =>
    aiIds.has(collection.id),
  );
}

// ---------------------------------------------------------------------------
// Refresh hook — pulls fresh hot-collections from the data-store.
// ---------------------------------------------------------------------------

interface RefreshResult {
  source: "redis" | "file" | "memory" | "missing";
  ageMs: number;
}

let inflight: Promise<RefreshResult> | null = null;
let lastRefreshMs = 0;
const MIN_REFRESH_INTERVAL_MS = 30_000;

/**
 * Pull the freshest hot-collections payload from the data-store and swap it
 * into the in-memory cache. Cheap to call multiple times — internal dedupe +
 * rate-limit ensure we hit Redis at most once per 30s per process.
 */
export async function refreshHotCollectionsFromStore(): Promise<RefreshResult> {
  if (inflight) return inflight;
  const sinceLast = Date.now() - lastRefreshMs;
  if (sinceLast < MIN_REFRESH_INTERVAL_MS && lastRefreshMs > 0) {
    return { source: "memory", ageMs: sinceLast };
  }

  inflight = (async (): Promise<RefreshResult> => {
    const result = await getDataStore().read<HotCollectionsFile>("hot-collections");
    if (result.data && result.source !== "missing") {
      data = result.data;
    }
    lastRefreshMs = Date.now();
    return { source: result.source, ageMs: result.ageMs };
  })().finally(() => {
    inflight = null;
  });

  return inflight;
}

/** Test/admin — reset the in-memory cache to the bundled seed. */
export function _resetHotCollectionsCacheForTests(): void {
  data = hotCollectionsJson as unknown as HotCollectionsFile;
  lastRefreshMs = 0;
  inflight = null;
}
