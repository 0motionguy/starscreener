// V3 header builder for /breakouts. Maps the cross-signal repo set
// onto the {cards, topStories} shape NewsTopHeaderV3 expects.
//
// Cards:
//   0. SNAPSHOT — total firing + multi-channel + all-three rows
//   1. CHANNELS — bar per channel-count (1 / 2 / 3) with repo counts
//   2. TOPICS   — top categories among multi-channel firers
//
// Heroes: top 3 repos by crossSignalScore (multi-channel only).

import type {
  NewsHeroStory,
  NewsMetricBar,
  NewsMetricCard,
} from "@/components/news/NewsTopHeaderV3";
import { compactNumber } from "@/components/news/newsTopMetrics";
import { CATEGORIES } from "@/lib/constants";
import type { Repo } from "@/lib/types";

interface BreakoutsHeaderInput {
  /** Annotated repos with `_firing` count populated by the page. */
  annotated: Array<Repo & { _firing: number }>;
  /** Highest crossSignalScore in the corpus, for the snapshot row. */
  topScore: number;
}

export function buildBreakoutsHeader({
  annotated,
  topScore,
}: BreakoutsHeaderInput): {
  cards: [NewsMetricCard, NewsMetricCard, NewsMetricCard];
  topStories: NewsHeroStory[];
} {
  const totalFiring = annotated.filter((r) => r._firing >= 1).length;
  const multiChannel = annotated.filter((r) => r._firing >= 2).length;
  const allThree = annotated.filter((r) => r._firing === 3).length;
  const oneChannel = totalFiring - multiChannel;
  const twoChannel = multiChannel - allThree;

  // Channel-count distribution. Multi-channel rows use accent color so
  // the eye lands on real signal, not noise.
  const channelBars: NewsMetricBar[] = [
    {
      label: "3 CH",
      value: allThree,
      valueLabel: allThree.toLocaleString("en-US"),
      hintLabel: "GH+R+HN",
      color: "var(--v3-acc)",
    },
    {
      label: "2 CH",
      value: twoChannel,
      valueLabel: twoChannel.toLocaleString("en-US"),
      hintLabel: "MULTI",
      color: "var(--v3-acc)",
    },
    {
      label: "1 CH",
      value: oneChannel,
      valueLabel: oneChannel.toLocaleString("en-US"),
      hintLabel: "NOISE",
      color: "var(--v3-line-300)",
    },
  ];

  // Top categories among multi-channel firers — that's where the real
  // distribution signal lives. Single-channel is too noisy to summarise.
  const multi = annotated.filter((r) => r._firing >= 2);
  const catCounts = new Map<string, number>();
  for (const repo of multi) {
    const id = repo.categoryId || "uncategorized";
    catCounts.set(id, (catCounts.get(id) ?? 0) + 1);
  }
  const TOPIC_PALETTE = [
    "var(--v3-acc)",
    "#F59E0B",
    "#3AD6C5",
    "#F472B6",
    "#FBBF24",
    "#A78BFA",
  ];
  const topicBars: NewsMetricBar[] = Array.from(catCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([id, count], i) => {
      const cat = CATEGORIES.find((c) => c.id === id);
      return {
        label: (cat?.shortName ?? cat?.name ?? id).toUpperCase(),
        value: count,
        valueLabel: count.toLocaleString("en-US"),
        color: TOPIC_PALETTE[i % TOPIC_PALETTE.length],
      };
    });

  const cards: [NewsMetricCard, NewsMetricCard, NewsMetricCard] = [
    {
      variant: "snapshot",
      title: "// SNAPSHOT · NOW",
      rightLabel: `${totalFiring} FIRING`,
      label: "MULTI-CHANNEL",
      value: compactNumber(multiChannel),
      hint: `OF ${compactNumber(totalFiring)} TOTAL FIRING`,
      rows: [
        { label: "ALL THREE", value: compactNumber(allThree), tone: "accent" },
        { label: "TOP SCORE", value: topScore.toFixed(2) },
        { label: "1-CHANNEL NOISE", value: compactNumber(oneChannel) },
      ],
    },
    {
      variant: "bars",
      title: "// CHANNELS · DISTRIBUTION",
      rightLabel: "FIRING COUNT",
      bars: channelBars,
      labelWidth: 40,
      emptyText: "NO FIRING REPOS",
    },
    {
      variant: "bars",
      title: "// TOPICS · TOP CATEGORIES",
      rightLabel: `TOP ${topicBars.length}`,
      bars: topicBars,
      labelWidth: 96,
      emptyText: "NOT ENOUGH SIGNAL YET",
    },
  ];

  const heroes = multi
    .slice()
    .sort((a, b) => (b.crossSignalScore ?? 0) - (a.crossSignalScore ?? 0))
    .slice(0, 3);
  const topStories: NewsHeroStory[] = heroes.map((r) => {
    // Source-code chip carries category short-name (≤2-3 chars, matches
    // news-page contract). Channel-firing context moves to the byline so
    // first-time visitors don't have to decode "3CH" as a SKU.
    const cat = CATEGORIES.find((c) => c.id === r.categoryId);
    const sourceCode = (cat?.shortName ?? r.language ?? "GH").slice(0, 4).toUpperCase();
    const channelByline =
      r._firing === 3 ? "GH+R+HN" : r._firing === 2 ? "2 channels firing" : "1 channel";
    return {
      title: r.fullName,
      href: `/repo/${r.owner}/${r.name}`,
      sourceCode,
      byline: channelByline,
      scoreLabel: `${(r.crossSignalScore ?? 0).toFixed(2)} score · ${compactNumber(r.stars)}★`,
      ageHours: null,
    };
  });

  return { cards, topStories };
}
