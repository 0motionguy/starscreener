// GET /api/health
//
// Freshness-gated health endpoint for external uptime monitors. The hard
// gate stays on committed JSON timestamps, while per-source diagnostics now
// expose "degraded but still serving" states so empty-looking feeds are
// easier to diagnose before they become stale.

import { after, NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { CollectionRankingsCoverage } from "@/lib/collection-rankings";
import {
  getHealthHttpStatusForStatus,
  type HealthStatus,
} from "@/lib/health-status";
import {
  DEVTO_STALE_THRESHOLD_MS,
  FAST_DATA_STALE_THRESHOLD_MS,
  NPM_STALE_THRESHOLD_MS,
  PRODUCTHUNT_STALE_THRESHOLD_MS,
} from "@/lib/source-health-thresholds";
import type { ScannerSourceHealth } from "@/lib/source-health";
import type { DeltaCoverageQuality } from "@/lib/trending";

export const runtime = "nodejs";

const RANKINGS_STALE_THRESHOLD_MS = 12 * 60 * 60 * 1000;
const COVERAGE_WARN_PCT = 50;
const SOFT_HEALTH_PUBLIC_HEADERS = {
  "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120",
} as const;
const SOFT_HEALTH_ERROR_HEADERS = { "Cache-Control": "no-store" } as const;
const DETAIL_HEALTH_HEADERS = { "Cache-Control": "private, no-store" } as const;
const DATA_STORE_META_NAMESPACE = "ss:meta:v1";

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

type PublicHealthBody = Pick<
  HealthBody,
  | "status"
  | "sourceStatus"
  | "lastFetchedAt"
  | "computedAt"
  | "warning"
  | "error"
>;

type HealthDeps = {
  collectionRankings: typeof import("@/lib/collection-rankings");
  hotCollections: typeof import("@/lib/hot-collections");
  repoMetadata: typeof import("@/lib/repo-metadata");
  recentRepos: typeof import("@/lib/recent-repos");
  sourceHealth: typeof import("@/lib/source-health");
  sourceHealthTracker: typeof import("@/lib/source-health-tracker");
  trending: typeof import("@/lib/trending");
};

type RefreshTask = {
  label: string;
  run: () => Promise<unknown>;
};

type SoftHealthKey =
  | "trending"
  | "deltas"
  | "hotCollections"
  | "recentRepos"
  | "repoMetadata"
  | "collectionRankings"
  | "bluesky"
  | "hn"
  | "producthunt"
  | "devto"
  | "lobsters"
  | "npm";

const SOFT_HEALTH_KEYS: Array<{
  id: SoftHealthKey;
  storeKey: string;
  thresholdMs: number;
}> = [
  {
    id: "trending",
    storeKey: "trending",
    thresholdMs: FAST_DATA_STALE_THRESHOLD_MS,
  },
  {
    id: "deltas",
    storeKey: "deltas",
    thresholdMs: FAST_DATA_STALE_THRESHOLD_MS,
  },
  {
    id: "hotCollections",
    storeKey: "hot-collections",
    thresholdMs: FAST_DATA_STALE_THRESHOLD_MS,
  },
  {
    id: "recentRepos",
    storeKey: "recent-repos",
    thresholdMs: FAST_DATA_STALE_THRESHOLD_MS,
  },
  {
    id: "repoMetadata",
    storeKey: "repo-metadata",
    thresholdMs: FAST_DATA_STALE_THRESHOLD_MS,
  },
  {
    id: "collectionRankings",
    storeKey: "collection-rankings",
    thresholdMs: RANKINGS_STALE_THRESHOLD_MS,
  },
  {
    id: "bluesky",
    storeKey: "bluesky-mentions",
    thresholdMs: FAST_DATA_STALE_THRESHOLD_MS,
  },
  {
    id: "hn",
    storeKey: "hackernews-repo-mentions",
    thresholdMs: FAST_DATA_STALE_THRESHOLD_MS,
  },
  {
    id: "producthunt",
    storeKey: "producthunt-launches",
    thresholdMs: PRODUCTHUNT_STALE_THRESHOLD_MS,
  },
  {
    id: "devto",
    storeKey: "devto-mentions",
    thresholdMs: DEVTO_STALE_THRESHOLD_MS,
  },
  {
    id: "lobsters",
    storeKey: "lobsters-mentions",
    thresholdMs: FAST_DATA_STALE_THRESHOLD_MS,
  },
  { id: "npm", storeKey: "npm-packages", thresholdMs: NPM_STALE_THRESHOLD_MS },
];

type SoftHealthItem = (typeof SOFT_HEALTH_KEYS)[number];

async function loadHealthDeps(): Promise<HealthDeps> {
  const [
    collectionRankings,
    hotCollections,
    repoMetadata,
    recentRepos,
    sourceHealth,
    sourceHealthTracker,
    trending,
  ] = await Promise.all([
    import("@/lib/collection-rankings"),
    import("@/lib/hot-collections"),
    import("@/lib/repo-metadata"),
    import("@/lib/recent-repos"),
    import("@/lib/source-health"),
    import("@/lib/source-health-tracker"),
    import("@/lib/trending"),
  ]);

  return {
    collectionRankings,
    hotCollections,
    repoMetadata,
    recentRepos,
    sourceHealth,
    sourceHealthTracker,
    trending,
  };
}

async function canViewDetail(request: NextRequest): Promise<boolean> {
  const cronSecret = process.env.CRON_SECRET?.trim();
  const { verifyAdminAuth, verifyCronAuth } = await import("@/lib/api/auth");
  return (
    (cronSecret ? verifyCronAuth(request).kind === "ok" : false) ||
    verifyAdminAuth(request).kind === "ok"
  );
}

function getCircuitBreakerSummary(deps: HealthDeps): {
  open: string[];
  half_open: string[];
} {
  const all = deps.sourceHealthTracker.sourceHealthTracker.getAllHealth();
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

function dataStoreMetaKey(storeKey: string): string {
  return `${DATA_STORE_META_NAMESPACE}:${storeKey}`;
}

function parseSoftWrittenAt(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "string" && raw.length > 0) {
    if (raw[0] === "{") {
      try {
        const parsed = JSON.parse(raw) as { writtenAt?: unknown };
        return typeof parsed.writtenAt === "string" &&
          parsed.writtenAt.length > 0
          ? parsed.writtenAt
          : null;
      } catch {
        return null;
      }
    }
    return raw;
  }
  if (typeof raw === "object") {
    const parsed = raw as { writtenAt?: unknown };
    return typeof parsed.writtenAt === "string" && parsed.writtenAt.length > 0
      ? parsed.writtenAt
      : null;
  }
  return null;
}

async function readSoftHealthEntries(): Promise<
  Array<readonly [SoftHealthItem, string | null]>
> {
  const { getDataStore } = await import("@/lib/data-store");
  const store = getDataStore();
  const redis = store.redisClient();

  if (redis?.mget) {
    try {
      const raw = await redis.mget(
        ...SOFT_HEALTH_KEYS.map((item) => dataStoreMetaKey(item.storeKey)),
      );
      return SOFT_HEALTH_KEYS.map(
        (item, index) => [item, parseSoftWrittenAt(raw[index])] as const,
      );
    } catch {
      // Fall back to the public data-store API. That preserves file/memory
      // fallback when Redis has a transient miss or the raw batched read fails.
    }
  }

  return Promise.all(
    SOFT_HEALTH_KEYS.map(async (item) => {
      try {
        return [item, await store.writtenAt(item.storeKey)] as const;
      } catch {
        return [item, null] as const;
      }
    }),
  );
}

async function getPublicSoftHealthBody(): Promise<PublicHealthBody> {
  try {
    const timestamps = new Map<SoftHealthKey, string | null>();
    const staleIds: SoftHealthKey[] = [];
    const entries = await readSoftHealthEntries();

    for (const [item, writtenAt] of entries) {
      timestamps.set(item.id, writtenAt);
      const age = ageMs(writtenAt);
      if (age === null || age > item.thresholdMs) {
        staleIds.push(item.id);
      }
    }

    const body: PublicHealthBody = {
      status: staleIds.length > 0 ? "stale" : "ok",
      sourceStatus: staleIds.length > 0 ? "degraded" : "ok",
      lastFetchedAt: timestamps.get("trending") ?? null,
      computedAt: timestamps.get("deltas") ?? null,
    };

    if (staleIds.length > 0) {
      body.warning = `stale sources: ${staleIds.join(", ")}`;
    }

    return body;
  } catch (err) {
    console.warn("[api:health] soft metadata unavailable", err);
    return {
      status: "error",
      sourceStatus: "degraded",
      lastFetchedAt: null,
      computedAt: null,
      error: "health metadata unavailable",
    };
  }
}

function createRefreshTasks(deps: HealthDeps): RefreshTask[] {
  return [
    { label: "trending", run: deps.trending.refreshTrendingFromStore },
    {
      label: "hotCollections",
      run: deps.hotCollections.refreshHotCollectionsFromStore,
    },
    { label: "recentRepos", run: deps.recentRepos.refreshRecentReposFromStore },
    {
      label: "repoMetadata",
      run: deps.repoMetadata.refreshRepoMetadataFromStore,
    },
    {
      label: "collectionRankings",
      run: deps.collectionRankings.refreshCollectionRankingsFromStore,
    },
    {
      label: "scannerSourceHealth",
      run: deps.sourceHealth.refreshScannerSourceHealthFromStore,
    },
  ];
}

async function runRefreshTasks(
  tasks: RefreshTask[],
): Promise<PromiseSettledResult<unknown>[]> {
  return Promise.allSettled(tasks.map((task) => task.run()));
}

function countRefreshFailures(
  results: PromiseSettledResult<unknown>[],
): number {
  return results.filter((result) => result.status === "rejected").length;
}

function scheduleBackgroundRefresh(): void {
  after(async () => {
    try {
      const deps = await loadHealthDeps();
      const tasks = createRefreshTasks(deps);
      const results = await runRefreshTasks(tasks);
      const failures = results.flatMap((result, index) => {
        if (result.status !== "rejected") return [];
        const reason =
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason);
        return [`${tasks[index]?.label ?? "unknown"}: ${reason}`];
      });

      if (failures.length > 0) {
        console.warn("[api:health] background refresh degraded", {
          failures,
        });
      }
    } catch (err) {
      console.warn("[api:health] background refresh failed", err);
    }
  });
}

