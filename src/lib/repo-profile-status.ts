import type { RepoProfile, RepoProfilesFile, RepoProfileStatus } from "./repo-profiles";

const DEFAULT_RECENT_LIMIT = 12;
const DEFAULT_BACKLOG_LIMIT = 12;
const DEFAULT_RECENT_WINDOW_HOURS = 24;
const HOUR_MS = 60 * 60 * 1000;

const ACTIONABLE_BACKLOG_STATUSES = new Set<RepoProfileStatus>([
  "scan_pending",
  "scan_running",
  "scan_failed",
  "rate_limited",
]);

export interface RepoProfileStatusOptions {
  now?: Date;
  recentLimit?: number;
  backlogLimit?: number;
  recentWindowHours?: number;
}

export interface RepoProfileStatusSummary {
  generatedAt: string | null;
  selection: RepoProfilesFile["selection"];
  counts: {
    total: number;
    scanned: number;
    scanPending: number;
    scanRunning: number;
    queued: number;
    noWebsite: number;
    scanFailed: number;
    rateLimited: number;
    failed: number;
    withAiso: number;
    withExpertBrief: number;
    actionableBacklog: number;
  };
  budget: {
    dailyScanBudget: number | null;
    recentAisoSubmissions24h: number;
    remainingToday: number | null;
    windowHours: number;
    latestAisoScanAt: string | null;
  };
  recent: Array<{
    fullName: string;
    rank: number | null;
    status: RepoProfileStatus;
    websiteUrl: string | null;
    lastProfiledAt: string;
  }>;
  backlogPreview: Array<{
    fullName: string;
    rank: number | null;
    status: RepoProfileStatus;
    websiteUrl: string | null;
    websiteSource: RepoProfile["websiteSource"];
    lastProfiledAt: string;
    nextScanAfter: string | null;
    error: string | null;
  }>;
}

function scanIdentifier(profile: RepoProfile): string | null {
  if (!profile.aisoScan) return null;
  if (profile.aisoScan.scanId) return profile.aisoScan.scanId;
  const legacyId = (profile.aisoScan as unknown as Record<string, unknown>).id;
  return typeof legacyId === "string" && legacyId.trim() ? legacyId : null;
}

function parseIsoMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function scanTimestamp(profile: RepoProfile): { iso: string; ms: number } | null {
  if (!scanIdentifier(profile)) return null;
  const scan = profile.aisoScan as unknown as Record<string, unknown>;
  const raw =
    (typeof scan.completedAt === "string" ? scan.completedAt : null) ??
    (typeof scan.submittedAt === "string" ? scan.submittedAt : null) ??
    (typeof scan.createdAt === "string" ? scan.createdAt : null) ??
    profile.lastProfiledAt;
  const ms = parseIsoMs(raw);
  if (ms === null) return null;
  return { iso: new Date(ms).toISOString(), ms };
}

function compareByRankThenName(a: RepoProfile, b: RepoProfile): number {
  const ar = a.rank ?? Number.MAX_SAFE_INTEGER;
  const br = b.rank ?? Number.MAX_SAFE_INTEGER;
  if (ar !== br) return ar - br;
  return a.fullName.localeCompare(b.fullName);
}

function positiveInt(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value) || value === undefined) return fallback;
  return Math.max(1, Math.floor(value));
}

export function summarizeRepoProfileStatus(
  file: RepoProfilesFile,
  options: RepoProfileStatusOptions = {},
): RepoProfileStatusSummary {
  const nowMs = (options.now ?? new Date()).getTime();
  const recentLimit = positiveInt(options.recentLimit, DEFAULT_RECENT_LIMIT);
  const backlogLimit = positiveInt(options.backlogLimit, DEFAULT_BACKLOG_LIMIT);
  const windowHours = positiveInt(
    options.recentWindowHours,
    DEFAULT_RECENT_WINDOW_HOURS,
  );
  const windowMs = windowHours * HOUR_MS;
  const counts: RepoProfileStatusSummary["counts"] = {
    total: 0,
    scanned: 0,
    scanPending: 0,
    scanRunning: 0,
    queued: 0,
    noWebsite: 0,
    scanFailed: 0,
    rateLimited: 0,
    failed: 0,
    withAiso: 0,
    withExpertBrief: 0,
    actionableBacklog: 0,
  };
  let recentAisoSubmissions24h = 0;
  let latestAiso: { iso: string; ms: number } | null = null;

  for (const profile of file.profiles) {
    counts.total += 1;
    if (profile.status === "scanned") counts.scanned += 1;
    else if (profile.status === "scan_pending") counts.scanPending += 1;
    else if (profile.status === "scan_running") counts.scanRunning += 1;
    else if (profile.status === "no_website") counts.noWebsite += 1;
    else if (profile.status === "scan_failed") counts.scanFailed += 1;
    else if (profile.status === "rate_limited") counts.rateLimited += 1;

    if (profile.status === "scan_pending" || profile.status === "scan_running") {
      counts.queued += 1;
    }
    if (profile.status === "scan_failed" || profile.status === "rate_limited") {
      counts.failed += 1;
    }
    if (scanIdentifier(profile)) {
      counts.withAiso += 1;
      const timestamp = scanTimestamp(profile);
      if (timestamp) {
        if (!latestAiso || timestamp.ms > latestAiso.ms) latestAiso = timestamp;
        if (timestamp.ms <= nowMs && nowMs - timestamp.ms <= windowMs) {
          recentAisoSubmissions24h += 1;
        }
      }
    }
    if (profile.expertTrendBrief) counts.withExpertBrief += 1;
    if (
      profile.websiteUrl &&
      ACTIONABLE_BACKLOG_STATUSES.has(profile.status)
    ) {
      counts.actionableBacklog += 1;
    }
  }

  const dailyScanBudget =
    typeof file.selection.dailyScanBudget === "number" &&
    Number.isFinite(file.selection.dailyScanBudget)
      ? file.selection.dailyScanBudget
      : null;
  const remainingToday =
    dailyScanBudget === null
      ? null
      : Math.max(0, dailyScanBudget - recentAisoSubmissions24h);

  const recent = file.profiles.slice(0, recentLimit).map((profile) => ({
    fullName: profile.fullName,
    rank: profile.rank,
    status: profile.status,
    websiteUrl: profile.websiteUrl,
    lastProfiledAt: profile.lastProfiledAt,
  }));
  const backlogPreview = file.profiles
    .filter(
      (profile) =>
        Boolean(profile.websiteUrl) &&
        ACTIONABLE_BACKLOG_STATUSES.has(profile.status),
    )
    .sort(compareByRankThenName)
    .slice(0, backlogLimit)
    .map((profile) => ({
      fullName: profile.fullName,
      rank: profile.rank,
      status: profile.status,
      websiteUrl: profile.websiteUrl,
      websiteSource: profile.websiteSource,
      lastProfiledAt: profile.lastProfiledAt,
      nextScanAfter: profile.nextScanAfter,
      error: profile.error,
    }));

  return {
    generatedAt: file.generatedAt ?? null,
    selection: file.selection,
    counts,
    budget: {
      dailyScanBudget,
      recentAisoSubmissions24h,
      remainingToday,
      windowHours,
      latestAisoScanAt: latestAiso?.iso ?? null,
    },
    recent,
    backlogPreview,
  };
}
