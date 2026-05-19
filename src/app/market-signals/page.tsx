// /market-signals — Market Signals cockpit (Phase 1D).
// Wires the alive data spine onto the new HTML chrome.
//
// Reads:
//   - getSidebarSourceCounts() for source rail + KPI strip
//   - getDerivedRepos() for cross-source mentions feed + tag-momentum
//   - getNpmPackages() + getDailyDownloadsForPackage() for npm table
//   - getArxivPapersTrending() + getArxivEnrichment() for arXiv table
//   - getLastFetchedAt() for freshness pill
//
// Refresh strategy: trigger every refresh hook in parallel at top of page
// (each is internally rate-limited to 30s + in-flight-deduped), then
// read the sync getters in the rest of the render. revalidate=1800 caps
// per-edge cache at 30 min.

import { refreshTrendingFromStore, getLastFetchedAt } from "@/lib/trending";
import { getDerivedRepos } from "@/lib/derived-repos";
import { getSidebarSourceCounts } from "@/lib/sidebar-source-counts";
import { refreshNpmFromStore, getNpmPackages } from "@/lib/npm";
import { refreshArxivFromStore, getArxivPapersTrending } from "@/lib/arxiv";

import {
  SignalsHero,
  WINDOWS,
  type SignalsWindowId,
} from "@/components/market-signals/SignalsHero";
import { SignalsKpiStrip } from "@/components/market-signals/SignalsKpiStrip";
import { SourceFilterRail } from "@/components/market-signals/SourceFilterRail";
import { VolumeAreaChart } from "@/components/market-signals/VolumeAreaChart";
import { CrossSourceFeed } from "@/components/market-signals/CrossSourceFeed";
import { TagMomentumHeatmap } from "@/components/market-signals/TagMomentumHeatmap";
import { NpmAcceleratingTable } from "@/components/market-signals/NpmAcceleratingTable";
import { ArxivPapersTable } from "@/components/market-signals/ArxivPapersTable";

export const revalidate = 1800;

export const metadata = {
  title: "Market Signals — TrendingRepo",
  description:
    "Live cross-source telemetry across 30+ feeds. GitHub, X, HN, Reddit, Bluesky, npm, arXiv, ProductHunt, Dev.to, Lobsters, Hugging Face — one cockpit.",
};

interface Props {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

export default async function MarketSignalsPage({ searchParams }: Props) {
  const params = (await searchParams) ?? {};

  const rawWindow = typeof params.window === "string" ? params.window : "24h";
  const timeWindow = (WINDOWS.find((w) => w.id === rawWindow)?.id ?? "24h") as SignalsWindowId;

  const rawSrc = typeof params.src === "string" ? params.src : "";
  const selected = new Set(
    rawSrc
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );

  // Fire all refresh hooks in parallel. Each is internally rate-limited
  // to 30s so calling on every render is cheap. allSettled so a single
  // broken source doesn't take the page down.
  await Promise.allSettled([
    refreshTrendingFromStore(),
    refreshNpmFromStore(),
    refreshArxivFromStore(),
  ]);

  const counts = await getSidebarSourceCounts().catch(() => null);
  const repos = safe(() => getDerivedRepos(), []);
  const npmPackages = safe(() => getNpmPackages(), []);
  const arxivPapers = safe(() => getArxivPapersTrending(20), []);
  const fetchedAt = safe(() => getLastFetchedAt() || null, null);

  // Volume area chart totals — sourced from the alive sidebar counts.
  // GitHub uses the trending repo count as a proxy until per-day GH
  // mention bucketing lands.
  const volumeTotals = {
    github: counts ? Math.max(0, repos.length) : 0,
    x: counts?.twitterRepos ?? 0,
    reddit: counts?.redditPosts ?? 0,
    hn: counts?.hackernewsStories ?? 0,
  };

  // Live source count for the hero strip
  const sourceList = counts
    ? [
        counts.hackernewsStories,
        counts.lobstersStories,
        counts.devtoArticles,
        counts.blueskyPosts,
        counts.redditPosts,
        counts.producthuntLaunches,
        counts.fundingSignals,
        counts.npmPackages,
        counts.skillsItems,
        counts.mcpItems,
        counts.agentRepos,
        counts.twitterRepos,
        counts.hfModels,
        counts.arxivPapers,
      ]
    : [];
  const liveSources = sourceList.filter((n) => n > 0).length;
  const totalSources = sourceList.length || 30;

  // Cross-source repo count (5+ active channels)
  const crossSourceCount = repos.filter((r) => (r.channelsFiring ?? 0) >= 5).length;

  // NPM accelerating count
  const npmAccelerating = npmPackages.filter((p) => (p.deltaPct7d ?? 0) > 0).length;

  return (
    <div style={{ padding: "16px 22px 32px", maxWidth: 1500, margin: "0 auto" }}>
      <SignalsHero
        window={timeWindow}
        src={rawSrc}
        fetchedAt={fetchedAt}
        totalSources={totalSources}
        liveSources={liveSources}
      />

      <SignalsKpiStrip
        counts={counts}
        crossSourceCount={crossSourceCount}
        npmAccelerating={npmAccelerating}
        arxivPapers={counts?.arxivPapers ?? 0}
        citedRepos={counts?.citedRepos ?? 0}
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "240px minmax(0, 1fr)",
          gap: 18,
          marginTop: 6,
        }}
      >
        <SourceFilterRail selected={selected} counts={counts} window={timeWindow} />

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <VolumeAreaChart totals={volumeTotals} fetchedAt={fetchedAt} />

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr)",
              gap: 18,
            }}
          >
            <CrossSourceFeed repos={repos} minChannels={5} limit={20} />
            <TagMomentumHeatmap repos={repos} limit={28} />
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.2fr)",
              gap: 18,
            }}
          >
            <NpmAcceleratingTable packages={npmPackages} limit={7} />
            <ArxivPapersTable papers={arxivPapers} limit={6} />
          </div>
        </div>
      </div>
    </div>
  );
}
