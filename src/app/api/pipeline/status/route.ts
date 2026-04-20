// GET /api/pipeline/status
//
// Telemetry + freshness gate for the pipeline. Reports data-volume counts on
// top of the same committed JSON freshness signals /api/health enforces.

import { NextResponse } from "next/server";
import { pipeline, repoStore, scoreStore, snapshotStore } from "@/lib/pipeline/pipeline";
import { createGitHubAdapter } from "@/lib/pipeline/ingestion/ingest";
import { getDerivedMetaCounts } from "@/lib/derived-insights";
import {
  lastFetchedAt,
  deltasComputedAt,
  deltasCoveragePct,
} from "@/lib/trending";
import { hotCollectionsFetchedAt } from "@/lib/hot-collections";
import {
  collectionRankingsFetchedAt,
  getCollectionRankingsCoverage,
  type CollectionRankingsCoverage,
} from "@/lib/collection-rankings";
import { recentReposFetchedAt } from "@/lib/recent-repos";
import { getDerivedRepoCount, getDerivedRepos } from "@/lib/derived-repos";

const FAST_DATA_STALE_THRESHOLD_MS = 2 * 60 * 60 * 1000;
const RANKINGS_STALE_THRESHOLD_MS = 12 * 60 * 60 * 1000;

export interface PipelineStatusResponse {
  seeded: boolean;
  healthy: boolean;
  healthStatus: "ok" | "stale" | "empty";
  ageSeconds: number | null;
  repoCount: number;
  snapshotCount: number;
  scoreCount: number;
  lastFetchedAt: string | null;
  computedAt: string | null;
  hotCollectionsFetchedAt: string | null;
  recentReposFetchedAt: string | null;
  collectionRankingsFetchedAt: string | null;
  coveragePct: number;
  stale: {
    scraper: boolean;
    deltas: boolean;
    hotCollections: boolean;
    recentRepos: boolean;
    collectionRankings: boolean;
  };
  collectionCoverage: CollectionRankingsCoverage;
  rateLimitRemaining: number | null;
  stats: {
    totalRepos: number;
    totalStars: number;
    hotCount: number | null;
    breakoutCount: number | null;
    lastRefreshAt: string | null;
  };
}

function ageMs(iso: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Date.now() - t;
}

export async function GET(): Promise<NextResponse<PipelineStatusResponse | { error: string }>> {
  try {
    await pipeline.ensureReady();

    const repos = repoStore.getAll();
    const snapshotCount = snapshotStore.totalCount();

    let rateLimitRemaining: number | null = null;
    try {
      const adapter = createGitHubAdapter();
      const rl = await adapter.getRateLimit();
      rateLimitRemaining = rl?.remaining ?? null;
    } catch {
      rateLimitRemaining = null;
    }

    const scraperAge = ageMs(lastFetchedAt);
    const deltasAge = ageMs(deltasComputedAt);
    const hotCollectionsAge = ageMs(hotCollectionsFetchedAt);
    const recentReposAge = ageMs(recentReposFetchedAt);
    const collectionRankingsAge = ageMs(collectionRankingsFetchedAt);

    const scraperStale =
      scraperAge === null || scraperAge > FAST_DATA_STALE_THRESHOLD_MS;
    const deltasStale =
      deltasAge === null || deltasAge > FAST_DATA_STALE_THRESHOLD_MS;
    const hotCollectionsStale =
      hotCollectionsAge === null ||
      hotCollectionsAge > FAST_DATA_STALE_THRESHOLD_MS;
    const recentReposStale =
      recentReposAge === null || recentReposAge > FAST_DATA_STALE_THRESHOLD_MS;
    const collectionRankingsStale =
      collectionRankingsAge === null ||
      collectionRankingsAge > RANKINGS_STALE_THRESHOLD_MS;

    const isEmpty = !lastFetchedAt;
    const isStale =
      !isEmpty &&
      (
        scraperStale ||
        deltasStale ||
        hotCollectionsStale ||
        recentReposStale ||
        collectionRankingsStale
      );
    const healthStatus: "ok" | "stale" | "empty" = isEmpty
      ? "empty"
      : isStale
        ? "stale"
        : "ok";
    const healthy = healthStatus === "ok";
    const httpStatus = healthy ? 200 : 503;

    const ageCandidates = [
      scraperAge,
      deltasAge,
      hotCollectionsAge,
      recentReposAge,
      collectionRankingsAge,
    ].filter((age): age is number => age !== null);
    const worstAgeMs = ageCandidates.length > 0 ? Math.max(...ageCandidates) : null;

    const body: PipelineStatusResponse = {
      seeded: repos.length > 0,
      healthy,
      healthStatus,
      ageSeconds: worstAgeMs === null ? null : Math.floor(worstAgeMs / 1000),
      repoCount: repos.length,
      snapshotCount,
      scoreCount: scoreStore.getAll().length,
      lastFetchedAt: lastFetchedAt ?? null,
      computedAt: deltasComputedAt ?? null,
      hotCollectionsFetchedAt: hotCollectionsFetchedAt ?? null,
      recentReposFetchedAt,
      collectionRankingsFetchedAt,
      coveragePct: Math.round(deltasCoveragePct() * 10) / 10,
      stale: {
        scraper: scraperStale,
        deltas: deltasStale,
        hotCollections: hotCollectionsStale,
        recentRepos: recentReposStale,
        collectionRankings: collectionRankingsStale,
      },
      collectionCoverage: getCollectionRankingsCoverage(),
      rateLimitRemaining,
      stats: {
        totalRepos: getDerivedRepoCount(),
        totalStars: getDerivedRepos().reduce((sum, repo) => sum + repo.stars, 0),
        hotCount: getDerivedMetaCounts().hot,
        breakoutCount: getDerivedMetaCounts().breakouts,
        lastRefreshAt: lastFetchedAt ?? null,
      },
    };

    return NextResponse.json(body, { status: httpStatus });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
