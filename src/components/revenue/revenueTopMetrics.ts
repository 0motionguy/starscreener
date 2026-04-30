// V3 header builder for /revenue. Maps the verified-revenue leaderboard
// onto the {cards, topStories} shape NewsTopHeaderV3 expects.
//
// Cards:
//   0. SNAPSHOT — startups tracked + top MRR + aggregate MRR + tracked-repo matches
//   1. TIERS    — distribution of startups across MRR bands (mini-leaderboard)
//   2. CATS     — top categories by startup count
//
// Heroes: top 3 startups by MRR, linking to the TrustMRR profile.

import type {
  NewsHeroStory,
  NewsMetricBar,
  NewsMetricCard,
} from "@/components/news/NewsTopHeaderV3";
import { applyCompactV1, compactNumber } from "@/components/news/newsTopMetrics";
import type { VerifiedStartup } from "@/lib/revenue-startups";
import { trustmrrProfileUrl } from "@/lib/trustmrr-url";

const TIER_PALETTE = [
  "var(--v4-acc)",
  "#F59E0B",
  "#3AD6C5",
  "#F472B6",
  "#FBBF24",
  "#A78BFA",
];

const CATEGORY_PALETTE = [
  "var(--v4-acc)",
  "#F472B6",
  "#3AD6C5",
  "#F59E0B",
  "#A78BFA",
  "#FBBF24",
  "#34D399",
  "#FB923C",
];

interface MrrTier {
  label: string;
  /** Min MRR in dollars (inclusive). */
  min: number;
}

const TIERS: MrrTier[] = [
  { label: "$1M+", min: 1_000_000 },
  { label: "$100K+", min: 100_000 },
  { label: "$10K+", min: 10_000 },
  { label: "$1K+", min: 1_000 },
  { label: "<$1K", min: 0 },
];

function formatUsd(cents: number | null): string {
  if (cents === null || !Number.isFinite(cents) || cents <= 0) return "—";
  const dollars = cents / 100;
  if (dollars >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(1)}M`;
  if (dollars >= 10_000) return `$${Math.round(dollars / 1_000)}K`;
  if (dollars >= 1_000) return `$${(dollars / 1_000).toFixed(1)}K`;
  return `$${Math.round(dollars).toLocaleString("en-US")}`;
}

export interface RevenueHeaderInput {
  rows: VerifiedStartup[];
  totalInFilter: number;
  totalMrrCents: number;
  topMrrCents: number;
  trackedMatches: number;
}

export function buildRevenueHeader(input: RevenueHeaderInput): {
  cards: [NewsMetricCard, NewsMetricCard, NewsMetricCard];
  topStories: NewsHeroStory[];
} {
  const { rows, totalInFilter, totalMrrCents, topMrrCents, trackedMatches } = input;

  // MRR-tier distribution — count rows in each band, top → bottom.
  const tierCounts = TIERS.map(() => 0);
  for (const r of rows) {
    const dollars = r.mrrCents / 100;
    for (let i = 0; i < TIERS.length; i++) {
      if (dollars >= TIERS[i].min) {
        tierCounts[i] += 1;
        break;
      }
    }
  }
  const tierBars: NewsMetricBar[] = TIERS.map((t, i) => ({
    label: t.label.toUpperCase(),
    value: tierCounts[i],
    valueLabel: tierCounts[i].toLocaleString("en-US"),
    color: TIER_PALETTE[i % TIER_PALETTE.length],
  })).filter((b) => b.value > 0);

  // Category distribution — top 6 categories by startup count.
  const catCounts = new Map<string, number>();
  for (const r of rows) {
    const key = r.category ?? "Uncategorized";
    catCounts.set(key, (catCounts.get(key) ?? 0) + 1);
  }
  const catBars: NewsMetricBar[] = Array.from(catCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([cat, count], i) => ({
      label: cat.toUpperCase(),
      value: count,
      valueLabel: count.toLocaleString("en-US"),
      color: CATEGORY_PALETTE[i % CATEGORY_PALETTE.length],
    }));

  const cards: [NewsMetricCard, NewsMetricCard, NewsMetricCard] = applyCompactV1(
    [
      {
        variant: "snapshot",
        title: "// SNAPSHOT · NOW",
        rightLabel: `${totalInFilter} STARTUPS`,
        label: "STARTUPS TRACKED",
        value: compactNumber(totalInFilter),
        hint: `${trackedMatches} TRACKED-REPO MATCH${trackedMatches === 1 ? "" : "ES"}`,
        rows: [
          { label: "TOP MRR", value: formatUsd(topMrrCents), tone: "accent" },
          { label: "AGGREGATE MRR", value: formatUsd(totalMrrCents) },
          { label: "CATEGORIES", value: compactNumber(catCounts.size) },
        ],
      },
      {
        variant: "bars",
        title: "// TIERS · BY MRR BAND",
        rightLabel: `${rows.length} ROWS`,
        bars: tierBars,
        labelWidth: 64,
        emptyText: "NO STARTUPS IN FILTER",
      },
      {
        variant: "bars",
        title: "// CATEGORIES · TOP",
        rightLabel: `TOP ${catBars.length}`,
        bars: catBars,
        labelWidth: 120,
        emptyText: "NO CATEGORIES YET",
      },
    ],
    { topics: catBars, totalItems: totalInFilter },
  );

  const topStories: NewsHeroStory[] = rows
    .slice()
    .sort((a, b) => b.mrrCents - a.mrrCents)
    .slice(0, 3)
    .map((s) => {
      const growth =
        typeof s.growthMrr30d === "number" && Number.isFinite(s.growthMrr30d)
          ? Math.round(s.growthMrr30d * 10) / 10
          : null;
      const growthChip =
        growth === null ? null : growth > 0 ? `+${growth}% 30D` : `${growth}% 30D`;
      const score = growthChip
        ? `${formatUsd(s.mrrCents)} MRR · ${growthChip}`
        : `${formatUsd(s.mrrCents)} MRR`;
      let href: string;
      try {
        href = trustmrrProfileUrl(s.slug);
      } catch {
        href = s.website ?? "https://trustmrr.com/";
      }
      const byline = s.matchedRepoFullName
        ? s.matchedRepoFullName
        : s.category ?? (s.xHandle ? `@${s.xHandle}` : undefined);
      return {
        title: s.description ? `${s.name} — ${s.description}` : s.name,
        href,
        external: true,
        sourceCode: "RV",
        byline,
        scoreLabel: score,
        ageHours: null,
      };
    });

  return { cards, topStories };
}
