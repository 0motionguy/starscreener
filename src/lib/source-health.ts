import {
  getBlueskyFetchedAt,
  getBlueskyFile,
  isBlueskyCold,
  refreshBlueskyMentionsFromStore,
} from "./bluesky";
import {
  getDevtoFetchedAt,
  getDevtoFile,
  isDevtoCold,
  refreshDevtoMentionsFromStore,
} from "./devto";
import {
  getHnFetchedAt,
  getHnFile,
  isHnCold,
  refreshHackernewsMentionsFromStore,
} from "./hackernews";
import {
  getLobstersFetchedAt,
  getLobstersFile,
  isLobstersCold,
  refreshLobstersMentionsFromStore,
} from "./lobsters";
import {
  getNpmCold,
  getNpmFetchedAt,
  getNpmPackagesFile,
  refreshNpmFromStore,
} from "./npm";
import {
  getPhFile,
  getProducthuntFetchedAt,
  isProducthuntCold,
  refreshProducthuntLaunchesFromStore,
} from "./producthunt";
import { getAllPostsFile, refreshRedditAllPostsFromStore } from "./reddit-all-data";
import {
  getRedditFetchedAt,
  getRedditFile,
  isRedditCold,
  refreshRedditMentionsFromStore,
} from "./reddit-data";

// Bumped from 2h → 4h on 2026-05-03. Hourly sources (reddit/HN/bluesky/
// lobsters/repo-metadata/collection-rankings) regularly drift past 2h
// when GHA queues build up or a single cron tick is skipped, which
// flipped /api/health to status:stale even though all collectors were
// healthy. 4h = 2× the cron cadence + 2× headroom — matches the
// audit-freshness 6h budget for these same sources without firing
// false alarms.
export const FAST_DATA_STALE_THRESHOLD_MS = 4 * 60 * 60 * 1000;
export const PRODUCTHUNT_STALE_THRESHOLD_MS = 16 * 60 * 60 * 1000;
export const DEVTO_STALE_THRESHOLD_MS = 26 * 60 * 60 * 1000;
export const NPM_STALE_THRESHOLD_MS = 50 * 60 * 60 * 1000;

const FAST_20M_DEGRADED_THRESHOLD_MS = 45 * 60 * 1000;
const FAST_HOURLY_DEGRADED_THRESHOLD_MS = 90 * 60 * 1000;
const PRODUCTHUNT_DEGRADED_THRESHOLD_MS = 8 * 60 * 60 * 1000;
const DEVTO_DEGRADED_THRESHOLD_MS = 24 * 60 * 60 * 1000;
const NPM_DEGRADED_THRESHOLD_MS = 36 * 60 * 60 * 1000;
const MAX_FUTURE_CLOCK_SKEW_MS = 5 * 60 * 1000;

export type ScannerSourceId =
  | "reddit"
  | "hackernews"
  | "bluesky"
  | "producthunt"
  | "devto"
  | "lobsters"
  | "npm";

export type ScannerSourceStatus = "ok" | "cold" | "degraded" | "stale";

export interface ScannerSourceHealth {
  id: ScannerSourceId;
  label: string;
  provider: string;
  cadence: string;
  fetchedAt: string | null;
  cold: boolean;
  stale: boolean;
  degraded: boolean;
  status: ScannerSourceStatus;
  ageSeconds: number | null;
  staleAfterSeconds: number;
  metrics: Record<string, boolean | number | string | null>;
  notes: string[];
  degradedAfterSeconds: number;
}

export async function refreshScannerSourceHealthFromStore(): Promise<void> {
  await Promise.all([
    refreshRedditMentionsFromStore(),
    refreshRedditAllPostsFromStore(),
    refreshHackernewsMentionsFromStore(),
    refreshBlueskyMentionsFromStore(),
    refreshLobstersMentionsFromStore(),
    refreshDevtoMentionsFromStore(),
    refreshProducthuntLaunchesFromStore(),
    refreshNpmFromStore(),
  ]);
}

