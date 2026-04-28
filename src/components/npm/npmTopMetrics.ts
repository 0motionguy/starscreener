// V3 header builder for /npm. Maps npm package rows + registry stats
// onto the {cards, topStories} shape NewsTopHeaderV3 expects.
//
// Cards:
//   0. SNAPSHOT — packages tracked + top weekly downloads + aggregate
//   1. ACTIVITY — top 6 packages by 24h downloads (volume bars)
//   2. TOPICS   — top tokens mined from name + description
//
// Heroes: top 3 packages by 24h trend score (matches the page's default sort).

import type {
  NewsHeroStory,
  NewsMetricBar,
  NewsMetricCard,
} from "@/components/news/NewsTopHeaderV3";
import {
  applyCompactV1,
  compactNumber,
  topicBars,
} from "@/components/news/newsTopMetrics";
import { npmLogoUrl } from "@/lib/logos";
import type { NpmPackageRow, NpmPackagesFile } from "@/lib/npm";

const PKG_PALETTE = [
  "var(--v3-acc)",
  "#F59E0B",
  "#3AD6C5",
  "#F472B6",
  "#FBBF24",
  "#A78BFA",
];

function packageShortName(name: string): string {
  if (name.startsWith("@")) {
    const slash = name.indexOf("/");
    if (slash > 0) return name.slice(slash + 1);
  }
  return name;
}

export function buildNpmHeader(
  packages: NpmPackageRow[],
  file: NpmPackagesFile,
): {
  cards: [NewsMetricCard, NewsMetricCard, NewsMetricCard];
  topStories: NewsHeroStory[];
} {
  const totalWeekly = packages.reduce((s, p) => s + (p.downloads7d ?? 0), 0);
  const totalDelta24h = packages.reduce((s, p) => s + (p.delta24h ?? 0), 0);
  const top = packages
    .slice()
    .sort((a, b) => (b.downloads7d ?? 0) - (a.downloads7d ?? 0))[0];

  const volumeBars: NewsMetricBar[] = packages
    .slice()
    .sort((a, b) => (b.downloads24h ?? 0) - (a.downloads24h ?? 0))
    .slice(0, 6)
    .map((p, i) => ({
      label: packageShortName(p.name).toUpperCase(),
      value: p.downloads24h ?? 0,
      valueLabel: compactNumber(p.downloads24h ?? 0),
      hintLabel:
        (p.delta24h ?? 0) > 0
          ? `+${compactNumber(p.delta24h ?? 0)}`
          : (p.delta24h ?? 0) < 0
            ? `-${compactNumber(Math.abs(p.delta24h ?? 0))}`
            : "0",
      color: PKG_PALETTE[i % PKG_PALETTE.length],
      logoUrl: npmLogoUrl(p.linkedRepo),
      logoName: p.linkedRepo ?? p.name,
    }));

  const topics = topicBars(
    packages.map((p) => `${p.name} ${p.description ?? ""}`),
  );

  const cards: [NewsMetricCard, NewsMetricCard, NewsMetricCard] = applyCompactV1(
    [
      {
        variant: "snapshot",
        title: "// SNAPSHOT · NOW",
        rightLabel: `${packages.length} PKGS`,
        label: "PACKAGES TRACKED",
        value: compactNumber(packages.length),
        hint: `${file.counts?.linkedRepos ?? 0} REPOS LINKED`,
        rows: [
          {
            label: "TOP WEEKLY",
            value: top ? compactNumber(top.downloads7d ?? 0) : "—",
            tone: "accent",
          },
          {
            label: "AGG WEEKLY",
            value: compactNumber(totalWeekly),
          },
          {
            label: "Δ 24H",
            value:
              totalDelta24h > 0
                ? `+${compactNumber(totalDelta24h)}`
                : totalDelta24h < 0
                  ? `-${compactNumber(Math.abs(totalDelta24h))}`
                  : "0",
            tone: totalDelta24h > 0 ? "up" : totalDelta24h < 0 ? "down" : "default",
          },
        ],
      },
      {
        variant: "bars",
        title: "// VOLUME · TOP PACKAGES",
        rightLabel: "DL 24H",
        bars: volumeBars,
        labelWidth: 96,
        emptyText: "NO DOWNLOAD DATA",
      },
      {
        variant: "bars",
        title: "// TOPICS · MENTIONED MOST",
        rightLabel: `TOP ${topics.length}`,
        bars: topics,
        labelWidth: 96,
        emptyText: "NOT ENOUGH SIGNAL YET",
      },
    ],
    { topics, totalItems: packages.length },
  );

  const heroes = packages.slice(0, 3);
  const topStories: NewsHeroStory[] = heroes.map((p) => {
    const ageHours = p.publishedAt
      ? Math.max(0, (Date.now() - Date.parse(p.publishedAt)) / 3_600_000)
      : null;
    const version = p.latestVersion ? `v${p.latestVersion}` : "unreleased";
    return {
      title: p.name,
      href: p.npmUrl,
      external: true,
      sourceCode: "NPM",
      byline: p.linkedRepo ? p.linkedRepo : undefined,
      scoreLabel: `${compactNumber(p.downloads7d ?? 0)} dl/wk · ${version}`,
      ageHours,
      logoUrl: npmLogoUrl(p.linkedRepo),
      logoName: p.linkedRepo ?? p.name,
    };
  });

  return { cards, topStories };
}
