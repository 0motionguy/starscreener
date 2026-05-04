// Sidebar source counts — server-side helper that returns one count per
// data source for the sidebar count badges. Triggers each source's
// refresh-from-store hook in parallel (each is rate-limited to 30s
// internally, so calling on every sidebar fetch is cheap), then reads
// the in-memory file shape and reports `.length`.
//
// Two semantic groups:
//   feedDeltas — rolling-window feeds. The count is "items in window"
//     (HN: 72h, Lobsters: 72h, Bluesky/Reddit/Devto: per-source window,
//     PH/arXiv/Funding: as collected). Rendered as `+N` accent chip.
//   collections — cumulative inventories. Rendered as `N` neutral chip.
//
// Twitter is intentionally omitted for now: the per-repo signals live
// in JSONL append-only logs, not a single trending payload — surfacing
// a "fresh tweets" count requires its own aggregation pass.

import { getHnTrendingFile, refreshHackernewsTrendingFromStore } from "./hackernews-trending";
import { getLobstersTrendingFile, refreshLobstersTrendingFromStore } from "./lobsters-trending";
import { getDevtoTrendingFile, refreshDevtoTrendingFromStore } from "./devto-trending";
import { getBlueskyTrendingFile, refreshBlueskyTrendingFromStore } from "./bluesky-trending";
import {
  getAllPostsFile,
  refreshRedditAllPostsFromStore,
} from "./reddit-all-data";
import { getPhFile, refreshProducthuntLaunchesFromStore } from "./producthunt";
import { getFundingSignals, refreshFundingNewsFromStore } from "./funding-news";
import {
  getRevenueOverlaysMeta,
  refreshRevenueOverlaysFromStore,
} from "./revenue-overlays";
import { getNpmPackagesFile, refreshNpmFromStore } from "./npm";
import { getHfTrendingFile, refreshHfModelsFromStore } from "./huggingface";
import { getHfDatasetsFile, refreshHfDatasetsFromStore } from "./hf-datasets";
import { getHfSpacesFile, refreshHfSpacesFromStore } from "./hf-spaces";
import { getArxivRecentFile, refreshArxivFromStore } from "./arxiv";
import { getSkillsSignalData, getMcpSignalData } from "./ecosystem-leaderboards";
import { selectAgentRepos } from "./agent-repos";
import { getDerivedRepos } from "./derived-repos";
import { getTwitterOverviewStats } from "./twitter";

export interface SidebarSourceCounts {
  // Feed deltas — rendered as `+N` accent chip.
  hackernewsStories: number;
  lobstersStories: number;
  devtoArticles: number;
  blueskyPosts: number;
  redditPosts: number;
  producthuntLaunches: number;
  // Collections — rendered as neutral count.
  fundingSignals: number;
  revenueOverlays: number;
  npmPackages: number;
  // Phase 2 — sidebar-fresh-count-badges. Snapshot totals; the client
  // hook diffs against `lastSeen.<routeKey>` to render fresh deltas.
  skillsItems: number;
  mcpItems: number;
  agentRepos: number;
  twitterRepos: number;
  hfModels: number;
  hfDatasets: number;
  hfSpaces: number;
  arxivPapers: number;
  citedRepos: number;
}

const ZERO_COUNTS: SidebarSourceCounts = {
  hackernewsStories: 0,
  lobstersStories: 0,
  devtoArticles: 0,
  blueskyPosts: 0,
  redditPosts: 0,
  producthuntLaunches: 0,
  fundingSignals: 0,
  revenueOverlays: 0,
  npmPackages: 0,
  skillsItems: 0,
  mcpItems: 0,
  agentRepos: 0,
  twitterRepos: 0,
  hfModels: 0,
  hfDatasets: 0,
  hfSpaces: 0,
  arxivPapers: 0,
  citedRepos: 0,
};

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

async function safeAsync<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

export async function getSidebarSourceCounts(): Promise<SidebarSourceCounts> {
  // Fire all refresh hooks in parallel. Each one is rate-limited to 30s
  // internally and will return { source: "memory", ... } when fresh.
  // Skills + MCP signal-data getters do their own internal store reads
  // and are awaited below (not part of this allSettled set).
  await Promise.allSettled([
    refreshHackernewsTrendingFromStore(),
    refreshLobstersTrendingFromStore(),
    refreshDevtoTrendingFromStore(),
    refreshBlueskyTrendingFromStore(),
    refreshRedditAllPostsFromStore(),
    refreshProducthuntLaunchesFromStore(),
    refreshFundingNewsFromStore(),
    refreshRevenueOverlaysFromStore(),
    refreshNpmFromStore(),
    refreshHfModelsFromStore(),
    refreshHfDatasetsFromStore(),
    refreshHfSpacesFromStore(),
    refreshArxivFromStore(),
  ]);

  const npmFile = safe(() => getNpmPackagesFile(), null);
  const npmCount =
    npmFile?.counts?.total ??
    (Array.isArray(npmFile?.packages) ? npmFile.packages.length : 0);

  const overlaysMeta = safe(() => getRevenueOverlaysMeta(), null);
  const overlaysCount = overlaysMeta?.matchedCount ?? 0;

  // Phase 2 — pull snapshot counts for routes that previously had no
  // sidebar badge. Each is wrapped in safeAsync so a single broken store
  // read doesn't take the whole sidebar down.
  const [skillsData, mcpData, twitterStats] = await Promise.all([
    safeAsync(() => getSkillsSignalData(), null),
    safeAsync(() => getMcpSignalData(), null),
    safeAsync(() => getTwitterOverviewStats(), null),
  ]);

  const allRepos = safe(() => getDerivedRepos(), []);
  const agentRepoCount = safe(() => selectAgentRepos(allRepos).length, 0);

  // Cited repos = arxiv papers that link to a tracked GitHub repo.
  const arxivPapers = safe(
    () => (getArxivRecentFile().papers ?? []).length,
    0,
  );
  const citedRepos = safe(() => {
    const papers = getArxivRecentFile().papers ?? [];
    return papers.filter(
      (p) => Array.isArray(p?.linkedRepos) && p.linkedRepos.length > 0,
    ).length;
  }, 0);

  return {
    hackernewsStories: safe(() => getHnTrendingFile().stories.length, 0),
    lobstersStories: safe(() => getLobstersTrendingFile().stories.length, 0),
    devtoArticles: safe(() => getDevtoTrendingFile().articles.length, 0),
    blueskyPosts: safe(() => getBlueskyTrendingFile().posts.length, 0),
    redditPosts: safe(() => getAllPostsFile().posts.length, 0),
    producthuntLaunches: safe(() => getPhFile().launches.length, 0),
    fundingSignals: safe(() => getFundingSignals().length, 0),
    revenueOverlays: overlaysCount,
    npmPackages: npmCount,
    skillsItems: skillsData?.combined?.items?.length ?? 0,
    mcpItems: mcpData?.board?.items?.length ?? 0,
    agentRepos: agentRepoCount,
    twitterRepos: twitterStats?.reposWithMentions ?? 0,
    hfModels: safe(() => (getHfTrendingFile().models ?? []).length, 0),
    hfDatasets: safe(() => (getHfDatasetsFile().datasets ?? []).length, 0),
    hfSpaces: safe(() => (getHfSpacesFile().spaces ?? []).length, 0),
    arxivPapers,
    citedRepos,
  };
}

export function emptySidebarSourceCounts(): SidebarSourceCounts {
  return { ...ZERO_COUNTS };
}