export function evaluateSourceFreshness(args: {
  fetchedAt: string | null;
  cold: boolean;
  staleAfterMs: number;
  degradedAfterMs: number;
  upstreamDegraded?: boolean;
  nowMs?: number;
}): {
  ageMs: number | null;
  ageSeconds: number | null;
  stale: boolean;
  degraded: boolean;
  futureSkew: boolean;
} {
  if (args.cold) {
    return {
      ageMs: null,
      ageSeconds: null,
      stale: false,
      degraded: false,
      futureSkew: false,
    };
  }

  const nowMs = args.nowMs ?? Date.now();
  const age = computeAgeMs(args.fetchedAt, nowMs);
  const futureSkew =
    age !== null && age < -MAX_FUTURE_CLOCK_SKEW_MS;
  const normalizedAge = age === null ? null : Math.max(0, age);
  const stale = normalizedAge === null || normalizedAge > args.staleAfterMs;
  const cadenceMissed =
    normalizedAge !== null && normalizedAge > args.degradedAfterMs;

  return {
    ageMs: normalizedAge,
    ageSeconds:
      normalizedAge === null ? null : Math.floor(normalizedAge / 1000),
    stale,
    degraded:
      !stale && (args.upstreamDegraded === true || cadenceMissed || futureSkew),
    futureSkew,
  };
}

function computeAgeMs(iso: string | null, nowMs = Date.now()): number | null {
  if (!iso) return null;
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return null;
  return nowMs - ts;
}

function toStatus(args: {
  cold: boolean;
  stale: boolean;
  degraded: boolean;
}): ScannerSourceStatus {
  if (args.stale) return "stale";
  if (args.cold) return "cold";
  if (args.degraded) return "degraded";
  return "ok";
}

function buildSourceHealth(args: {
  id: ScannerSourceId;
  label: string;
  provider: string;
  cadence: string;
  fetchedAt: string | null;
  staleAfterMs: number;
  degradedAfterMs: number;
  cold: boolean;
  degraded: boolean;
  metrics: Record<string, boolean | number | string | null>;
  notes: string[];
}): ScannerSourceHealth {
  const freshness = evaluateSourceFreshness({
    fetchedAt: args.fetchedAt,
    cold: args.cold,
    staleAfterMs: args.staleAfterMs,
    degradedAfterMs: args.degradedAfterMs,
    upstreamDegraded: args.degraded,
  });
  const notes = [...args.notes];
  if (freshness.futureSkew) {
    notes.push("Source timestamp is ahead of this server's clock.");
  }
  return {
    id: args.id,
    label: args.label,
    provider: args.provider,
    cadence: args.cadence,
    fetchedAt: args.cold ? null : args.fetchedAt,
    cold: args.cold,
    stale: freshness.stale,
    degraded: freshness.degraded,
    status: toStatus({
      cold: args.cold,
      stale: freshness.stale,
      degraded: freshness.degraded,
    }),
    ageSeconds: freshness.ageSeconds,
    staleAfterSeconds: Math.floor(args.staleAfterMs / 1000),
    degradedAfterSeconds: Math.floor(args.degradedAfterMs / 1000),
    metrics: args.metrics,
    notes,
  };
}

