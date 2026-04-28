import collectionRankingsJson from "../../data/collection-rankings.json";
import { loadAllCollections, type CollectionFile } from "./collections";
export type CollectionRankingMetric = "stars" | "issues";

export interface CollectionRankingRow {
  repoId: number | null;
  repoName: string;
  currentPeriodGrowth: number | null;
  pastPeriodGrowth: number | null;
  growthPop: number | null;
  rankPop: number | null;
  total: number | null;
  currentPeriodRank: number | null;
  pastPeriodRank: number | null;
}

export interface CollectionRankingMetricRows {
  rows: CollectionRankingRow[];
}

export interface CollectionRankingEntry {
  id: number;
  slug: string;
  name: string;
  period: string;
  stars: CollectionRankingMetricRows;
  issues: CollectionRankingMetricRows;
}

export interface CollectionRankingsCoverage {
  totalCollections: number;
  withStars: number;
  withIssues: number;
  withAnyRanking: number;
}

export interface CollectionRankingsFile {
  fetchedAt: string;
  period: string;
  collections: Record<
    string,
    {
      stars?: CollectionRankingRow[];
      issues?: CollectionRankingRow[];
    }
  >;
}

// Mutable in-memory cache. Seeded from the bundled JSON; replaced by Redis
// payloads via refreshCollectionRankingsFromStore(). Sync getters read this.
let data: CollectionRankingsFile = collectionRankingsJson as unknown as CollectionRankingsFile;

export const collectionRankingsFetchedAt = data.fetchedAt || null;
export const collectionRankingsPeriod = data.period;

export function getCollectionRankingsFetchedAt(): string | null {
  return data.fetchedAt || null;
}

export function getCollectionRankingsPeriod(): string {
  return data.period;
}

function sortRankingRows(rows: CollectionRankingRow[]): CollectionRankingRow[] {
  return [...rows].sort((a, b) => {
    const aRank = a.currentPeriodRank ?? Number.MAX_SAFE_INTEGER;
    const bRank = b.currentPeriodRank ?? Number.MAX_SAFE_INTEGER;
    if (aRank !== bRank) return aRank - bRank;
    return a.repoName.localeCompare(b.repoName);
  });
}

export function buildCollectionRankingEntries(
  file: CollectionRankingsFile,
  collections: CollectionFile[] = loadAllCollections(),
): CollectionRankingEntry[] {
  const collectionById = new Map(collections.map((collection) => [String(collection.id), collection]));
  const entries: CollectionRankingEntry[] = [];

  for (const [id, ranking] of Object.entries(file.collections ?? {})) {
    const collection = collectionById.get(id);
    if (!collection) continue;
    entries.push({
      id: collection.id,
      slug: collection.slug,
      name: collection.name,
      period: file.period,
      stars: { rows: sortRankingRows(ranking.stars ?? []) },
      issues: { rows: sortRankingRows(ranking.issues ?? []) },
    });
  }

  entries.sort((a, b) => a.name.localeCompare(b.name));
  return entries;
}

export function getCollectionRankings(): CollectionRankingEntry[] {
  return buildCollectionRankingEntries(data);
}

export function getCollectionRankingBySlug(
  slug: string,
  collections: CollectionFile[] = loadAllCollections(),
): CollectionRankingEntry | null {
  return buildCollectionRankingEntries(data, collections).find((entry) => entry.slug === slug) ?? null;
}

export function getCollectionRankingsCoverage(
  entries: CollectionRankingEntry[] = getCollectionRankings(),
): CollectionRankingsCoverage {
  let withStars = 0;
  let withIssues = 0;
  let withAnyRanking = 0;

  for (const entry of entries) {
    const hasStars = entry.stars.rows.length > 0;
    const hasIssues = entry.issues.rows.length > 0;
    if (hasStars) withStars += 1;
    if (hasIssues) withIssues += 1;
    if (hasStars || hasIssues) withAnyRanking += 1;
  }

  return {
    totalCollections: entries.length,
    withStars,
    withIssues,
    withAnyRanking,
  };
}

// ---------------------------------------------------------------------------
// Refresh hook — pulls fresh collection-rankings from the data-store.
// ---------------------------------------------------------------------------

interface RefreshResult {
  source: "redis" | "file" | "memory" | "missing";
  ageMs: number;
}

let inflight: Promise<RefreshResult> | null = null;
let lastRefreshMs = 0;
const MIN_REFRESH_INTERVAL_MS = 30_000;

/**
 * Pull the freshest collection-rankings payload from the data-store and swap
 * it into the in-memory cache. Cheap to call multiple times — internal dedupe
 * + rate-limit ensure we hit Redis at most once per 30s per process.
 */
export async function refreshCollectionRankingsFromStore(): Promise<RefreshResult> {
  if (inflight) return inflight;
  const sinceLast = Date.now() - lastRefreshMs;
  if (sinceLast < MIN_REFRESH_INTERVAL_MS && lastRefreshMs > 0) {
    return { source: "memory", ageMs: sinceLast };
  }

  inflight = (async (): Promise<RefreshResult> => {
    const { getDataStore } = await import("./data-store");
    const result = await getDataStore().read<CollectionRankingsFile>(
      "collection-rankings",
    );
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
export function _resetCollectionRankingsCacheForTests(): void {
  data = collectionRankingsJson as unknown as CollectionRankingsFile;
  lastRefreshMs = 0;
  inflight = null;
}
