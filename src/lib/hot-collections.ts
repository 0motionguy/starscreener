import hotCollectionsJson from "../../data/hot-collections.json";
import { loadAllCollections, type CollectionFile } from "./collections";

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

const data = hotCollectionsJson as unknown as HotCollectionsFile;

export const hotCollectionsFetchedAt = data.fetchedAt;

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