export function getScannerSourceHealth(): ScannerSourceHealth[] {
  const redditFile = getRedditFile();
  const redditAllPosts = getAllPostsFile();
  const redditFetchedAt = getRedditFetchedAt();
  const redditCold = isRedditCold(redditFile);
  const redditScannedSubreddits = redditFile.scannedSubreddits.length;
  const redditFailedSubreddits = redditFile.failedSubreddits ?? 0;
  const redditSuccessfulSubreddits =
    redditFile.successfulSubreddits ??
    Math.max(0, redditScannedSubreddits - redditFailedSubreddits);
  const redditLowCoverage =
    !redditCold &&
    redditSuccessfulSubreddits > 0 &&
    redditFile.scannedPostsTotal < redditSuccessfulSubreddits * 25;
  const redditNotes: string[] = [];
  if (redditFile.fallbackUsed) {
    redditNotes.push("OAuth degraded; scraper fell back to public JSON.");
  }
  if (redditFailedSubreddits > 0) {
    redditNotes.push(
      `${redditFailedSubreddits} subreddit fetches failed in the last run.`,
    );
  }
  if (redditLowCoverage) {
    redditNotes.push("Reddit sample size landed below the expected scan floor.");
  }

  const hnFile = getHnFile();
  const hnCold = isHnCold();
  const hnLowVolume =
    !hnCold && (hnFile.scannedFirebaseItems < 100 || hnFile.scannedAlgoliaHits < 50);
  const hnNotes: string[] = [];
  if (hnFile.scannedFirebaseItems < 100) {
    hnNotes.push("Firebase top-story coverage is unusually low.");
  }
  if (hnFile.scannedAlgoliaHits < 50) {
    hnNotes.push("Algolia GitHub-link coverage is unusually low.");
  }

  const blueskyFile = getBlueskyFile();
  const blueskyCold = isBlueskyCold();
  const blueskyAuthMissing =
    !process.env.BLUESKY_HANDLE || !process.env.BLUESKY_APP_PASSWORD;
  const blueskyLowVolume =
    !blueskyCold &&
    (blueskyFile.scannedPosts < 25 || blueskyFile.pagesFetched < 1);
  const blueskyNotes: string[] = [];
  if (blueskyAuthMissing) {
    blueskyNotes.push(
      "BLUESKY_HANDLE and/or BLUESKY_APP_PASSWORD is not configured, so this scraper cannot refresh locally.",
    );
  }
  if (blueskyFile.scannedPosts < 25) {
    blueskyNotes.push("Bluesky search returned too few posts for a normal run.");
  }
  if (blueskyFile.pagesFetched < 1) {
    blueskyNotes.push("Bluesky did not advance through any search pages.");
  }

  const phFile = getPhFile();
  const producthuntCold = isProducthuntCold();
  const phAuthMissing = !process.env.PRODUCTHUNT_TOKEN;
  const phEmpty = !producthuntCold && (phFile.launches?.length ?? 0) === 0;
  const phNotes: string[] = [];
  if (phAuthMissing) {
    phNotes.push(
      "PRODUCTHUNT_TOKEN is not configured, so this scraper cannot refresh locally.",
    );
  }
  if (phEmpty) {
    phNotes.push("Product Hunt launch window came back empty.");
  }

  const devtoFile = getDevtoFile();
  const devtoCold = isDevtoCold();
  const devtoLowVolume =
    !devtoCold && (devtoFile.scannedArticles < 20 || devtoFile.bodyFetchMode === "description-only");
  const devtoNotes: string[] = [];
  if (devtoFile.scannedArticles < 20) {
    devtoNotes.push("dev.to discovery returned too few articles.");
  }
  if (devtoFile.bodyFetchMode === "description-only") {
    devtoNotes.push("dev.to body fetch is running in degraded description-only mode.");
  }

  const lobstersFile = getLobstersFile();
  const lobstersCold = isLobstersCold();
  const lobstersLowVolume = !lobstersCold && lobstersFile.scannedStories < 10;
  const lobstersNotes: string[] = [];
  if (lobstersLowVolume) {
    lobstersNotes.push("Lobsters story volume is unusually low.");
  }

  const npmFile = getNpmPackagesFile();
  const npmCold = getNpmCold();
  const npmDegraded =
    !npmCold &&
    ((npmFile.counts?.ok ?? 0) === 0 ||
      (npmFile.counts?.linkedRepos ?? 0) === 0 ||
      (npmFile.packages?.length ?? 0) === 0);
  const npmNotes: string[] = [];
  if ((npmFile.counts?.ok ?? 0) === 0) {
    npmNotes.push("npm download telemetry did not yield any successful package rows.");
  }
  if ((npmFile.counts?.linkedRepos ?? 0) === 0) {
    npmNotes.push("npm discovery did not link any packages back to repos.");
  }

  return [
    buildSourceHealth({
      id: "reddit",
      label: "Reddit",
      provider: "Reddit Data API",
      cadence: "20m",
      fetchedAt: redditFetchedAt,
      staleAfterMs: FAST_DATA_STALE_THRESHOLD_MS,
      degradedAfterMs: FAST_20M_DEGRADED_THRESHOLD_MS,
      cold: redditCold,
      degraded: redditFile.fallbackUsed === true || redditFailedSubreddits > 0 || redditLowCoverage,
      metrics: {
        authMode: redditFile.authMode ?? null,
        effectiveFetchMode: redditFile.effectiveFetchMode ?? null,
        fallbackUsed: redditFile.fallbackUsed === true,
        scannedSubreddits: redditScannedSubreddits,
        successfulSubreddits: redditSuccessfulSubreddits,
        failedSubreddits: redditFailedSubreddits,
        scannedPostsTotal: redditFile.scannedPostsTotal,
        reposWithMentions: Object.keys(redditFile.mentions).length,
        leaderboardRows: redditFile.leaderboard?.length ?? 0,
        mergedAllPosts: redditAllPosts.totalPosts,
      },
      notes: redditNotes,
    }),
    buildSourceHealth({
      id: "hackernews",
      label: "Hacker News",
      provider: "HN Firebase + Algolia",
      cadence: "20m",
      fetchedAt: hnCold ? null : getHnFetchedAt(),
      staleAfterMs: FAST_DATA_STALE_THRESHOLD_MS,
      degradedAfterMs: FAST_20M_DEGRADED_THRESHOLD_MS,
      cold: hnCold,
      degraded: hnLowVolume,
      metrics: {
        scannedFirebaseItems: hnFile.scannedFirebaseItems,
        scannedAlgoliaHits: hnFile.scannedAlgoliaHits,
        reposWithMentions: Object.keys(hnFile.mentions ?? {}).length,
        leaderboardRows: hnFile.leaderboard?.length ?? 0,
      },
      notes: hnNotes,
    }),
    buildSourceHealth({
      id: "bluesky",
      label: "Bluesky",
      provider: "Bluesky AppView search",
      cadence: "1h",
      fetchedAt: blueskyCold ? null : getBlueskyFetchedAt(),
      staleAfterMs: FAST_DATA_STALE_THRESHOLD_MS,
      degradedAfterMs: FAST_HOURLY_DEGRADED_THRESHOLD_MS,
      cold: blueskyCold,
      degraded: blueskyLowVolume || blueskyAuthMissing,
      metrics: {
        authConfigured: !blueskyAuthMissing,
        scannedPosts: blueskyFile.scannedPosts,
        pagesFetched: blueskyFile.pagesFetched,
        reposWithMentions: Object.keys(blueskyFile.mentions ?? {}).length,
        leaderboardRows: blueskyFile.leaderboard?.length ?? 0,
      },
      notes: blueskyNotes,
    }),
    buildSourceHealth({
      id: "producthunt",
      label: "Product Hunt",
      provider: "Product Hunt GraphQL",
      cadence: "4h",
      fetchedAt: producthuntCold ? null : getProducthuntFetchedAt(),
      staleAfterMs: PRODUCTHUNT_STALE_THRESHOLD_MS,
      degradedAfterMs: PRODUCTHUNT_DEGRADED_THRESHOLD_MS,
      cold: producthuntCold,
      degraded: phEmpty || phAuthMissing,
      metrics: {
        authConfigured: !phAuthMissing,
        launches: phFile.launches?.length ?? 0,
        windowDays: phFile.windowDays ?? null,
      },
      notes: phNotes,
    }),
    buildSourceHealth({
      id: "devto",
      label: "dev.to",
      provider: "dev.to public API",
      cadence: "24h",
      fetchedAt: devtoCold ? null : getDevtoFetchedAt(),
      staleAfterMs: DEVTO_STALE_THRESHOLD_MS,
      degradedAfterMs: DEVTO_DEGRADED_THRESHOLD_MS,
      cold: devtoCold,
      degraded: devtoLowVolume,
      metrics: {
        scannedArticles: devtoFile.scannedArticles,
        bodyFetchMode: devtoFile.bodyFetchMode,
        reposWithMentions: Object.keys(devtoFile.mentions ?? {}).length,
        leaderboardRows: devtoFile.leaderboard?.length ?? 0,
      },
      notes: devtoNotes,
    }),
    buildSourceHealth({
      id: "lobsters",
      label: "Lobsters",
      provider: "Best-effort HTML scrape",
      cadence: "1h",
      fetchedAt: lobstersCold ? null : getLobstersFetchedAt(),
      staleAfterMs: FAST_DATA_STALE_THRESHOLD_MS,
      degradedAfterMs: FAST_HOURLY_DEGRADED_THRESHOLD_MS,
      cold: lobstersCold,
      degraded: lobstersLowVolume,
      metrics: {
        scannedStories: lobstersFile.scannedStories,
        reposWithMentions: Object.keys(lobstersFile.mentions ?? {}).length,
        leaderboardRows: lobstersFile.leaderboard?.length ?? 0,
      },
      notes: lobstersNotes,
    }),
    buildSourceHealth({
      id: "npm",
      label: "npm",
      provider: "npm registry + downloads",
      cadence: "24h",
      fetchedAt: npmCold ? null : getNpmFetchedAt(),
      staleAfterMs: NPM_STALE_THRESHOLD_MS,
      degradedAfterMs: NPM_DEGRADED_THRESHOLD_MS,
      cold: npmCold,
      degraded: npmDegraded,
      metrics: {
        packages: npmFile.packages?.length ?? 0,
        okPackages: npmFile.counts?.ok ?? 0,
        linkedRepos: npmFile.counts?.linkedRepos ?? 0,
        failures: npmFile.discovery?.failures?.length ?? 0,
      },
      notes: npmNotes,
    }),
  ];
}

