// V3 header builder for /twitter. Maps the X leaderboard rows + stats
// onto the {cards, topStories} shape NewsTopHeaderV3 expects.
//
// Cards:
//   0. SNAPSHOT — repos with buzz + mentions / likes / reposts 24h
//   1. ENGAGE   — top 6 repos by mentions 24h (mini-leaderboard)
//   2. BADGES   — distribution of badge states (X_FIRE / X / NONE)
//
// Heroes: top 3 leaderboard rows by finalTwitterScore.

import type {
  NewsHeroStory,
  NewsMetricBar,
  NewsMetricCard,
} from "@/components/news/NewsTopHeaderV3";
import { compactNumber } from "@/components/news/newsTopMetrics";
import type {
  TwitterLeaderboardRow,
  TwitterOverviewStats,
} from "@/lib/twitter/types";

const BADGE_PALETTE: Record<string, string> = {
  x_fire: "var(--v3-acc)",
  x: "#1d9bf0",
  none: "var(--v3-line-300)",
};

const REPO_PALETTE = [
  "var(--v3-acc)",
  "#F59E0B",
  "#3AD6C5",
  "#F472B6",
  "#FBBF24",
  "#A78BFA",
];

export function buildTwitterHeader(
  rows: TwitterLeaderboardRow[],
  stats: TwitterOverviewStats,
): {
  cards: [NewsMetricCard, NewsMetricCard, NewsMetricCard];
  topStories: NewsHeroStory[];
} {
  // Mentions per repo — top 6 by mention count.
  const engageBars: NewsMetricBar[] = rows
    .slice()
    .sort((a, b) => b.mentionCount24h - a.mentionCount24h)
    .slice(0, 6)
    .map((r, i) => ({
      label: r.githubFullName.split("/")[1]?.toUpperCase() ?? r.githubFullName.toUpperCase(),
      value: r.mentionCount24h,
      valueLabel: compactNumber(r.mentionCount24h),
      // Prefix with ♥ so the secondary value can't be misread as a second
      // mention count when stacked next to the primary mentions number.
      hintLabel: `♥ ${compactNumber(r.totalLikes24h)}`,
      color: REPO_PALETTE[i % REPO_PALETTE.length],
    }));

  // Badge distribution.
  const badgeCounts = { x_fire: 0, x: 0, none: 0 };
  for (const r of rows) {
    if (r.badgeState === "x_fire") badgeCounts.x_fire += 1;
    else if (r.badgeState === "x") badgeCounts.x += 1;
    else badgeCounts.none += 1;
  }
  const badgeBars: NewsMetricBar[] = [
    {
      label: "X FIRE",
      value: badgeCounts.x_fire,
      valueLabel: badgeCounts.x_fire.toLocaleString("en-US"),
      hintLabel: "BREAKOUT",
      color: BADGE_PALETTE.x_fire,
    },
    {
      label: "X",
      value: badgeCounts.x,
      valueLabel: badgeCounts.x.toLocaleString("en-US"),
      hintLabel: "STEADY",
      color: BADGE_PALETTE.x,
    },
    {
      label: "NONE",
      value: badgeCounts.none,
      valueLabel: badgeCounts.none.toLocaleString("en-US"),
      hintLabel: "NO BUZZ",
      color: BADGE_PALETTE.none,
    },
  ];

  const cards: [NewsMetricCard, NewsMetricCard, NewsMetricCard] = [
    {
      variant: "snapshot",
      title: "// SNAPSHOT · NOW",
      rightLabel: `${stats.reposWithMentions} REPOS`,
      label: "REPOS WITH BUZZ",
      value: compactNumber(stats.reposWithMentions),
      hint: `${stats.scansStored} SCANS STORED`,
      rows: [
        {
          label: "MENTIONS 24H",
          value: compactNumber(stats.totalMentions24h),
        },
        {
          label: "TOP SCORE",
          value:
            stats.topRepoScore !== null ? stats.topRepoScore.toFixed(1) : "—",
          tone: "accent",
        },
        {
          label: "BREAKOUTS",
          value: compactNumber(stats.breakoutRepos),
        },
      ],
    },
    {
      variant: "bars",
      title: "// ENGAGE · TOP REPOS",
      rightLabel: "MENTIONS 24H",
      bars: engageBars,
      labelWidth: 96,
      emptyText: "NO MENTIONS YET",
    },
    {
      variant: "bars",
      title: "// BADGES · DISTRIBUTION",
      rightLabel: `${rows.length} ROWS`,
      bars: badgeBars,
      labelWidth: 56,
      emptyText: "NO BADGED REPOS",
    },
  ];

  const topStories = buildTwitterHeroes(rows);

  return { cards, topStories };
}

// Heroes: flatten every row's top mention authors, sort by per-tweet
// engagement, take the strongest 3. Each hero links straight to the
// tweet so "top tweets" is literally what the user clicks.
export function buildTwitterHeroes(
  rows: TwitterLeaderboardRow[],
): NewsHeroStory[] {
  type Candidate = {
    repoFullName: string;
    repoShortName: string;
    authorHandle: string;
    postUrl: string;
    engagement: number;
  };

  const candidates: Candidate[] = [];
  for (const r of rows) {
    const repoShortName =
      r.githubFullName.split("/")[1] ?? r.githubFullName;
    for (const a of r.topMentionAuthors) {
      if (!a.postUrl) continue;
      candidates.push({
        repoFullName: r.githubFullName,
        repoShortName,
        authorHandle: a.authorHandle,
        postUrl: a.postUrl,
        engagement: a.engagement,
      });
    }
  }

  const seen = new Set<string>();
  const top = candidates
    .sort((a, b) => b.engagement - a.engagement)
    .filter((c) => {
      if (seen.has(c.postUrl)) return false;
      seen.add(c.postUrl);
      return true;
    })
    .slice(0, 3);

  return top.map((c) => ({
    title: `@${c.authorHandle} on ${c.repoShortName}`,
    href: c.postUrl,
    external: true,
    sourceCode: "X",
    byline: `@${c.authorHandle}`,
    scoreLabel: `${c.engagement} eng · @${c.repoShortName}`,
    ageHours: null,
  }));
}
