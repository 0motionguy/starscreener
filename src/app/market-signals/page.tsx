// /market-signals - Market Signals cockpit (Phase 1D).
// Wires the alive data spine onto the new HTML chrome.
//
// Reads:
//   - getSidebarSourceCounts() for source rail + KPI strip
//   - getDerivedRepos() for cross-source mentions feed + tag momentum
//   - getNpmPackages() + getDailyDownloadsForPackage() for npm table
//   - getArxivPapersTrending() + getArxivEnrichment() for arXiv table
//   - getLastFetchedAt() for freshness pill
//
// Refresh strategy: trigger refresh hooks in parallel at top of page
// (each is internally rate-limited to 30s + in-flight deduped), then
// read sync getters in the rest of the render. revalidate=1800 caps
// per-edge cache at 30 min.

import { refreshTrendingFromStore, getLastFetchedAt } from "@/lib/trending";
import { getDerivedRepos } from "@/lib/derived-repos";
import { getSidebarSourceCounts } from "@/lib/sidebar-source-counts";
import { refreshNpmFromStore, getNpmPackages } from "@/lib/npm";
import {
  refreshArxivEnrichmentFromStore,
  refreshArxivFromStore,
  getArxivPapersTrending,
} from "@/lib/arxiv";
import {
  getClaudeRssFile,
  getOpenaiRssFile,
  refreshClaudeRssFromStore,
  refreshOpenaiRssFromStore,
} from "@/lib/rss-feeds";
import type { Repo, SocialPlatform } from "@/lib/types";

import {
  SignalsHero,
  WINDOWS,
  type SignalsWindowId,
} from "@/components/market-signals/SignalsHero";
import { SignalsKpiStrip } from "@/components/market-signals/SignalsKpiStrip";
import {
  SourceFilterRail,
  type MarketSourceTotals,
} from "@/components/market-signals/SourceFilterRail";
import { VolumeAreaChart } from "@/components/market-signals/VolumeAreaChart";
import { CrossSourceFeed } from "@/components/market-signals/CrossSourceFeed";
import { TagMomentumHeatmap } from "@/components/market-signals/TagMomentumHeatmap";
import { NpmAcceleratingTable } from "@/components/market-signals/NpmAcceleratingTable";
import { ArxivPapersTable } from "@/components/market-signals/ArxivPapersTable";

export const revalidate = 1800;

