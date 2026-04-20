// GET /api/pipeline/status
//
// Telemetry + freshness gate for the pipeline. Reports data-volume counts on
// top of the same committed JSON freshness signals /api/health enforces.

import { NextResponse } from "next/server";
import { pipeline, repoStore, scoreStore, snapshotStore } from "@/lib/pipeline/pipeline";
import { createGitHubAdapter } from "@/lib/pipeline/ingestion/ingest";
import {
  lastFetchedAt,
  deltasComputedAt,
  deltasCoveragePct,
  getTrackedRepoCount,
  getTotalStars,
} from "@/lib/trending";
import { hotCollectionsFetchedAt } from "@/lib/hot-collections";
import {
  collectionRankingsFetchedAt,
  getCollectionRankingsCoverage,
  type CollectionRankingsCoverage,
} from "@/lib/collection-rankings";

// Must stay in lockstep with src/app/api/health/route.ts STALE_THRESHOLD_MS.
const STALE_THRESHOLD_MS = 2 * 60 * 60 * 1000;

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
  collectionRankingsFetchedAt: string | null;
  coveragePct: number;
  stale: {
    scraper: boolean;
    deltas: boolean;
    hotCollections: boolean;
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
    const collectionRankingsAge = ageMs(collectionRankingsFetchedAt);

    const scraperStale = scraperAge === null || scraperAge > STALE_THRESHOLD_MS;
    const deltasStale = deltasAge === null || deltasAge > STALE_THRESHOLD_MS;
    const hotCollectionsStale =
      hotCollectionsAge === null || hotCollectionsAge > STALE_THRESHOLD_MS;
    const collectionRankingsStale =
      collectionRankingsAge === null || collectionRankingsAge > STALE_THRESHOLD_MS;

    const isEmpty = !lastFetchedAt;
    const isStale =
      !isEmpty &&
      (scraperStale || deltasStale || hotCollectionsStale || collectionRankingsStale);
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
      collectionRankingsFetchedAt,
      coveragePct: Math.round(deltasCoveragePct() * 10) / 10,
      stale: {
        scraper: scraperStale,
        deltas: deltasStale,
        hotCollections: hotCollectionsStale,
        collectionRankings: collectionRankingsStale,
      },
      collectionCoverage: getCollectionRankingsCoverage(),
      rateLimitRemaining,
      stats: {
        totalRepos: getTrackedRepoCount(),
        totalStars: getTotalStars(),
        hotCount: null,
        breakoutCount: null,
        lastRefreshAt: lastFetchedAt ?? null,
      },
    };

    return NextResponse.json(body, { status: httpStatus });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
