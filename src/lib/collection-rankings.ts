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

const data = collectionRankingsJson as unknown as CollectionRankingsFile;

export const collectionRankingsFetchedAt = data.fetchedAt || null;
export const collectionRankingsPeriod = data.period;

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
