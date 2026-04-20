// GET /api/health
//
// Freshness-gated health endpoint for external uptime monitors
// (UptimeRobot, BetterStack, etc.). Returns 503 when EITHER the OSS
// Insight scrape OR the git-history delta computation is stale.
//
// Phase 3: the snapshot pipeline's `lastRefreshAt` is no longer consulted
// — it's ephemeral on Vercel Lambdas and meaningless across invocations.
// Both freshness signals here ride committed JSON (data/trending.json and
// data/deltas.json) so every Lambda sees the same view.
//
// Distinct from /api/pipeline/status, which reports per-pipeline stats
// on top of the same freshness gate.

import { NextResponse } from "next/server";
import {
  lastFetchedAt,
  deltasComputedAt,
  deltasCoveragePct,
  deltasCoverageQuality,
  type DeltaCoverageQuality,
} from "@/lib/trending";
import { hotCollectionsFetchedAt } from "@/lib/hot-collections";
import {
  collectionRankingsFetchedAt,
  getCollectionRankingsCoverage,
  type CollectionRankingsCoverage,
} from "@/lib/collection-rankings";
import { recentReposFetchedAt } from "@/lib/recent-repos";
import {
  getRepoMetadataCoveragePct,
  getRepoMetadataCount,
  getRepoMetadataFailures,
  getRepoMetadataSourceCount,
  repoMetadataFetchedAt,
} from "@/lib/repo-metadata";

// 2 hours ≈ 2× hourly GHA cadence. Stale past this means at least one tick
// has missed; operator should be paged.
const FAST_DATA_STALE_THRESHOLD_MS = 2 * 60 * 60 * 1000;
const RANKINGS_STALE_THRESHOLD_MS = 12 * 60 * 60 * 1000;

// Below this percent of repos having ≥1 non-null delta, the endpoint emits
// a warning field. Expected during the first 30 days of accumulation.
const COVERAGE_WARN_PCT = 50;

type HealthStatus = "ok" | "stale" | "error";

interface HealthBody {
  status: HealthStatus;
  lastFetchedAt: string | null;
  computedAt: string | null;
  hotCollectionsFetchedAt: string | null;
  recentReposFetchedAt: string | null;
  repoMetadataFetchedAt: string | null;
  collectionRankingsFetchedAt: string | null;
  ageSeconds: {
    scraper: number | null;
    deltas: number | null;
    hotCollections: number | null;
    recentRepos: number | null;
    repoMetadata: number | null;
    collectionRankings: number | null;
  };
  thresholdSeconds: {
    fastData: number;
    collectionRankings: number;
  };
  stale: {
    scraper: boolean;
    deltas: boolean;
    hotCollections: boolean;
    recentRepos: boolean;
    repoMetadata: boolean;
    collectionRankings: boolean;
  };
  coveragePct: number;
  /** 'full' = real deltas, 'partial' = cold-start, 'cold' = no data yet. */
  coverageQuality: DeltaCoverageQuality;
  collectionCoverage: CollectionRankingsCoverage;
  repoMetadata: {
    count: number;
    sourceCount: number;
    coveragePct: number;
    failureCount: number;
  };
  warning?: string;
  error?: string;
}

function ageMs(iso: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Date.now() - t;
}

export async function GET(): Promise<NextResponse<HealthBody>> {
  try {
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
    const anyStale =
      scraperStale ||
      deltasStale ||
      hotCollectionsStale ||
      recentReposStale ||
      repoMetadataStale ||
      collectionRankingsStale;

    const coverage = deltasCoveragePct();
    const coverageLow = coverage < COVERAGE_WARN_PCT;
    const quality = deltasCoverageQuality();
    const collectionCoverage = getCollectionRankingsCoverage();

    const body: HealthBody = {
      status: anyStale ? "stale" : "ok",
      lastFetchedAt: lastFetchedAt ?? null,
      computedAt: deltasComputedAt ?? null,
      hotCollectionsFetchedAt: hotCollectionsFetchedAt ?? null,
      recentReposFetchedAt,
      repoMetadataFetchedAt,
      collectionRankingsFetchedAt,
      ageSeconds: {
        scraper: scraperAge === null ? null : Math.floor(scraperAge / 1000),
        deltas: deltasAge === null ? null : Math.floor(deltasAge / 1000),
        hotCollections:
          hotCollectionsAge === null ? null : Math.floor(hotCollectionsAge / 1000),
        recentRepos:
          recentReposAge === null ? null : Math.floor(recentReposAge / 1000),
        repoMetadata:
          repoMetadataAge === null ? null : Math.floor(repoMetadataAge / 1000),
        collectionRankings:
          collectionRankingsAge === null ? null : Math.floor(collectionRankingsAge / 1000),
      },
      thresholdSeconds: {
        fastData: FAST_DATA_STALE_THRESHOLD_MS / 1000,
        collectionRankings: RANKINGS_STALE_THRESHOLD_MS / 1000,
      },
      stale: {
        scraper: scraperStale,
        deltas: deltasStale,
        hotCollections: hotCollectionsStale,
        recentRepos: recentReposStale,
        repoMetadata: repoMetadataStale,
        collectionRankings: collectionRankingsStale,
      },
      coveragePct: Math.round(coverage * 10) / 10,
      coverageQuality: quality,
      collectionCoverage,
      repoMetadata: {
        count: getRepoMetadataCount(),
        sourceCount: getRepoMetadataSourceCount(),
        coveragePct: Math.round(getRepoMetadataCoveragePct() * 10) / 10,
        failureCount: getRepoMetadataFailures().length,
      },
    };

    if (!anyStale && quality === "partial") {
      body.warning = `coverageQuality=partial — cold-start fallback in use; real 24h/7d/30d windows will populate as history matures`;
    } else if (!anyStale && coverageLow) {
      body.warning = `delta coverage ${body.coveragePct}% < ${COVERAGE_WARN_PCT}% — expected during 30-day cold-start window`;
    }

    return NextResponse.json(body, { status: anyStale ? 503 : 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        status: "error",
        lastFetchedAt: lastFetchedAt ?? null,
        computedAt: deltasComputedAt ?? null,
        hotCollectionsFetchedAt: hotCollectionsFetchedAt ?? null,
        recentReposFetchedAt,
        repoMetadataFetchedAt,
        collectionRankingsFetchedAt,
        ageSeconds: {
          scraper: null,
          deltas: null,
          hotCollections: null,
          recentRepos: null,
          repoMetadata: null,
          collectionRankings: null,
        },
        thresholdSeconds: {
          fastData: FAST_DATA_STALE_THRESHOLD_MS / 1000,
          collectionRankings: RANKINGS_STALE_THRESHOLD_MS / 1000,
        },
        stale: {
          scraper: true,
          deltas: true,
          hotCollections: true,
          recentRepos: true,
          repoMetadata: true,
          collectionRankings: true,
        },
        coveragePct: 0,
        coverageQuality: "cold" as DeltaCoverageQuality,
        collectionCoverage: {
          totalCollections: 0,
          withStars: 0,
          withIssues: 0,
          withAnyRanking: 0,
        },
        repoMetadata: {
          count: 0,
          sourceCount: 0,
          coveragePct: 0,
          failureCount: 0,
        },
        error: message,
      },
      { status: 503 },
    );
  }
}
