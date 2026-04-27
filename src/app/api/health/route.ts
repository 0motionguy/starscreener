// GET /api/health
//
// Freshness-gated health endpoint for external uptime monitors. The hard
// gate stays on committed JSON timestamps, while per-source diagnostics now
// expose "degraded but still serving" states so empty-looking feeds are
// easier to diagnose before they become stale.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  getCollectionRankingsCoverage,
  getCollectionRankingsFetchedAt,
  refreshCollectionRankingsFromStore,
  type CollectionRankingsCoverage,
} from "@/lib/collection-rankings";
import {
  getHotCollectionsFetchedAt,
  refreshHotCollectionsFromStore,
} from "@/lib/hot-collections";
import {
  getRepoMetadataCount,
  getRepoMetadataCoveragePct,
  getRepoMetadataFailures,
  getRepoMetadataFetchedAt,
  getRepoMetadataSourceCount,
  refreshRepoMetadataFromStore,
} from "@/lib/repo-metadata";
import {
  getRecentReposFetchedAt,
  refreshRecentReposFromStore,
} from "@/lib/recent-repos";
import {
  DEVTO_STALE_THRESHOLD_MS,
  FAST_DATA_STALE_THRESHOLD_MS,
  NPM_STALE_THRESHOLD_MS,
  PRODUCTHUNT_STALE_THRESHOLD_MS,
  getDegradedScannerSources,
  getScannerSourceHealth,
  type ScannerSourceHealth,
} from "@/lib/source-health";
import { sourceHealthTracker } from "@/lib/source-health-tracker";
import {
  deltasCoveragePct,
  deltasCoverageQuality,
  getDeltasComputedAt,
  getLastFetchedAt,
  refreshTrendingFromStore,
  type DeltaCoverageQuality,
} from "@/lib/trending";

export const runtime = "nodejs";

const RANKINGS_STALE_THRESHOLD_MS = 12 * 60 * 60 * 1000;
const COVERAGE_WARN_PCT = 50;

type HealthStatus = "ok" | "stale" | "error";

interface HealthBody {
  status: HealthStatus;
  sourceStatus?: "ok" | "degraded";
  lastFetchedAt: string | null;
  computedAt: string | null;
  hotCollectionsFetchedAt: string | null;
  recentReposFetchedAt: string | null;
  repoMetadataFetchedAt: string | null;
  collectionRankingsFetchedAt: string | null;
  redditFetchedAt: string | null;
  redditCold: boolean;
  blueskyFetchedAt: string | null;
  blueskyCold: boolean;
  hnFetchedAt: string | null;
  hnCold: boolean;
  producthuntFetchedAt: string | null;
  producthuntCold: boolean;
  devtoFetchedAt: string | null;
  devtoCold: boolean;
  lobstersFetchedAt: string | null;
  lobstersCold: boolean;
  npmFetchedAt: string | null;
  npmCold: boolean;
  ageSeconds: {
    scraper: number | null;
    deltas: number | null;
    hotCollections: number | null;
    recentRepos: number | null;
    repoMetadata: number | null;
    collectionRankings: number | null;
    reddit: number | null;
    bluesky: number | null;
    hn: number | null;
    producthunt: number | null;
    devto: number | null;
    lobsters: number | null;
    npm: number | null;
  };
  thresholdSeconds: {
    fastData: number;
    collectionRankings: number;
    producthunt: number;
    devto: number;
    npm: number;
  };
  stale: {
    scraper: boolean;
    deltas: boolean;
    hotCollections: boolean;
    recentRepos: boolean;
    repoMetadata: boolean;
    collectionRankings: boolean;
    reddit: boolean;
    bluesky: boolean;
    hn: boolean;
    producthunt: boolean;
    devto: boolean;
    lobsters: boolean;
    npm: boolean;
  };
  coveragePct: number;
  coverageQuality: DeltaCoverageQuality;
  collectionCoverage: CollectionRankingsCoverage;
  repoMetadata: {
    count: number;
    sourceCount: number;
    coveragePct: number;
    failureCount: number;
  };
  degradedSources?: string[];
  sources?: ScannerSourceHealth[];
  circuitBreakers?: {
    open: string[];
    half_open: string[];
  };
  warning?: string;
  error?: string;
}