export function getDegradedScannerSources(): ScannerSourceHealth[] {
  return getScannerSourceHealth().filter((source) => source.status === "degraded");
}

export function getStaleScannerSources(): ScannerSourceHealth[] {
  return getScannerSourceHealth().filter((source) => source.status === "stale");
}

// ---------------------------------------------------------------------------
// Per-repo freshness snapshot
//
// Design note (keyed by source, NOT by (source, repo)):
// Every scanner runs globally — we ingest the entire Reddit / HN / Bluesky
// firehose and bucket posts per repo post-hoc. The last-fetch timestamps
// tracked in each scraper module are therefore per-source globals. The
// freshness signal the UI needs is "is the Reddit scan stale?", not "is the
// Reddit scan stale FOR THIS SPECIFIC REPO?" — those two questions collapse
// to the same answer under our scraper model, so a global getter is fine.
//
// The per-repo route still takes (owner, name) in its URL for cache-key
// shape and future per-repo differentiation without breaking the contract.
// ---------------------------------------------------------------------------

export type FreshnessSourceId =
  | "reddit"
  | "hackernews"
  | "bluesky"
  | "devto"
  | "producthunt"
  | "twitter"
  | "npm"
  | "github";

export interface FreshnessSourceEntry {
  lastScanAt: string | null;
  ageMs: number | null;
  stale: boolean;
}

