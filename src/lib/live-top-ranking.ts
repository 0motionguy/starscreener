import type { Repo } from "@/lib/types";

function asNumber(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function compareLiveTopTrending(a: Repo, b: Repo): number {
  const trendDelta = asNumber(b.trendScore24h) - asNumber(a.trendScore24h);
  if (trendDelta !== 0) return trendDelta;

  const starDelta = asNumber(b.starsDelta24h) - asNumber(a.starsDelta24h);
  if (starDelta !== 0) return starDelta;

  const mentionsDelta = asNumber(b.mentionCount24h) - asNumber(a.mentionCount24h);
  if (mentionsDelta !== 0) return mentionsDelta;

  return asNumber(b.momentumScore) - asNumber(a.momentumScore);
}

