// GET /api/pipeline/status
//
// Telemetry + freshness gate for the pipeline. Reports data-volume counts on
// top of the same committed JSON freshness signals /api/health enforces.

import { NextResponse } from "next/server";
import { pipeline, repoStore, scoreStore, snapshotStore } from "@/lib/pipeline/pipeline";
import { createGitHubAdapter } from "@/lib/pipeline/ingestion/ingest";
import { getDerivedMetaCounts } from "@/lib/derived-insights";
import {
  deltasCoveragePct,
  getDeltasComputedAt,
  getLastFetchedAt,
  refreshTrendingFromStore,
} from "@/lib/trending";
import {
  getHotCollectionsFetchedAt,
  refreshHotCollectionsFromStore,
} from "@/lib/hot-collections";
import {
  getCollectionRankingsCoverage,
  getCollectionRankingsFetchedAt,
  refreshCollectionRankingsFromStore,
  type CollectionRankingsCoverage,
} from "@/lib/collection-rankings";
import {
  getRecentReposFetchedAt,
  refreshRecentReposFromStore,
} from "@/lib/recent-repos";
import {
  getRepoMetadataCount,
  getRepoMetadataCoveragePct,
  getRepoMetadataFailures,
  getRepoMetadataFetchedAt,
  getRepoMetadataSourceCount,
  refreshRepoMetadataFromStore,
} from "@/lib/repo-metadata";
import {
  FAST_DATA_STALE_THRESHOLD_MS,
  getDegradedScannerSources,
  getScannerSourceHealth,
  type ScannerSourceHealth,
} from "@/lib/source-health";
import { getDerivedRepoCount, getDerivedRepos } from "@/lib/derived-repos";

export const runtime = "nodejs";

const RANKINGS_STALE_THRESHOLD_MS = 12 * 60 * 60 * 1000;

export interface PipelineStatusResponse {
  seeded: boolean;
  healthy: boolean;
  healthStatus: "ok" | "stale" | "empty";
  sourceStatus?: "ok" | "degraded";
  ageSeconds: number | null;
  repoCount: number;
  snapshotCount: number;
  scoreCount: number;
  lastFetchedAt: string | null;
  computedAt: string | null;
  hotCollectionsFetchedAt: string | null;
  recentReposFetchedAt: string | null;
  repoMetadataFetchedAt: string | null;
  collectionRankingsFetchedAt: string | null;
  coveragePct: number;
  stale: {
    scraper: boolean;
    deltas: boolean;
    hotCollections: boolean;
    recentRepos: boolean;
    repoMetadata: boolean;
    collectionRankings: boolean;
  };
  collectionCoverage: CollectionRankingsCoverage;
  repoMetadata: {
    count: number;
    sourceCount: number;
    coveragePct: number;
    failureCount: number;
  };
  degradedSources?: string[];
  sources?: ScannerSourceHealth[];
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

    // Refresh in-memory caches from the data-store so per-source freshness
    // reflects the live Redis payload, not the bundled JSON snapshot. Each
    // refresh call internally rate-limits to 1 read per source per 30s.
    await Promise.all([
      refreshTrendingFromStore(),
      refreshHotCollectionsFromStore(),
      refreshRecentReposFromStore(),
      refreshRepoMetadataFromStore(),
      refreshCollectionRankingsFromStore(),
    ]);

    const lastFetchedAt = getLastFetchedAt();
    const deltasComputedAt = getDeltasComputedAt();
    const hotCollectionsFetchedAt = getHotCollectionsFetchedAt();
    const recentReposFetchedAt = getRecentReposFetchedAt();
    const repoMetadataFetchedAt = getRepoMetadataFetchedAt();
    const collectionRankingsFetchedAt = getCollectionRankingsFetchedAt();

    const repos = repoStore.getAll();
    const snapshotCount = snapshotStore.totalCount();
    const sources = getScannerSourceHealth();
    const degradedSources = getDegradedScannerSources().map((source) => source.id);
    const sourceStale = sources.some((source) => source.stale);

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
    const repoMetadataAge = ageMs(repoMetadataFetchedAt);
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
    const repoMetadataStale =
      repoMetadataAge === null ||
      repoMetadataAge > FAST_DATA_STALE_THRESHOLD_MS;
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
        repoMetadataStale ||
        collectionRankingsStale ||
        sourceStale
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
      repoMetadataAge,
      collectionRankingsAge,
    ].filter((age): age is number => age !== null);
    const worstAgeMs = ageCandidates.length > 0 ? Math.max(...ageCandidates) : null;

    const body: PipelineStatusResponse = {
      seeded: repos.length > 0,
      healthy,
      healthStatus,
      sourceStatus: degradedSources.length > 0 ? "degraded" : "ok",
      ageSeconds: worstAgeMs === null ? null : Math.floor(worstAgeMs / 1000),
      repoCount: repos.length,
      snapshotCount,
      scoreCount: scoreStore.getAll().length,
      lastFetchedAt: lastFetchedAt ?? null,
      computedAt: deltasComputedAt ?? null,
      hotCollectionsFetchedAt: hotCollectionsFetchedAt ?? null,
      recentReposFetchedAt,
      repoMetadataFetchedAt,
      collectionRankingsFetchedAt,
      coveragePct: Math.round(deltasCoveragePct() * 10) / 10,
      stale: {
        scraper: scraperStale,
        deltas: deltasStale,
        hotCollections: hotCollectionsStale,
        recentRepos: recentReposStale,
        repoMetadata: repoMetadataStale,
        collectionRankings: collectionRankingsStale,
      },
      collectionCoverage: getCollectionRankingsCoverage(),
      repoMetadata: {
        count: getRepoMetadataCount(),
        sourceCount: getRepoMetadataSourceCount(),
        coveragePct: Math.round(getRepoMetadataCoveragePct() * 10) / 10,
        failureCount: getRepoMetadataFailures().length,
      },
      degradedSources,
      sources,
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
    return NextResponse.json(errorEnvelope(message), { status: 500 });
  }
}
