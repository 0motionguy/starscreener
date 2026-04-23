import { blueskyCold, blueskyFetchedAt, getBlueskyFile } from "./bluesky";
import { devtoCold, devtoFetchedAt, getDevtoFile } from "./devto";
import { getHnFile, hnCold, hnFetchedAt } from "./hackernews";
import { getLobstersFile, lobstersCold, lobstersFetchedAt } from "./lobsters";
import { getNpmPackagesFile, npmCold, npmFetchedAt } from "./npm";
import { getPhFile, producthuntCold, producthuntFetchedAt } from "./producthunt";
import { getAllPostsFile } from "./reddit-all-data";
import { getRedditFetchedAt, getRedditFile, isRedditCold } from "./reddit-data";

export const FAST_DATA_STALE_THRESHOLD_MS = 2 * 60 * 60 * 1000;
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
  const lobstersLowVolume = !lobstersCold && lobstersFile.scannedStories < 10;
  const lobstersNotes: string[] = [];
  if (lobstersLowVolume) {
    lobstersNotes.push("Lobsters story volume is unusually low.");
  }

  const npmFile = getNpmPackagesFile();
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
      fetchedAt: hnCold ? null : hnFetchedAt,
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
      fetchedAt: blueskyCold ? null : blueskyFetchedAt,
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
      fetchedAt: producthuntCold ? null : producthuntFetchedAt,
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
      fetchedAt: devtoCold ? null : devtoFetchedAt,
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
      fetchedAt: lobstersCold ? null : lobstersFetchedAt,
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
      fetchedAt: npmCold ? null : npmFetchedAt,
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
