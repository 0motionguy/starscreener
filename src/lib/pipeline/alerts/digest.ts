// StarScreener Pipeline — daily / weekly digest generator.
//
// Produces a Digest object summarizing the top movers for a user.
// Selection priority:
//   1. Watchlisted repos with significant changes
//   2. Top momentum gainers
//   3. Breakouts detected
//
// No I/O: callers pass in the data they want considered.

import type { Repo } from "../../types";
import type {
  Digest,
  DigestItem,
  RepoReason,
  RepoScore,
} from "../types";

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface DigestOptions {
  repos: Repo[];
  scores: Map<string, RepoScore>;
  reasons: Map<string, RepoReason>;
  watchlistRepoIds: string[];
}

type BucketTag = "watchlist" | "momentum" | "breakout";

interface Candidate {
  repo: Repo;
  score: RepoScore | undefined;
  reason: RepoReason | undefined;
  bucket: BucketTag;
  bucketPriority: number;   // lower = higher priority bucket
  sortKey: number;          // within-bucket sort (higher = better)
}

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const MAX_ITEMS = 10;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const abs = Math.abs(n);
  if (abs >= 1000) {
    return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  }
  return String(Math.round(n));
}

function hasSignificantChange(repo: Repo, period: "daily" | "weekly"): boolean {
  const delta = period === "daily" ? repo.starsDelta24h : repo.starsDelta7d;
  if (Math.abs(delta) >= 25) return true;
  if (repo.mentionCount24h >= 5) return true;
  if (repo.lastReleaseAt) {
    const releasedMs = Date.now() - Date.parse(repo.lastReleaseAt);
    const window = period === "daily" ? DAY_MS : WEEK_MS;
    if (Number.isFinite(releasedMs) && releasedMs >= 0 && releasedMs <= window) {
      return true;
    }
  }
  return false;
}

function buildMetric(
  repo: Repo,
  score: RepoScore | undefined,
  period: "daily" | "weekly",
  bucket: BucketTag,
): string {
  if (bucket === "momentum" && score) {
    const prev = repo.momentumScore;
    const delta = Math.round(score.overall) - Math.round(prev);
    const arrow = delta > 0 ? "↑" : delta < 0 ? "↓" : "";
    const sign = delta > 0 ? "+" : "";
    return `Momentum ${Math.round(score.overall)}${arrow ? ` ${arrow}${sign}${delta}` : ""}`;
  }
  const delta = period === "daily" ? repo.starsDelta24h : repo.starsDelta7d;
  const sign = delta >= 0 ? "+" : "-";
  const label = period === "daily" ? "stars" : "stars 7d";
  return `${sign}${formatNumber(Math.abs(delta))} ${label}`;
}

function buildHeadline(repo: Repo, reason: RepoReason | undefined): string {
  const topReason =
    reason?.details?.[0]?.headline ?? reason?.summary ?? repo.description ?? "";
  if (!topReason) return repo.fullName;
  return `${repo.fullName} — ${topReason}`;
}

function buildReason(repo: Repo, reason: RepoReason | undefined): string {
  if (reason?.summary) return reason.summary;
  if (reason?.details?.[0]?.detail) return reason.details[0].detail;
  if (repo.movementStatus === "breakout") return "Breakout detected.";
  if (repo.movementStatus === "quiet_killer") return "Steady sustained growth.";
  if (repo.movementStatus === "hot") return "Trending hot right now.";
  return "Notable movement in the last period.";
}

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

function collectCandidates(
  opts: DigestOptions,
  period: "daily" | "weekly",
): Candidate[] {
  const watchlist = new Set(opts.watchlistRepoIds);
  const seen = new Set<string>();
  const candidates: Candidate[] = [];

  // Bucket 1: watchlisted repos with significant changes.
  for (const repo of opts.repos) {
    if (!watchlist.has(repo.id)) continue;
    if (!hasSignificantChange(repo, period)) continue;
    if (seen.has(repo.id)) continue;
    seen.add(repo.id);
    const score = opts.scores.get(repo.id);
    const sortKey =
      (score?.overall ?? repo.momentumScore) +
      Math.abs(period === "daily" ? repo.starsDelta24h : repo.starsDelta7d) / 10;
    candidates.push({
      repo,
      score,
      reason: opts.reasons.get(repo.id),
      bucket: "watchlist",
      bucketPriority: 0,
      sortKey,
    });
  }

  // Bucket 2: top momentum gainers (by score.overall desc).
  const momentumSorted = [...opts.repos].sort((a, b) => {
    const as = opts.scores.get(a.id)?.overall ?? a.momentumScore;
    const bs = opts.scores.get(b.id)?.overall ?? b.momentumScore;
    return bs - as;
  });
  for (const repo of momentumSorted) {
    if (seen.has(repo.id)) continue;
    const score = opts.scores.get(repo.id);
    const overall = score?.overall ?? repo.momentumScore;
    if (overall <= 0) continue;
    seen.add(repo.id);
    candidates.push({
      repo,
      score,
      reason: opts.reasons.get(repo.id),
      bucket: "momentum",
      bucketPriority: 1,
      sortKey: overall,
    });
  }

  // Bucket 3: breakouts (may already be seen, skip).
  for (const repo of opts.repos) {
    if (seen.has(repo.id)) continue;
    const score = opts.scores.get(repo.id);
    const isBreakout = score?.isBreakout ?? repo.movementStatus === "breakout";
    if (!isBreakout) continue;
    seen.add(repo.id);
    candidates.push({
      repo,
      score,
      reason: opts.reasons.get(repo.id),
      bucket: "breakout",
      bucketPriority: 2,
      sortKey: score?.overall ?? repo.momentumScore,
    });
  }

  return candidates;
}

function rankCandidates(candidates: Candidate[]): Candidate[] {
  return [...candidates].sort((a, b) => {
    if (a.bucketPriority !== b.bucketPriority) {
      return a.bucketPriority - b.bucketPriority;
    }
    return b.sortKey - a.sortKey;
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function generateDigest(
  userId: string,
  period: "daily" | "weekly",
  options: DigestOptions,
): Digest {
  const now = new Date();
  const periodMs = period === "daily" ? DAY_MS : WEEK_MS;
  const periodStart = new Date(now.getTime() - periodMs).toISOString();
  const periodEnd = now.toISOString();

  const ranked = rankCandidates(collectCandidates(options, period)).slice(
    0,
    MAX_ITEMS,
  );

  const items: DigestItem[] = ranked.map((c, idx) => ({
    repoId: c.repo.id,
    position: idx + 1,
    headline: buildHeadline(c.repo, c.reason),
    metric: buildMetric(c.repo, c.score, period, c.bucket),
    reason: buildReason(c.repo, c.reason),
  }));

  return {
    id: `digest_${userId}_${period}_${now.getTime()}`,
    userId,
    period,
    generatedAt: periodEnd,
    periodStart,
    periodEnd,
    items,
  };
}

export function generateDailyDigest(
  userId: string,
  opts: DigestOptions,
): Digest {
  return generateDigest(userId, "daily", opts);
}

export function generateWeeklyDigest(
  userId: string,
  opts: DigestOptions,
): Digest {
  return generateDigest(userId, "weekly", opts);
}
