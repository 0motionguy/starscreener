import type { EcosystemLeaderboardItem } from "@/lib/ecosystem-leaderboards";

function finite(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function skillTrendRank(item: EcosystemLeaderboardItem): number {
  const sourceScore = finite(item.sourceTrendScore);
  const sourceVelocity = finite(item.sourceVelocity);
  if (sourceScore > 0) {
    return 10_000 + sourceScore * 10 + Math.max(0, sourceVelocity) * 100;
  }

  const sourceRank = finite(item.sourceTrendRank);
  if (sourceRank > 0) {
    return 5_000 + Math.max(0, 2_000 - sourceRank);
  }

  const signal = finite(item.signalScore);
  const hotnessDelta =
    typeof item.hotness === "number" && typeof item.hotnessPrev7d === "number"
      ? Math.max(0, item.hotness - item.hotnessPrev7d)
      : 0;
  const sourceKicker = Math.max(0, (item.crossSourceCount ?? 1) - 1) * 3;
  const citationKicker = Math.log1p(item.derivativeRepoCount ?? 0) * 2;
  return signal + hotnessDelta * 0.35 + sourceKicker + citationKicker;
}

export function rankSkillItems(
  items: ReadonlyArray<EcosystemLeaderboardItem>,
): EcosystemLeaderboardItem[] {
  return [...items].sort((a, b) => {
    const rankDiff = skillTrendRank(b) - skillTrendRank(a);
    if (rankDiff !== 0) return rankDiff;
    const signalDiff = finite(b.signalScore) - finite(a.signalScore);
    if (signalDiff !== 0) return signalDiff;
    return a.title.localeCompare(b.title);
  });
}