export async function GET(
  request: NextRequest,
): Promise<NextResponse<HealthBody | PublicHealthBody>> {
  let soft = false;
  let includeDetail = false;
  let deps: HealthDeps | null = null;
  try {
    soft = request.nextUrl.searchParams.get("soft") === "1";
    const wantsDetail = request.nextUrl.searchParams.get("detail") === "1";
    includeDetail = wantsDetail && (await canViewDetail(request));

    if (soft && !includeDetail) {
      // Public soft health is an uptime probe. Keep it metadata-only so cold
      // Vercel functions do not import/refresh the scanner stack before TTFB.
      scheduleBackgroundRefresh();
      const body = await getPublicSoftHealthBody();
      return NextResponse.json(body, {
        status: 200,
        headers:
          body.status === "error"
            ? SOFT_HEALTH_ERROR_HEADERS
            : SOFT_HEALTH_PUBLIC_HEADERS,
      });
    }

    deps = await loadHealthDeps();
    const refreshTasks = createRefreshTasks(deps);
    const refreshResults = await runRefreshTasks(refreshTasks);
    const refreshFailureCount = countRefreshFailures(refreshResults);

    const lastFetchedAt = deps.trending.getLastFetchedAt();
    const deltasComputedAt = deps.trending.getDeltasComputedAt();
    const hotCollectionsFetchedAt =
      deps.hotCollections.getHotCollectionsFetchedAt();
    const recentReposFetchedAt = deps.recentRepos.getRecentReposFetchedAt();
    const repoMetadataFetchedAt =
      deps.repoMetadata.getRepoMetadataFetchedAt();
    const collectionRankingsFetchedAt =
      deps.collectionRankings.getCollectionRankingsFetchedAt();

    const sources = deps.sourceHealth.getScannerSourceHealth();
    const degradedSources = deps.sourceHealth
      .getDegradedScannerSources()
      .map((source) => source.id);
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

    const coverage = deps.trending.deltasCoveragePct();
    const coverageLow = coverage < COVERAGE_WARN_PCT;
    const quality = deps.trending.deltasCoverageQuality();
    const collectionCoverage =
      deps.collectionRankings.getCollectionRankingsCoverage();

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
        count: deps.repoMetadata.getRepoMetadataCount(),
        sourceCount: deps.repoMetadata.getRepoMetadataSourceCount(),
        coveragePct:
          Math.round(deps.repoMetadata.getRepoMetadataCoveragePct() * 10) / 10,
        failureCount: deps.repoMetadata.getRepoMetadataFailures().length,
      },
      degradedSources,
      sources,
      circuitBreakers: getCircuitBreakerSummary(deps),
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
    if (refreshFailureCount > 0) {
      const refreshWarning = `refresh degraded: ${refreshFailureCount}/${refreshResults.length} dependency refreshes failed; serving cached health snapshot`;
      body.warning = body.warning
        ? `${body.warning}; ${refreshWarning}`
        : refreshWarning;
    }

    // APP-12: strip recon-surface fields for unauthorized callers. Status,
    // overall coverage, and computedAt timestamps stay public so uptime
    // monitors keep working; per-source breakdown + circuit breaker state
    // require the bearer.
    if (!includeDetail) {
      const minimal = body as unknown as Record<string, unknown>;
      delete minimal.sources;
      delete minimal.circuitBreakers;
      delete minimal.degradedSources;
      delete minimal.stale;
      delete minimal.ageSeconds;
      delete minimal.thresholdSeconds;
      delete minimal.collectionCoverage;
      delete minimal.repoMetadata;
    }

    return NextResponse.json(body, {
      status: getHealthHttpStatusForStatus(body.status, soft),
      headers: includeDetail ? DETAIL_HEALTH_HEADERS : undefined,
    });
  } catch (err) {
    console.error("[api:health] failed", err);
    const message = err instanceof Error ? err.message : String(err);
    const fallbackLastFetchedAt = deps?.trending.getLastFetchedAt() ?? null;
    const fallbackComputedAt = deps?.trending.getDeltasComputedAt() ?? null;
    const fallbackHotCollectionsFetchedAt =
      deps?.hotCollections.getHotCollectionsFetchedAt() ?? null;
    const fallbackRecentReposFetchedAt =
      deps?.recentRepos.getRecentReposFetchedAt() ?? null;
    const fallbackRepoMetadataFetchedAt =
      deps?.repoMetadata.getRepoMetadataFetchedAt() ?? null;
    const fallbackCollectionRankingsFetchedAt =
      deps?.collectionRankings.getCollectionRankingsFetchedAt() ?? null;

    if (!includeDetail) {
      return NextResponse.json(
        {
          status: "error",
          sourceStatus: "degraded",
          lastFetchedAt: fallbackLastFetchedAt,
          computedAt: fallbackComputedAt,
          error: "health check failed",
        },
        {
          status: soft ? 200 : 503,
          headers: soft ? SOFT_HEALTH_ERROR_HEADERS : undefined,
        },
      );
    }

    return NextResponse.json(
      {
        status: "error",
        sourceStatus: "degraded",
        lastFetchedAt: fallbackLastFetchedAt,
        computedAt: fallbackComputedAt,
        hotCollectionsFetchedAt: fallbackHotCollectionsFetchedAt,
        recentReposFetchedAt: fallbackRecentReposFetchedAt,
        repoMetadataFetchedAt: fallbackRepoMetadataFetchedAt,
        collectionRankingsFetchedAt: fallbackCollectionRankingsFetchedAt,
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
        circuitBreakers: deps
          ? getCircuitBreakerSummary(deps)
          : { open: [], half_open: [] },
        error: message,
      },
      { status: 503, headers: DETAIL_HEALTH_HEADERS },
    );
  }
}
