import { NextRequest, NextResponse } from "next/server";
import type { Repo } from "@/lib/types";
import { READ_CACHE_HEADERS } from "@/lib/api/cache";
import { loadCollection, loadAllCollections, indexReposByFullName, liveCountFor } from "@/lib/collections";
import { getDerivedRepos } from "@/lib/derived-repos";
import { getLastFetchedAt, refreshTrendingFromStore } from "@/lib/trending";
import {
  getHotAiCollections,
  getHotCollectionsFetchedAt,
  refreshHotCollectionsFromStore,
} from "@/lib/hot-collections";
import {
  getCollectionRankingBySlug,
  getCollectionRankingsFetchedAt,
  getCollectionRankingsPeriod,
  refreshCollectionRankingsFromStore,
  type CollectionRankingRow,
} from "@/lib/collection-rankings";

export const runtime = "nodejs";

function parseLimit(value: string | null): number {
  const parsed = Number.parseInt(value ?? "25", 10);
  if (!Number.isFinite(parsed)) return 25;
  return Math.min(Math.max(parsed, 1), 100);
}

function compactRepo(repo: Repo | null) {
  if (!repo) return null;
  return {
    id: repo.id,
    fullName: repo.fullName,
    language: repo.language,
    stars: repo.stars,
    starsDelta24h: repo.starsDelta24h,
    starsDelta7d: repo.starsDelta7d,
    starsDelta30d: repo.starsDelta30d,
    momentumScore: repo.momentumScore,
    movementStatus: repo.movementStatus,
    collectionNames: repo.collectionNames ?? [],
  };
}

function enrichRankingRows(
  rows: CollectionRankingRow[],
  curatedNames: Set<string>,
  liveIndex: Map<string, Repo>,
  limit: number,
) {
  return rows.slice(0, limit).map((row) => {
    const key = row.repoName.toLowerCase();
    const liveRepo = liveIndex.get(key) ?? null;
    return {
      ...row,
      inCuratedList: curatedNames.has(key),
      liveRepo: compactRepo(liveRepo),
    };
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const collection = loadCollection(slug);
  if (!collection) {
    return NextResponse.json(errorEnvelope("Collection not found"), { status: 404 });
  }

  // Refresh in-memory caches from the data-store before reading sync getters.
  await Promise.all([
    refreshTrendingFromStore(),
    refreshHotCollectionsFromStore(),
    refreshCollectionRankingsFromStore(),
  ]);

  const limit = parseLimit(request.nextUrl.searchParams.get("limit"));
  const collections = loadAllCollections();
  const liveRepos = getDerivedRepos();
  const liveIndex = indexReposByFullName(liveRepos);
  const curatedNames = new Set(collection.items.map((item) => item.toLowerCase()));
  const ranking = getCollectionRankingBySlug(slug, collections);
  const hotCollections = getHotAiCollections(collections);
  const hotIndex = hotCollections.findIndex((item) => item.slug === slug);
  const hotCollection = hotIndex >= 0 ? hotCollections[hotIndex] : null;

  const starsRows = ranking?.stars.rows ?? [];
  const issuesRows = ranking?.issues.rows ?? [];
  const starsOutsideCurated = starsRows
    .filter((row) => !curatedNames.has(row.repoName.toLowerCase()))
    .map((row) => row.repoName);
  const issuesOutsideCurated = issuesRows
    .filter((row) => !curatedNames.has(row.repoName.toLowerCase()))
    .map((row) => row.repoName);
  const curatedMissingFromTrending = collection.items.filter(
    (item) => !liveIndex.has(item.toLowerCase()),
  );

  return NextResponse.json(
    {
      collection: {
        id: collection.id,
        slug: collection.slug,
        name: collection.name,
        curatedRepoCount: collection.items.length,
        liveRepoCount: liveCountFor(collection, liveIndex),
      },
      sources: {
        trendingFetchedAt: getLastFetchedAt() ?? null,
        hotCollectionsFetchedAt: getHotCollectionsFetchedAt() ?? null,
        collectionRankingsFetchedAt: getCollectionRankingsFetchedAt(),
        rankingPeriod: getCollectionRankingsPeriod(),
      },
      coverage: {
        starsRankingCount: starsRows.length,
        issuesRankingCount: issuesRows.length,
        starsTrackedCount: starsRows.filter((row) => liveIndex.has(row.repoName.toLowerCase())).length,
        issuesTrackedCount: issuesRows.filter((row) => liveIndex.has(row.repoName.toLowerCase())).length,
        curatedMissingFromTrendingCount: curatedMissingFromTrending.length,
        upstreamStarsOutsideCuratedCount: starsOutsideCurated.length,
        upstreamIssuesOutsideCuratedCount: issuesOutsideCurated.length,
      },
      hotCollection: hotCollection
        ? {
            hotRank: hotIndex + 1,
            repos: hotCollection.repos,
            topRepos: hotCollection.topRepos.slice(0, limit),
          }
        : null,
      curatedMissingFromTrending,
      upstreamStarsOutsideCurated: starsOutsideCurated,
      upstreamIssuesOutsideCurated: issuesOutsideCurated,
      rankingByStars: {
        period: getCollectionRankingsPeriod(),
        rows: enrichRankingRows(starsRows, curatedNames, liveIndex, limit),
      },
      rankingByIssues: {
        period: getCollectionRankingsPeriod(),
        rows: enrichRankingRows(issuesRows, curatedNames, liveIndex, limit),
      },
    },
    { headers: READ_CACHE_HEADERS },
  );
}
