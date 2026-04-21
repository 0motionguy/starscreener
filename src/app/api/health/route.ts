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
import { redditFetchedAt, redditCold } from "@/lib/reddit";
import { blueskyFetchedAt, blueskyCold } from "@/lib/bluesky";
import { hnFetchedAt, hnCold } from "@/lib/hackernews";
import { producthuntFetchedAt, producthuntCold } from "@/lib/producthunt";
import { devtoFetchedAt, devtoCold } from "@/lib/devto";
import { lobstersFetchedAt, lobstersCold } from "@/lib/lobsters";
import { npmFetchedAt, npmCold } from "@/lib/npm";

// 2 hours ≈ 2× hourly GHA cadence. Stale past this means at least one tick
// has missed; operator should be paged.
const FAST_DATA_STALE_THRESHOLD_MS = 2 * 60 * 60 * 1000;
const RANKINGS_STALE_THRESHOLD_MS = 12 * 60 * 60 * 1000;
// ProductHunt runs DAILY (not hourly) per its 100 req/hr rate limit. 26h
// gives the daily cron 2h of slack before we flag as stale.
const PRODUCTHUNT_STALE_THRESHOLD_MS = 26 * 60 * 60 * 1000;
// dev.to runs DAILY too (lower-velocity source). Same 26h slack window.
const DEVTO_STALE_THRESHOLD_MS = 26 * 60 * 60 * 1000;
// npm download stats lag 24-48h. The scrape itself is daily, so a 50h
// gate catches a stuck workflow without paging on npm's own reporting lag.
const NPM_STALE_THRESHOLD_MS = 50 * 60 * 60 * 1000;

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
    const redditAge = ageMs(redditFetchedAt);
    const blueskyAge = ageMs(blueskyFetchedAt);
    const hnAge = ageMs(hnFetchedAt);
    const producthuntAge = ageMs(producthuntFetchedAt);
    const devtoAge = ageMs(devtoFetchedAt);
    const lobstersAge = ageMs(lobstersFetchedAt);
    const npmAge = ageMs(npmFetchedAt);

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
    // Reddit cold state (never scraped) is NOT stale for gate purposes. Once
    // data lands, the same 2h threshold applies.
    const redditStale = !redditCold &&
      (redditAge === null || redditAge > FAST_DATA_STALE_THRESHOLD_MS);
    // Same contract for Bluesky: cold (epoch-zero stub) is not stale —
    // only a committed scrape that's then fallen behind counts.
    const blueskyStale = !blueskyCold &&
      (blueskyAge === null || blueskyAge > FAST_DATA_STALE_THRESHOLD_MS);
    // HN runs on the hourly fast-refresh workflow alongside Reddit/Bluesky.
    // Cold = no data file yet; once a scrape lands, the 2h fast threshold
    // applies. Sprint 1 finding #1.
    const hnStale = !hnCold &&
      (hnAge === null || hnAge > FAST_DATA_STALE_THRESHOLD_MS);
    // ProductHunt runs daily. Cold (never scraped) isn't stale; once data
    // lands, the 26h threshold kicks in.
    const producthuntStale = !producthuntCold &&
      (producthuntAge === null ||
        producthuntAge > PRODUCTHUNT_STALE_THRESHOLD_MS);
    // dev.to runs daily — same contract as ProductHunt.
    const devtoStale = !devtoCold &&
      (devtoAge === null || devtoAge > DEVTO_STALE_THRESHOLD_MS);
    // Lobsters runs hourly (:37). Same 2h fast threshold as Reddit/HN/Bluesky
    // once a scrape has landed. Cold = never committed.
    const lobstersStale = !lobstersCold &&
      (lobstersAge === null || lobstersAge > FAST_DATA_STALE_THRESHOLD_MS);
    const npmStale = !npmCold &&
      (npmAge === null || npmAge > NPM_STALE_THRESHOLD_MS);
    const anyStale =
      scraperStale ||
      deltasStale ||
      hotCollectionsStale ||
      recentReposStale ||
      repoMetadataStale ||
      collectionRankingsStale ||
      redditStale ||
      blueskyStale ||
      hnStale ||
      producthuntStale ||
      devtoStale ||
      lobstersStale ||
      npmStale;

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
      redditFetchedAt: redditCold ? null : (redditFetchedAt ?? null),
      redditCold,
      blueskyFetchedAt: blueskyCold ? null : (blueskyFetchedAt ?? null),
      blueskyCold,
      hnFetchedAt: hnCold ? null : (hnFetchedAt ?? null),
      hnCold,
      producthuntFetchedAt: producthuntCold
        ? null
        : (producthuntFetchedAt ?? null),
      producthuntCold,
      devtoFetchedAt: devtoCold ? null : (devtoFetchedAt ?? null),
      devtoCold,
      lobstersFetchedAt: lobstersCold ? null : (lobstersFetchedAt ?? null),
      lobstersCold,
      npmFetchedAt: npmCold ? null : (npmFetchedAt ?? null),
      npmCold,
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
        reddit:
          redditCold || redditAge === null ? null : Math.floor(redditAge / 1000),
        bluesky:
          blueskyCold || blueskyAge === null ? null : Math.floor(blueskyAge / 1000),
        hn:
          hnCold || hnAge === null ? null : Math.floor(hnAge / 1000),
        producthunt:
          producthuntCold || producthuntAge === null
            ? null
            : Math.floor(producthuntAge / 1000),
        devto:
          devtoCold || devtoAge === null ? null : Math.floor(devtoAge / 1000),
        lobsters:
          lobstersCold || lobstersAge === null
            ? null
            : Math.floor(lobstersAge / 1000),
        npm:
          npmCold || npmAge === null ? null : Math.floor(npmAge / 1000),
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
        reddit: redditStale,
        bluesky: blueskyStale,
        hn: hnStale,
        producthunt: producthuntStale,
        devto: devtoStale,
        lobsters: lobstersStale,
        npm: npmStale,
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
        error: message,
      },
      { status: 503 },
    );
  }
}
