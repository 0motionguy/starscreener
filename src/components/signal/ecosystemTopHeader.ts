// Helper that turns an EcosystemBoard (skills, mcp) into the
// {cards, topStories} pair NewsTopHeaderV3 expects. Mirrors the role
// buildHackerNewsHeader / buildBlueskyHeader play for news pages: same
// 3-card chrome, just sourced from the leaderboard data shape.

import type {
  NewsHeroStory,
  NewsMetricCard,
  NewsMetricBar,
} from "../news/NewsTopHeaderV3";
import {
  applyCompactV1,
  compactNumber,
  topicBars,
} from "../news/newsTopMetrics";
import { resolveLogoUrl } from "@/lib/logo-url";
import type { EcosystemLeaderboardItem } from "@/lib/ecosystem-leaderboards";

const SOURCE_PALETTE = [
  "var(--v3-acc)",
  "#3AD6C5",
  "#F59E0B",
  "#A78BFA",
  "#F472B6",
  "#FBBF24",
];

export interface EcosystemHeaderArgs {
  items: EcosystemLeaderboardItem[];
  /** Eyebrow on the snapshot card, e.g. "// SNAPSHOT · NOW". */
  snapshotEyebrow?: string;
  /** Big-number label on the snapshot card. e.g. "SKILLS TRACKED". */
  snapshotLabel: string;
  /** Right-rail status on the snapshot card. */
  snapshotRight?: string;
  /** Eyebrow on the source-volume card. */
  volumeEyebrow?: string;
  /** Eyebrow on the topics card. */
  topicsEyebrow?: string;
  /** Source-name to friendly-label override, e.g. {"skills.sh": "SKL"}. */
  sourceLabelMap?: Record<string, string>;
}

export function buildEcosystemHeader({
  items,
  snapshotEyebrow = "// SNAPSHOT · NOW",
  snapshotLabel,
  snapshotRight,
  volumeEyebrow = "// VOLUME · PER SOURCE",
  topicsEyebrow = "// TOPICS · MENTIONED MOST",
  sourceLabelMap,
}: EcosystemHeaderArgs): { cards: [NewsMetricCard, NewsMetricCard, NewsMetricCard]; topStories: NewsHeroStory[] } {
  const total = items.length;

  const top = items[0];
  const topScore = top ? Math.round(top.signalScore) : 0;
  const totalScore = items.reduce((acc, it) => acc + Math.round(it.signalScore), 0);
  const crossSourceCount = items.filter(
    (it) => it.crossSourceCount && it.crossSourceCount > 1,
  ).length;

  // Source volume — bucket items by sourceLabel, render a bar per bucket.
  const volumeMap = new Map<string, { count: number; score: number }>();
  for (const it of items) {
    const label = it.sourceLabel || "—";
    const bucket = volumeMap.get(label) ?? { count: 0, score: 0 };
    bucket.count += 1;
    bucket.score += Math.round(it.signalScore);
    volumeMap.set(label, bucket);
  }
  // Resolve a brand logo per source label so each volume row gets a tile.
  // GitHub uses its own owner avatar service; everything else goes through
  // resolveLogoUrl (Google favicons), which yields the registry's favicon
  // for skills.sh / smithery / mcp.so / etc. EntityLogo falls back to a
  // monogram when the URL is null.
  const sourceLogo = (label: string): string | null => {
    const lower = label.toLowerCase();
    if (lower === "github" || lower === "gh") {
      return "https://github.com/github.png?size=40";
    }
    // Map known ecosystem registries to their canonical home so the
    // favicon service returns a stable tile.
    const homepage =
      lower === "skills.sh" || lower === "skl" || lower === "sklsh"
        ? "https://skills.sh"
        : lower === "smithery" || lower === "smthy"
          ? "https://smithery.ai"
          : lower === "mcp.so" || lower === "mcp"
            ? "https://mcp.so"
            : lower === "claudeai" || lower === "claude"
              ? "https://claude.com"
              : `https://${label}`;
    return resolveLogoUrl(homepage, label, 64);
  };

  const volumeBars: NewsMetricBar[] = Array.from(volumeMap.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 6)
    .map(([label, bucket], i) => ({
      label: (sourceLabelMap?.[label] ?? label).toUpperCase().slice(0, 6),
      value: bucket.count,
      valueLabel: bucket.count.toLocaleString("en-US"),
      hintLabel: compactNumber(bucket.score),
      color: SOURCE_PALETTE[i % SOURCE_PALETTE.length],
      logoUrl: sourceLogo(label),
      logoName: label,
    }));

  // Topics — n-gram-ish word frequency across titles + topic + tags.
  const titleSources = items.flatMap((it) => [
    it.title,
    it.topic,
    ...(it.tags ?? []),
  ]);
  const topicRows = topicBars(titleSources.filter(Boolean), 6);

  const snapshotCard: NewsMetricCard = {
    variant: "snapshot",
    title: snapshotEyebrow,
    rightLabel: snapshotRight ?? `${total.toLocaleString("en-US")} ITEMS`,
    label: snapshotLabel,
    value: total.toLocaleString("en-US"),
    hint: `ACROSS ${volumeMap.size}/${volumeMap.size} SOURCE${
      volumeMap.size === 1 ? "" : "S"
    }`,
    rows: [
      {
        label: "Total Score",
        value: compactNumber(totalScore),
      },
      {
        label: "Top Signal",
        value: topScore.toLocaleString("en-US"),
        tone: "accent",
      },
      {
        label: "Cross-Channel",
        value: `${crossSourceCount.toLocaleString("en-US")} REPOS`,
      },
    ],
  };

  const volumeCard: NewsMetricCard = {
    variant: "bars",
    title: volumeEyebrow,
    rightLabel: `${volumeMap.size} CHANNEL${volumeMap.size === 1 ? "" : "S"}`,
    bars: volumeBars,
    emptyText: "NO VOLUME DATA",
  };

  const topicsCard: NewsMetricCard = {
    variant: "bars",
    title: topicsEyebrow,
    rightLabel: `TOP ${Math.min(6, topicRows.length)}`,
    bars: topicRows,
    emptyText: "NO TOPICS YET",
  };

  // Top 3 hero stories. Layered logo fallback matches ecosystemBoardToRows:
  // explicit logoUrl → linked-repo GitHub avatar → URL-domain favicon.
  const topStories: NewsHeroStory[] = items.slice(0, 3).map((it) => {
    const repoAvatar = it.linkedRepo
      ? `https://github.com/${encodeURIComponent(it.linkedRepo.split("/", 1)[0] ?? "")}.png?size=64`
      : null;
    const urlFavicon = resolveLogoUrl(it.url, it.title, 64);
    return {
      title: it.title,
      href: it.url,
      external: true,
      sourceCode: (sourceLabelMap?.[it.sourceLabel] ?? it.sourceLabel ?? "ITM")
        .toUpperCase()
        .slice(0, 4),
      byline: it.author ?? it.vendor ?? undefined,
      scoreLabel: `${Math.round(it.signalScore).toLocaleString("en-US")} SCORE`,
      ageHours: null,
      logoUrl: it.logoUrl ?? repoAvatar ?? urlFavicon,
      logoName: it.title,
    };
  });

  return {
    cards: applyCompactV1([snapshotCard, volumeCard, topicsCard], {
      topics: topicRows,
      totalItems: total,
    }),
    topStories,
  };
}
