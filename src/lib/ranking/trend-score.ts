import type { Repo } from "@/lib/types";

/**
 * Sustained-trend score (stars/day of *prior* growth) for the TREND board's
 * long tail — the repos NOT pinned by the curated TrendShift map.
 *
 * On prod (2026-07-05) the TREND tail fell back to a bare 30d star score, which
 * correlates with the 24h delta and re-sorted the tail into GAINER's exact list
 * (12 of the top 20 shared, same order). GAINER is "who spiked today"; TREND
 * must be "who's been climbing for weeks" — the opposite emphasis.
 *
 * The trick that structurally decouples them: score by the growth that is NOT
 * attributable to today, `d30 - d24` (stars gained in the 29 days before
 * today), daily-ized. A repo that gained everything today (a GAINER: d30 ~ d24)
 * scores ~0 and leaves the TREND board; a repo that's been steadily climbing
 * keeps its prior growth and rises. Falls back to the 7d prior window when no
 * 30d history exists.
 */
export function sustainedTrendScore(repo: Repo): number {
  const d24 = Math.max(0, repo.starsDelta24h ?? 0);
  const d7 = Math.max(0, repo.starsDelta7d ?? 0);
  const d30 = Math.max(0, repo.starsDelta30d ?? 0);

  if (d30 > 0) return Math.max(0, d30 - d24) / 29; // prior 29 days, daily-ized
  return Math.max(0, d7 - d24) / 6; // no 30d history — prior 6 days
}