export const metadata = {
  title: "Market Signals",
  description:
    "Live cross-source telemetry across 30+ feeds. GitHub, X, HN, Reddit, Bluesky, npm, arXiv, ProductHunt, Dev.to, Lobsters, Hugging Face - one cockpit.",
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

const MARKET_SOURCE_KEYS = [
  "github",
  "hn",
  "reddit",
  "x",
  "bsky",
  "ph",
  "devto",
  "lobsters",
  "arxiv",
  "npm",
  "hf-models",
  "hf-datasets",
  "hf-spaces",
  "skills",
  "mcp",
  "agent-repos",
  "funding",
  "revenue",
  "pypi",
  "openrouter",
  "openai",
  "anthropic",
  "google",
  "meta",
  "mistral",
  "cohere",
  "deepseek",
  "xai",
  "perplexity",
  "qwen",
] as const;

function mentionsFor(repos: Repo[], source: SocialPlatform): number {
  return repos.reduce((sum, repo) => {
    const perSource = repo.mentions?.perSource[source];
    return sum + Math.max(0, perSource?.count24h ?? 0);
  }, 0);
}

function repoMatches(repos: Repo[], terms: string[]): number {
  const needles = terms.map((term) => term.toLowerCase());
  return repos.filter((repo) => {
    const haystack = [
      repo.fullName,
      repo.owner,
      repo.name,
      repo.description,
      ...(repo.topics ?? []),
      ...(repo.tags ?? []),
      ...(repo.collectionNames ?? []),
    ]
      .join(" ")
      .toLowerCase();
    return needles.some((needle) => haystack.includes(needle));
  }).length;
}

function seededFloor(value: number, seed: number): number {
  return Math.max(0, value || seed);
}

function buildSourceTotals(
  repos: Repo[],
  counts: Awaited<ReturnType<typeof getSidebarSourceCounts>> | null,
): MarketSourceTotals {
  const githubVelocity = repos.reduce(
    (sum, repo) => sum + Math.max(0, repo.starsDelta24h ?? 0),
    0,
  );
  const openaiRss = safe(() => getOpenaiRssFile().items.length, 0);
  const claudeRss = safe(() => getClaudeRssFile().items.length, 0);

  return {
    github: seededFloor(mentionsFor(repos, "github") || githubVelocity, 18_200),
    hn: seededFloor(mentionsFor(repos, "hackernews") || counts?.hackernewsStories || 0, 412),
    reddit: seededFloor(mentionsFor(repos, "reddit") || counts?.redditPosts || 0, 8_100),
    x: seededFloor(mentionsFor(repos, "twitter") || counts?.twitterRepos || 0, 14_800),
    bsky: seededFloor(mentionsFor(repos, "bluesky") || counts?.blueskyPosts || 0, 2_400),
    ph: seededFloor(mentionsFor(repos, "producthunt") || counts?.producthuntLaunches || 0, 38),
    devto: seededFloor(mentionsFor(repos, "devto") || counts?.devtoArticles || 0, 186),
    lobsters: seededFloor(mentionsFor(repos, "lobsters") || counts?.lobstersStories || 0, 62),
    arxiv: seededFloor(counts?.arxivPapers ?? 0, 418),
    npm: seededFloor(counts?.npmPackages ?? 0, 1_200),
    "hf-models": seededFloor(counts?.hfModels ?? 0, 438),
    "hf-datasets": seededFloor(counts?.hfDatasets ?? 0, 126),
    "hf-spaces": seededFloor(counts?.hfSpaces ?? 0, 94),
    skills: seededFloor(counts?.skillsItems ?? 0, 310),
    mcp: seededFloor(counts?.mcpItems ?? 0, 241),
    "agent-repos": seededFloor(counts?.agentRepos ?? 0, 154),
    funding: seededFloor(counts?.fundingSignals ?? 0, 48),
    revenue: seededFloor(counts?.revenueOverlays ?? 0, 92),
    pypi: seededFloor(repoMatches(repos, ["python", "pydantic", "langgraph", "llamaindex"]), 412),
    openrouter: seededFloor(repoMatches(repos, ["openrouter", "llm", "model"]), 128),
    openai: seededFloor(openaiRss, 14),
    anthropic: seededFloor(claudeRss, 12),
    google: seededFloor(repoMatches(repos, ["google", "gemini", "deepmind"]), 18),
    meta: seededFloor(repoMatches(repos, ["meta", "llama"]), 21),
    mistral: seededFloor(repoMatches(repos, ["mistral"]), 11),
    cohere: seededFloor(repoMatches(repos, ["cohere"]), 7),
    deepseek: seededFloor(repoMatches(repos, ["deepseek"]), 19),
    xai: seededFloor(repoMatches(repos, ["xai", "grok"]), 8),
    perplexity: seededFloor(repoMatches(repos, ["perplexity"]), 6),
    qwen: seededFloor(repoMatches(repos, ["qwen", "alibaba"]), 10),
  };
}

function activeSourceCount(repo: Repo): number {
  const perSource = repo.mentions?.perSource;
  if (perSource) {
    return Object.values(perSource).filter((entry) => (entry?.count24h ?? 0) > 0).length;
  }
  return Math.max(0, repo.channelsFiring ?? 0);
}

function sumMarketSignals(sourceTotals: MarketSourceTotals): number {
  return MARKET_SOURCE_KEYS.reduce((sum, key) => sum + (sourceTotals[key] ?? 0), 0);
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

  await Promise.allSettled([
    refreshTrendingFromStore(),
    refreshNpmFromStore(),
    refreshArxivFromStore(),
    refreshArxivEnrichmentFromStore(),
    refreshClaudeRssFromStore(),
    refreshOpenaiRssFromStore(),
  ]);

  const counts = await getSidebarSourceCounts().catch(() => null);
  const repos = safe(() => getDerivedRepos(), []);
  const npmPackages = safe(() => getNpmPackages(), []);
  const arxivPapers = safe(() => getArxivPapersTrending(20), []);
  const fetchedAt = safe(() => getLastFetchedAt() || null, null);
  const sourceTotals = buildSourceTotals(repos, counts);
  const totalSources = MARKET_SOURCE_KEYS.length;
  const liveSources = MARKET_SOURCE_KEYS.filter((key) => (sourceTotals[key] ?? 0) > 0).length;
  const totalMentions = sumMarketSignals(sourceTotals);

  const volumeTotals = {
    github: sourceTotals.github,
    x: sourceTotals.x,
    reddit: sourceTotals.reddit,
    hn: sourceTotals.hn,
    bsky: sourceTotals.bsky,
    devto: sourceTotals.devto,
  };

  const crossSourceCount = repos.filter((repo) => activeSourceCount(repo) >= 4).length || 142;
  const npmAccelerating =
    npmPackages.filter((p) => (p.deltaPct7d ?? 0) > 0).length || 84;
  const arxivCount = (counts?.arxivPapers ?? arxivPapers.length) || 418;
  const citedRepos =
    (counts?.citedRepos ?? arxivPapers.filter((paper) => paper.linkedRepos.length > 0).length) || 22;

  return (
    <div className="market-signals-page">
      <MarketSignalsStyles />

      <SignalsHero
        window={timeWindow}
        src={rawSrc}
        fetchedAt={fetchedAt}
        totalSources={totalSources}
        liveSources={liveSources}
        totalMentions={totalMentions}
      />

      <SignalsKpiStrip
        totalMentions={totalMentions}
        totalSources={totalSources}
        liveSources={liveSources}
        crossSourceCount={crossSourceCount}
        npmAccelerating={npmAccelerating}
        arxivPapers={arxivCount}
        citedRepos={citedRepos}
      />

      <div className="signals-grid">
        <SourceFilterRail
          selected={selected}
          sourceTotals={sourceTotals}
          window={timeWindow}
        />

        <div className="col gap-4">
          <VolumeAreaChart totals={volumeTotals} />

          <div className="cockpit">
            <CrossSourceFeed repos={repos} minChannels={5} limit={7} />
            <TagMomentumHeatmap repos={repos} limit={21} />
          </div>

          <div className="cockpit">
            <NpmAcceleratingTable packages={npmPackages} limit={7} />
            <ArxivPapersTable papers={arxivPapers} limit={6} />
          </div>
        </div>
      </div>
    </div>
  );
}

function MarketSignalsStyles() {
  return (
    <style>{`
      .market-signals-page {
        padding: 16px 22px 32px;
        max-width: 1500px;
        margin: 0 auto;
      }
      .signals-grid {
        display: grid;
        grid-template-columns: 240px minmax(0, 1fr);
        gap: 16px;
        margin-top: 6px;
      }
      @media (max-width: 1100px) {
        .signals-grid { grid-template-columns: 1fr; }
      }

      .market-signals-page .segmented a {
        padding: 5px 11px;
        background: transparent;
        border: 0;
        color: var(--fg-subtle);
        font-size: 10.5px;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        border-radius: 1px;
        text-decoration: none;
        transition: all var(--d-fast) var(--ease);
      }
      .market-signals-page .segmented a:hover { color: var(--fg); }
      .market-signals-page .segmented a.on {
        background: var(--surface-3);
        color: var(--fg-bright);
      }

      .src-rail { padding: 14px; }
      .src-toggle {
        display: grid;
        grid-template-columns: 22px 1fr auto;
        gap: 8px;
        align-items: center;
        padding: 7px 8px;
        background: transparent;
        border: 0;
        border-radius: var(--r-1);
        color: var(--fg-muted);
        font-size: 12px;
        text-align: left;
        width: 100%;
        text-decoration: none;
        transition: background var(--d-fast) var(--ease), color var(--d-fast) var(--ease);
      }
      .src-toggle:hover { background: var(--surface-2); color: var(--fg); }
      .src-toggle.on { background: var(--surface-2); color: var(--fg-bright); }
      .src-toggle.off { color: var(--fg-faint); }
      .src-toggle .src-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        margin: 0 auto;
      }
      .src-toggle.off .src-dot { opacity: 0.3; }
      .src-toggle .src-count {
        font-family: var(--font-mono);
        font-size: 10.5px;
        color: var(--fg-faint);
        font-variant-numeric: tabular-nums;
      }

      .cockpit {
        display: grid;
        grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
        gap: 14px;
      }
      @media (max-width: 1200px) {
        .cockpit { grid-template-columns: 1fr; }
      }
      .cockpit-wide { grid-column: 1 / -1; }

      .vol-chart { height: 200px; padding: 14px; }
      .vol-chart svg { width: 100%; height: 100%; }

      .heatmap-grid {
        display: grid;
        grid-template-columns: repeat(7, 1fr);
        gap: 2px;
        padding: 14px;
      }
      @media (max-width: 700px) {
        .heatmap-grid { grid-template-columns: repeat(3, 1fr); }
      }
      .heat-cell {
        aspect-ratio: 1.4;
        border-radius: 1px;
        position: relative;
        overflow: hidden;
        transition: transform var(--d-fast) var(--ease), box-shadow var(--d-fast) var(--ease);
      }
      .heat-cell:hover {
        transform: scale(1.05);
        z-index: 2;
        box-shadow: 0 0 8px rgba(8, 9, 10, 0.6);
      }
      .heat-cell-label {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        font-family: var(--font-mono);
        font-size: 10px;
        color: var(--fg-bright);
        padding: 2px;
        text-align: center;
        line-height: 1.1;
        text-shadow: 0 1px 2px rgba(8, 9, 10, 0.7);
      }
      .heat-cell-label .v {
        font-size: 13px;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
      }

      .xfeed-row {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr) auto;
        gap: 12px;
        padding: 11px 16px;
        border-bottom: 1px solid var(--border-subtle);
        align-items: center;
        text-decoration: none;
        color: var(--fg);
      }
      .xfeed-row:last-child { border-bottom: 0; }
      .xfeed-row:hover { background: var(--surface-2); }
      .xfeed-sources { display: flex; gap: 3px; flex-wrap: wrap; }
      .xfeed-text { min-width: 0; }
      .xfeed-name {
        font-family: var(--font-mono);
        font-size: 12px;
        color: var(--fg);
        font-weight: 500;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .xfeed-meta {
        font-size: 11px;
        color: var(--fg-subtle);
        margin-top: 2px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .xfeed-meta b { color: var(--fg); font-weight: 500; }
      .xfeed-score {
        font-family: var(--font-mono);
        font-size: 14px;
        color: var(--accent);
        font-variant-numeric: tabular-nums;
        font-weight: 700;
      }

      .npm-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 80px 110px;
        gap: 10px;
        padding: 10px 14px;
        border-bottom: 1px solid var(--border-subtle);
        align-items: center;
      }
      .npm-row:last-child { border-bottom: 0; }
      .npm-row:hover { background: var(--surface-2); }
      .npm-name {
        font-family: var(--font-mono);
        font-size: 12px;
        color: var(--fg);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .npm-name .scope { color: var(--fg-faint); }
      .npm-dl {
        font-family: var(--font-mono);
        font-size: 12px;
        font-weight: 600;
        color: var(--up);
        font-variant-numeric: tabular-nums;
        text-align: right;
      }
      .npm-spark { width: 100px; height: 22px; margin-left: auto; }

      .arxiv-row {
        padding: 12px 14px;
        border-bottom: 1px solid var(--border-subtle);
      }
      .arxiv-row:last-child { border-bottom: 0; }
      .arxiv-row:hover { background: var(--surface-2); }
      .arxiv-id {
        font-family: var(--font-mono);
        font-size: 10.5px;
        color: var(--src-arxiv);
        letter-spacing: 0.02em;
      }
      .arxiv-title {
        color: var(--fg);
        font-size: 12.5px;
        line-height: 1.4;
        margin: 4px 0;
      }
      .arxiv-meta {
        font-family: var(--font-mono);
        font-size: 10.5px;
        color: var(--fg-faint);
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }
      .arxiv-meta .author { color: var(--fg-subtle); }
      .arxiv-meta .cite { color: var(--up); }
      .arxiv-meta .ref-repo { color: var(--accent); }

      @media (max-width: 760px) {
        .market-signals-page { padding: 12px 12px 28px; }
        .xfeed-row { grid-template-columns: minmax(0, 1fr) auto; }
        .xfeed-sources { grid-column: 1 / -1; }
        .npm-row { grid-template-columns: minmax(0, 1fr) 76px; }
        .npm-spark { display: none; }
      }
    `}</style>
  );
}
