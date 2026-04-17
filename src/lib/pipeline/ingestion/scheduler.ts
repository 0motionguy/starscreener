// StarScreener Pipeline — tier-based refresh scheduler
//
// Every repo is assigned a RefreshTier (hot/warm/cold) based on watchlist
// membership, momentum signals, and category leadership. The scheduler turns
// a tier + lastRefreshedAt into a RefreshPlan, and selects a batch of the
// highest-priority plans whose nextRefreshAt has passed.

import type { Repo } from "../../types";
import type { RefreshPlan, RefreshPolicy, RefreshTier } from "../types";

// ---------------------------------------------------------------------------
// Policies
// ---------------------------------------------------------------------------

/** Refresh cadence and per-hour caps for each tier. */
export const DEFAULT_POLICIES: Record<RefreshTier, RefreshPolicy> = {
  hot: { tier: "hot", intervalMinutes: 60, maxPerHour: 50 },
  warm: { tier: "warm", intervalMinutes: 360, maxPerHour: 20 },
  cold: { tier: "cold", intervalMinutes: 1440, maxPerHour: 5 },
};

// ---------------------------------------------------------------------------
// Tier assignment
// ---------------------------------------------------------------------------

export interface TierContext {
  isWatchlisted: boolean;
  isTopMover: boolean;
  isBreakout: boolean;
  /** Set of repo ids currently leading their category. */
  categoryLeaderIds: Set<string> | string[];
}

function isCategoryLeader(
  repoId: string,
  leaders: Set<string> | string[],
): boolean {
  if (leaders instanceof Set) return leaders.has(repoId);
  return leaders.includes(repoId);
}

/**
 * Decide which refresh tier a repo belongs to.
 *
 * - Hot: watchlisted, top mover, breakout, or category leader.
 * - Warm: >5k stars, or currently rising/hot/quiet_killer.
 * - Cold: anything else (including archived or declining).
 */
export function assignTier(repo: Repo, ctx: TierContext): RefreshTier {
  if (
    ctx.isWatchlisted ||
    ctx.isTopMover ||
    ctx.isBreakout ||
    isCategoryLeader(repo.id, ctx.categoryLeaderIds)
  ) {
    return "hot";
  }

  if (
    repo.stars > 5000 ||
    repo.movementStatus === "rising" ||
    repo.movementStatus === "hot" ||
    repo.movementStatus === "quiet_killer"
  ) {
    return "warm";
  }

  return "cold";
}

/** Build the reasons array used in RefreshPlan.reasons. */
function buildReasons(repo: Repo, tier: RefreshTier, ctx: TierContext): string[] {
  const reasons: string[] = [];
  if (tier === "hot") {
    if (ctx.isWatchlisted) reasons.push("watchlisted");
    if (ctx.isTopMover) reasons.push("top mover");
    if (ctx.isBreakout) reasons.push("breakout");
    if (isCategoryLeader(repo.id, ctx.categoryLeaderIds)) {
      reasons.push("category leader");
    }
  } else if (tier === "warm") {
    if (repo.stars > 5000) reasons.push(`>5k stars (${repo.stars})`);
    if (
      repo.movementStatus === "rising" ||
      repo.movementStatus === "hot" ||
      repo.movementStatus === "quiet_killer"
    ) {
      reasons.push(`movement=${repo.movementStatus}`);
    }
  } else {
    reasons.push("baseline");
    if (repo.movementStatus === "declining") reasons.push("declining");
  }
  return reasons;
}

// ---------------------------------------------------------------------------
// Plan construction
// ---------------------------------------------------------------------------

/**
 * Build a refresh plan for a single repo.
 *
 * - nextRefreshAt = lastRefreshedAt + intervalMinutes, or now if unknown.
 * - priority = clamp(100 - minutesOverdue, 0, 100). Due now → ~100.
 * - Long-overdue repos still get low positive priority so cold repos that
 *   haven't been touched in weeks don't sit at exactly 0 forever.
 */
export function buildRefreshPlan(
  repo: Repo,
  tier: RefreshTier,
  lastRefreshedAt?: string,
  ctx?: TierContext,
): RefreshPlan {
  const policy = DEFAULT_POLICIES[tier];
  const now = Date.now();

  let nextMs: number;
  if (lastRefreshedAt) {
    const lastMs = Date.parse(lastRefreshedAt);
    nextMs = Number.isNaN(lastMs)
      ? now
      : lastMs + policy.intervalMinutes * 60_000;
  } else {
    nextMs = now;
  }

  const minutesOverdue = Math.max(0, (now - nextMs) / 60_000);
  const priority = Math.max(0, Math.min(100, 100 - Math.floor(minutesOverdue)));

  const reasons = ctx
    ? buildReasons(repo, tier, ctx)
    : [`tier=${tier}`];

  return {
    repoId: repo.id,
    tier,
    lastRefreshedAt: lastRefreshedAt ?? null,
    nextRefreshAt: new Date(nextMs).toISOString(),
    priority,
    reasons,
  };
}

// ---------------------------------------------------------------------------
// Batch selection
// ---------------------------------------------------------------------------

/**
 * Return up to `cap` plans whose nextRefreshAt is in the past (due now),
 * sorted by priority desc. Ties fall back to earliest nextRefreshAt so the
 * longest-overdue items ship first.
 */
export function getRefreshBatch(plans: RefreshPlan[], cap: number): RefreshPlan[] {
  if (cap <= 0) return [];
  const nowIso = new Date().toISOString();
  return plans
    .filter((p) => p.nextRefreshAt <= nowIso)
    .sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      if (a.nextRefreshAt < b.nextRefreshAt) return -1;
      if (a.nextRefreshAt > b.nextRefreshAt) return 1;
      return 0;
    })
    .slice(0, cap);
}
