import { getDerivedRepos } from "@/lib/derived-repos";

export type TrendingMentionsSource =
  | "hackernews"
  | "reddit"
  | "bluesky"
  | "devto"
  | "lobsters"
  | "twitter";

export interface TrendingMentionsRow {
  rank: number;
  fullName: string;
  sourceMentions24h: number;
  totalMentions24h: number;
  momentumScore: number;
  starsDelta24h: number;
  boostedScore: number;
}

function scoreRow(input: {
  sourceMentions24h: number;
  totalMentions24h: number;
  momentumScore: number;
  starsDelta24h: number;
}): number {
  // Cross-source boost: local channel volume stays primary, then reward
  // multi-channel confirmation and live repo momentum.
  return (
    input.sourceMentions24h * 100 +
    input.totalMentions24h * 4 +
    input.momentumScore * 1.5 +
    Math.max(0, input.starsDelta24h) * 0.2
  );
}

export function getTrendingMentionsTop50(
  source: TrendingMentionsSource,
): TrendingMentionsRow[] {
  const rows = getDerivedRepos()
    .map((repo) => {
      const sourceMentions24h = repo.mentions?.perSource?.[source]?.count24h ?? 0;
      const totalMentions24h = repo.mentions?.total24h ?? repo.mentionCount24h ?? 0;
      const momentumScore = repo.momentumScore ?? 0;
      const starsDelta24h = repo.starsDelta24h ?? 0;
      return {
        fullName: repo.fullName,
        sourceMentions24h,
        totalMentions24h,
        momentumScore,
        starsDelta24h,
        boostedScore: scoreRow({
          sourceMentions24h,
          totalMentions24h,
          momentumScore,
          starsDelta24h,
        }),
      };
    })
    .filter((row) => row.sourceMentions24h > 0)
    .sort((a, b) => {
      if (b.boostedScore !== a.boostedScore) return b.boostedScore - a.boostedScore;
      if (b.sourceMentions24h !== a.sourceMentions24h) {
        return b.sourceMentions24h - a.sourceMentions24h;
      }
      if (b.totalMentions24h !== a.totalMentions24h) {
        return b.totalMentions24h - a.totalMentions24h;
      }
      return b.momentumScore - a.momentumScore;
    })
    .slice(0, 50);

  return rows.map((row, idx) => ({ rank: idx + 1, ...row }));
}

