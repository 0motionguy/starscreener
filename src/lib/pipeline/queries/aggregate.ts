// StarScreener Pipeline — higher-level aggregation queries
//
// Cross-repo / cross-category rollups. Everything here is a read-only view
// on top of the singleton stores. The homepage, category index, and status
// endpoint all feed from these.

import type { Repo } from "../../types";
import { repoStore, scoreStore, snapshotStore } from "../storage/singleton";
import { getTopMovers } from "./service";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CategoryStats {
  categoryId: string;
  repoCount: number;
  avgMomentum: number;
  topMoverId: string | null;
  totalStars: number;
}

export interface GlobalStats {
  totalRepos: number;
  totalStars: number;
  lastRefreshAt: string | null;
  hotCount: number;
  breakoutCount: number;
}

export interface TopMoversAllWindows {
  today: Repo[];
  week: Repo[];
  month: Repo[];
}

// ---------------------------------------------------------------------------
// Category-level stats
// ---------------------------------------------------------------------------

/**
 * Per-category rollup: count, average momentum, top mover (by momentum),
 * and total accumulated stars. Output order is categories sorted by
 * avgMomentum desc, then repoCount desc.
 */
export function getCategoryStats(): CategoryStats[] {
  const byCategory = new Map<string, Repo[]>();
  for (const repo of repoStore.getAll()) {
    const list = byCategory.get(repo.categoryId);
    if (list) {
      list.push(repo);
    } else {
      byCategory.set(repo.categoryId, [repo]);
    }
  }

  const stats: CategoryStats[] = [];
  for (const [categoryId, repos] of byCategory.entries()) {
    const repoCount = repos.length;
    const totalStars = repos.reduce((sum, r) => sum + r.stars, 0);
    const momentumSum = repos.reduce((sum, r) => sum + r.momentumScore, 0);
    const avgMomentum = repoCount > 0 ? momentumSum / repoCount : 0;

    let topMover: Repo | null = null;
    for (const r of repos) {
      if (!topMover || r.momentumScore > topMover.momentumScore) {
        topMover = r;
      }
    }

    stats.push({
      categoryId,
      repoCount,
      avgMomentum: Number(avgMomentum.toFixed(2)),
      topMoverId: topMover?.id ?? null,
      totalStars,
    });
  }

  stats.sort((a, b) => {
    if (b.avgMomentum !== a.avgMomentum) return b.avgMomentum - a.avgMomentum;
    return b.repoCount - a.repoCount;
  });

  return stats;
}

// ---------------------------------------------------------------------------
// Global stats (status dashboard, homepage hero)
// ---------------------------------------------------------------------------

/**
 * System-wide rollup across every tracked repo. `lastRefreshAt` surfaces the
 * newest timestamp in the score store, which is the best single signal for
 * "when did the pipeline last run". Null when no scores have been computed.
 */
export function getGlobalStats(): GlobalStats {
  const all = repoStore.getAll();

  const totalRepos = all.length;
  let totalStars = 0;
  let hotCount = 0;
  let breakoutCount = 0;

  for (const r of all) {
    totalStars += r.stars;
    if (r.movementStatus === "hot") hotCount += 1;
    if (r.movementStatus === "breakout") breakoutCount += 1;
  }

  let lastRefreshAt: string | null = null;
  for (const score of scoreStore.getAll()) {
    if (!lastRefreshAt || score.computedAt > lastRefreshAt) {
      lastRefreshAt = score.computedAt;
    }
  }

  // Fall back to the newest snapshot capturedAt if no scores are present —
  // still gives the caller a useful "last data" signal for an unscored state.
  if (!lastRefreshAt) {
    for (const r of all) {
      const snap = snapshotStore.getLatest(r.id);
      if (snap && (!lastRefreshAt || snap.capturedAt > lastRefreshAt)) {
        lastRefreshAt = snap.capturedAt;
      }
    }
  }

  return {
    totalRepos,
    totalStars,
    lastRefreshAt,
    hotCount,
    breakoutCount,
  };
}

// ---------------------------------------------------------------------------
// Homepage hero shortcut — top 10 per window
// ---------------------------------------------------------------------------

/** Top 10 movers for each standard window — powers the homepage hero. */
export function getTopMoversByAllWindows(): TopMoversAllWindows {
  return {
    today: getTopMovers("today", 10, "all"),
    week: getTopMovers("week", 10, "all"),
    month: getTopMovers("month", 10, "all"),
  };
}