function getCircuitBreakerSummary(): {
  open: string[];
  half_open: string[];
} {
  const all = sourceHealthTracker.getAllHealth();
  const open: string[] = [];
  const halfOpen: string[] = [];
  for (const [id, snap] of Object.entries(all)) {
    if (snap.state === "OPEN") open.push(id);
    else if (snap.state === "HALF_OPEN") halfOpen.push(id);
  }
  open.sort();
  halfOpen.sort();
  return { open, half_open: halfOpen };
}

function ageMs(iso: string | null): number | null {
  if (!iso) return null;
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return null;
  return Date.now() - ts;
}

export async function GET(request: NextRequest): Promise<NextResponse<HealthBody>> {
  try {
    const soft = request.nextUrl.searchParams.get("soft") === "1";

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

    const sources = getScannerSourceHealth();
    const degradedSources = getDegradedScannerSources().map((source) => source.id);
    const sourceById = new Map<ScannerSourceHealth["id"], ScannerSourceHealth>(
      sources.map((source) => [source.id, source]),
    );
    const reddit = sourceById.get("reddit");
    const bluesky = sourceById.get("bluesky");
    const hn = sourceById.get("hackernews");
    const producthunt = sourceById.get("producthunt");
    const devto = sourceById.get("devto");
    const lobsters = sourceById.get("lobsters");
    const npm = sourceById.get("npm");

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
      collectionRankingsStale ||
      (reddit?.stale ?? false) ||
      (bluesky?.stale ?? false) ||
      (hn?.stale ?? false) ||
      (producthunt?.stale ?? false) ||
      (devto?.stale ?? false) ||
      (lobsters?.stale ?? false) ||
      (npm?.stale ?? false);

    const coverage = deltasCoveragePct();
    const coverageLow = coverage < COVERAGE_WARN_PCT;
    const quality = deltasCoverageQuality();
    const collectionCoverage = getCollectionRankingsCoverage();

    const body: HealthBody = {
      status: anyStale ? "stale" : "ok",
      sourceStatus: degradedSources.length > 0 ? "degraded" : "ok",
      lastFetchedAt: lastFetchedAt ?? null,
      computedAt: deltasComputedAt ?? null,
      hotCollectionsFetchedAt: hotCollectionsFetchedAt ?? null,
      recentReposFetchedAt,
      repoMetadataFetchedAt,
      collectionRankingsFetchedAt,
      redditFetchedAt: reddit?.fetchedAt ?? null,
      redditCold: reddit?.cold ?? true,
      blueskyFetchedAt: bluesky?.fetchedAt ?? null,
      blueskyCold: bluesky?.cold ?? true,
      hnFetchedAt: hn?.fetchedAt ?? null,
      hnCold: hn?.cold ?? true,
      producthuntFetchedAt: producthunt?.fetchedAt ?? null,
      producthuntCold: producthunt?.cold ?? true,
      devtoFetchedAt: devto?.fetchedAt ?? null,
      devtoCold: devto?.cold ?? true,
      lobstersFetchedAt: lobsters?.fetchedAt ?? null,
      lobstersCold: lobsters?.cold ?? true,
      npmFetchedAt: npm?.fetchedAt ?? null,
      npmCold: npm?.cold ?? true,
      ageSeconds: {
        scraper: scraperAge === null ? null : Math.floor(scraperAge / 1000),
        deltas: deltasAge === null ? null : Math.floor(deltasAge / 1000),
        hotCollections:
          hotCollectionsAge === null
            ? null
            : Math.floor(hotCollectionsAge / 1000),
        recentRepos:
          recentReposAge === null ? null : Math.floor(recentReposAge / 1000),
        repoMetadata:
          repoMetadataAge === null ? null : Math.floor(repoMetadataAge / 1000),
        collectionRankings:
          collectionRankingsAge === null
            ? null
            : Math.floor(collectionRankingsAge / 1000),
        reddit: reddit?.ageSeconds ?? null,
        bluesky: bluesky?.ageSeconds ?? null,
        hn: hn?.ageSeconds ?? null,
        producthunt: producthunt?.ageSeconds ?? null,
        devto: devto?.ageSeconds ?? null,
        lobsters: lobsters?.ageSeconds ?? null,
        npm: npm?.ageSeconds ?? null,
      },
      thresholdSeconds: {
        fastData: FAST_DATA_STALE_THRESHOLD_MS / 1000,
        collectionRankings: RANKINGS_STALE_THRESHOLD_MS / 1000,
        producthunt: PRODUCTHUNT_STALE_THRESHOLD_MS / 1000,
        devto: DEVTO_STALE_THRESHOLD_MS / 1000,
        npm: NPM_STALE_THRESHOLD_MS / 1000,
      },
      stale: {
        scraper: scraperStale,
        deltas: deltasStale,
        hotCollections: hotCollectionsStale,
        recentRepos: recentReposStale,
        repoMetadata: repoMetadataStale,
        collectionRankings: collectionRankingsStale,
        reddit: reddit?.stale ?? false,
        bluesky: bluesky?.stale ?? false,
        hn: hn?.stale ?? false,
        producthunt: producthunt?.stale ?? false,
        devto: devto?.stale ?? false,
        lobsters: lobsters?.stale ?? false,
        npm: npm?.stale ?? false,
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
      degradedSources,
      sources,
      circuitBreakers: getCircuitBreakerSummary(),
    };

    if (!anyStale && quality === "partial") {
      body.warning =
        "coverageQuality=partial - cold-start fallback in use; real 24h/7d/30d windows will populate as history matures";
    } else if (!anyStale && degradedSources.length > 0) {
      body.warning =
        `degraded sources: ${degradedSources.join(", ")} - freshness is live but one or more scanners are below expected quality`;
    } else if (!anyStale && coverageLow) {
      body.warning =
        `delta coverage ${body.coveragePct}% < ${COVERAGE_WARN_PCT}% - expected during 30-day cold-start window`;
    }

    return NextResponse.json(body, { status: anyStale && !soft ? 503 : 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        status: "error",
        sourceStatus: "degraded",
        lastFetchedAt: getLastFetchedAt() ?? null,
        computedAt: getDeltasComputedAt() ?? null,
        hotCollectionsFetchedAt: getHotCollectionsFetchedAt() ?? null,
        recentReposFetchedAt: getRecentReposFetchedAt(),
        repoMetadataFetchedAt: getRepoMetadataFetchedAt(),
        collectionRankingsFetchedAt: getCollectionRankingsFetchedAt(),
        redditFetchedAt: null,
        redditCold: true,
        blueskyFetchedAt: null,
        blueskyCold: true,
        hnFetchedAt: null,
        hnCold: true,
        producthuntFetchedAt: null,
        producthuntCold: true,
        devtoFetchedAt: null,
        devtoCold: true,
        lobstersFetchedAt: null,
        lobstersCold: true,
        npmFetchedAt: null,
        npmCold: true,
        ageSeconds: {
          scraper: null,
          deltas: null,
          hotCollections: null,
          recentRepos: null,
          repoMetadata: null,
          collectionRankings: null,
          reddit: null,
          bluesky: null,
          hn: null,
          producthunt: null,
          devto: null,
          lobsters: null,
          npm: null,
        },
        thresholdSeconds: {
          fastData: FAST_DATA_STALE_THRESHOLD_MS / 1000,
          collectionRankings: RANKINGS_STALE_THRESHOLD_MS / 1000,
          producthunt: PRODUCTHUNT_STALE_THRESHOLD_MS / 1000,
          devto: DEVTO_STALE_THRESHOLD_MS / 1000,
          npm: NPM_STALE_THRESHOLD_MS / 1000,
        },
        stale: {
          scraper: true,
          deltas: true,
          hotCollections: true,
          recentRepos: true,
          repoMetadata: true,
          collectionRankings: true,
          reddit: false,
          bluesky: false,
          hn: false,
          producthunt: false,
          devto: false,
          lobsters: false,
          npm: false,
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
        degradedSources: [],
        sources: [],
        circuitBreakers: getCircuitBreakerSummary(),
        error: message,
      },
      { status: 503 },
    );
  }
}
