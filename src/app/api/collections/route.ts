import { NextResponse } from "next/server";
import { READ_CACHE_HEADERS } from "@/lib/api/cache";
import { loadAllCollections, indexReposByFullName, liveCountFor } from "@/lib/collections";
import { getDerivedRepos } from "@/lib/derived-repos";
import { getLastFetchedAt, refreshTrendingFromStore } from "@/lib/trending";
import {
  getHotAiCollections,
  getHotCollectionsFetchedAt,
  refreshHotCollectionsFromStore,
} from "@/lib/hot-collections";
import {
  getCollectionRankings,
  getCollectionRankingsCoverage,
  getCollectionRankingsFetchedAt,
  getCollectionRankingsPeriod,
  refreshCollectionRankingsFromStore,
} from "@/lib/collection-rankings";

export async function GET() {
  // Refresh in-memory caches from the data-store before reading sync getters.
  await Promise.all([
    refreshTrendingFromStore(),
    refreshHotCollectionsFromStore(),
    refreshCollectionRankingsFromStore(),
  ]);

  const collections = loadAllCollections();
  const liveIndex = indexReposByFullName(getDerivedRepos());
  const hotCollections = getHotAiCollections(collections);
  const collectionRankings = getCollectionRankings();

  const hotBySlug = new Map(
    hotCollections.map((collection, index) => [
      collection.slug,
      {
        hotRank: index + 1,
        topRepo: collection.topRepos[0]?.repoName ?? null,
        repos: collection.repos,
      },
    ]),
  );
  const rankingsBySlug = new Map(collectionRankings.map((collection) => [collection.slug, collection]));

  const rows = collections
    .map((collection) => {
      const hot = hotBySlug.get(collection.slug) ?? null;
      const ranking = rankingsBySlug.get(collection.slug) ?? null;
      return {
        id: collection.id,
        slug: collection.slug,
        name: collection.name,
        curatedRepoCount: collection.items.length,
        liveRepoCount: liveCountFor(collection, liveIndex),
        hotRank: hot?.hotRank ?? null,
        hotRepoCount: hot?.repos ?? null,
        hotTopRepo: hot?.topRepo ?? null,
        starsRankingCount: ranking?.stars.rows.length ?? 0,
        issuesRankingCount: ranking?.issues.rows.length ?? 0,
        topStarsRepo: ranking?.stars.rows[0]?.repoName ?? null,
        topIssuesRepo: ranking?.issues.rows[0]?.repoName ?? null,
      };
    })
    .sort((a, b) => {
      const aRank = a.hotRank ?? Number.MAX_SAFE_INTEGER;
      const bRank = b.hotRank ?? Number.MAX_SAFE_INTEGER;
      if (aRank !== bRank) return aRank - bRank;
      return a.name.localeCompare(b.name);
    });

  return NextResponse.json(
    {
      meta: {
        collectionsCount: rows.length,
        trendingFetchedAt: getLastFetchedAt() ?? null,
        hotCollectionsFetchedAt: getHotCollectionsFetchedAt() ?? null,
        collectionRankingsFetchedAt: getCollectionRankingsFetchedAt(),
        rankingPeriod: getCollectionRankingsPeriod(),
      },
      coverage: getCollectionRankingsCoverage(collectionRankings),
      collections: rows,
    },
    { headers: READ_CACHE_HEADERS },
  );
}
