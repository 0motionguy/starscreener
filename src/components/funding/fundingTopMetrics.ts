// V3 header builder for /funding. Maps funding signals + stats onto
// the {cards, topStories} shape NewsTopHeaderV3 expects.
//
// Cards:
//   0. SNAPSHOT — total signals + this week + extracted ratio
//   1. ACTIVITY — signals per 4h window over the last 24h
//   2. ROUNDS   — top round-types in window (Series A/B/Seed/etc.)
//
// Heroes: top 3 signals — biggest amount when extracted, freshest otherwise.

import type {
  NewsHeroStory,
  NewsMetricBar,
  NewsMetricCard,
} from "@/components/news/NewsTopHeaderV3";
import {
  activityBars,
  applyCompactV1,
  compactNumber,
} from "@/components/news/newsTopMetrics";
import type {
  FundingSignal,
  FundingStats,
} from "@/lib/funding/types";

function formatTopRound(sig: FundingSignal | null | undefined): string {
  if (!sig) return "—";
  const ext = sig.extracted;
  const amount = ext?.amountDisplay ?? "—";
  const round = ext?.roundType ? String(ext.roundType).toUpperCase() : null;
  return round ? `${amount} ${round}` : amount;
}

const ROUND_PALETTE = [
  "var(--v3-acc)",
  "#F59E0B",
  "#3AD6C5",
  "#F472B6",
  "#FBBF24",
  "#A78BFA",
];

export function buildFundingHeader(
  signals: FundingSignal[],
  stats: FundingStats,
): {
  cards: [NewsMetricCard, NewsMetricCard, NewsMetricCard];
  topStories: NewsHeroStory[];
} {
  // Activity bars — bucket signals by publishedAt over last 24h.
  const activity = activityBars(
    signals.map((s) => ({
      tsSec: s.publishedAt ? Date.parse(s.publishedAt) / 1000 : 0,
      weight: s.extracted?.amount ?? 0,
    })),
  );

  // Round-type distribution — pull from extracted.roundType when present.
  const roundCounts = new Map<string, number>();
  for (const sig of signals) {
    const rt = sig.extracted?.roundType;
    if (!rt) continue;
    const key = String(rt);
    roundCounts.set(key, (roundCounts.get(key) ?? 0) + 1);
  }
  const roundBars: NewsMetricBar[] = Array.from(roundCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([rt, count], i) => ({
      label: rt.toUpperCase(),
      value: count,
      valueLabel: count.toLocaleString("en-US"),
      color: ROUND_PALETTE[i % ROUND_PALETTE.length],
    }));

  const extractedRatio =
    stats.totalSignals > 0
      ? Math.round((stats.extractedSignals / stats.totalSignals) * 100)
      : 0;

  const cards: [NewsMetricCard, NewsMetricCard, NewsMetricCard] = applyCompactV1(
    [
      {
        variant: "snapshot",
        title: "// SNAPSHOT · NOW",
        rightLabel: `${stats.totalSignals} SIGNALS`,
        label: "ROUNDS TRACKED",
        value: compactNumber(stats.totalSignals),
        hint: `${stats.thisWeekCount} THIS WEEK`,
        rows: [
          {
            // Includes round type so the dollar figure has identity ("$50M
            // SERIES B" not just "$50M"). Falls back to amount alone when the
            // extractor couldn't pin a round type.
            label: "TOP ROUND",
            value: formatTopRound(stats.topRound),
            tone: "accent",
          },
          {
            label: "EXTRACTED",
            value: `${extractedRatio}%`,
          },
          {
            label: "AGGREGATE",
            value:
              stats.totalAmountUsd && stats.totalAmountUsd > 0
                ? `$${compactNumber(stats.totalAmountUsd)}`
                : "—",
          },
        ],
      },
      {
        variant: "bars",
        title: "// VOLUME · LAST 24H",
        bars: [],
        labelWidth: 48,
        emptyText: "NO RECENT SIGNALS",
      },
      {
        variant: "bars",
        title: "// ROUNDS · DISTRIBUTION",
        rightLabel: `TOP ${roundBars.length}`,
        bars: roundBars,
        labelWidth: 88,
        emptyText: "NO STRUCTURED ROUNDS",
      },
    ],
    { activity, topics: roundBars, totalItems: stats.totalSignals },
  );

  // Heroes: prefer biggest extracted amount, fall back to freshest.
  const sorted = signals.slice().sort((a, b) => {
    const av = a.extracted?.amount ?? 0;
    const bv = b.extracted?.amount ?? 0;
    if (av !== bv) return bv - av;
    return Date.parse(b.publishedAt) - Date.parse(a.publishedAt);
  });
  const topStories: NewsHeroStory[] = sorted.slice(0, 3).map((sig) => {
    const ext = sig.extracted;
    const company = ext?.companyName ?? sig.headline.slice(0, 60);
    const amount = ext?.amountDisplay ?? "Undisclosed";
    const round = ext?.roundType ? String(ext.roundType).toUpperCase() : null;
    const score = round ? `${amount} · ${round}` : amount;
    const ageHours = sig.publishedAt
      ? Math.max(0, (Date.now() - Date.parse(sig.publishedAt)) / 3_600_000)
      : null;
    return {
      title: ext ? `${company} raised ${amount}` : sig.headline,
      href: sig.sourceUrl,
      external: true,
      sourceCode: sig.sourcePlatform.slice(0, 2).toUpperCase(),
      byline: ext?.investors?.[0] ? `lead: ${ext.investors[0]}` : sig.sourcePlatform,
      scoreLabel: score,
      ageHours,
    };
  });

  return { cards, topStories };
}