export interface FreshnessSnapshot {
  fetchedAt: string;
  sources: Record<FreshnessSourceId, FreshnessSourceEntry>;
}

// Map health-array source ids onto the chip-level ids. Only sources that
// source-health actually tracks appear here; twitter + github stay null
// until their scrapers start emitting fetched-at.
const HEALTH_TO_FRESHNESS_ID: Partial<Record<ScannerSourceId, FreshnessSourceId>> = {
  reddit: "reddit",
  hackernews: "hackernews",
  bluesky: "bluesky",
  devto: "devto",
  producthunt: "producthunt",
  npm: "npm",
};

function emptyEntry(): FreshnessSourceEntry {
  return { lastScanAt: null, ageMs: null, stale: false };
}

/**
 * Build a snapshot of per-source freshness suitable for rendering chips.
 * Pure read of in-memory scraper state — no I/O.
 */
export function getFreshnessSnapshot(nowMs: number = Date.now()): FreshnessSnapshot {
  const sources: Record<FreshnessSourceId, FreshnessSourceEntry> = {
    reddit: emptyEntry(),
    hackernews: emptyEntry(),
    bluesky: emptyEntry(),
    devto: emptyEntry(),
    producthunt: emptyEntry(),
    twitter: emptyEntry(),
    npm: emptyEntry(),
    github: emptyEntry(),
  };

  for (const health of getScannerSourceHealth()) {
    const freshnessId = HEALTH_TO_FRESHNESS_ID[health.id];
    if (!freshnessId) continue;

    // Cold or never-scanned → leave as emptyEntry().
    if (health.cold || !health.fetchedAt) {
      continue;
    }

    const ageMs = nowMs - Date.parse(health.fetchedAt);
    if (!Number.isFinite(ageMs)) {
      continue;
    }
    const normalizedAge = Math.max(0, ageMs);
    const staleAfterMs = health.staleAfterSeconds * 1000;

    sources[freshnessId] = {
      lastScanAt: health.fetchedAt,
      ageMs: normalizedAge,
      stale: normalizedAge > staleAfterMs,
    };
  }

  return {
    fetchedAt: new Date(nowMs).toISOString(),
    sources,
  };
}
