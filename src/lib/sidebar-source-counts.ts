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
import { getArxivTrendingFile, refreshArxivTrendingFromStore } from "./arxiv-trending";
import { getFundingSignals, refreshFundingNewsFromStore } from "./funding-news";
import {
  getRevenueOverlaysMeta,
  refreshRevenueOverlaysFromStore,
} from "./revenue-overlays";
import { getNpmPackagesFile, refreshNpmFromStore } from "./npm";

export interface SidebarSourceCounts {
  // Feed deltas — rendered as `+N` accent chip.
  hackernewsStories: number;
  lobstersStories: number;
  devtoArticles: number;
  blueskyPosts: number;
  redditPosts: number;
  producthuntLaunches: number;
  arxivPapers: number;
  // Collections — rendered as neutral count.
  fundingSignals: number;
  revenueOverlays: number;
  npmPackages: number;
}

const ZERO_COUNTS: SidebarSourceCounts = {
  hackernewsStories: 0,
  lobstersStories: 0,
  devtoArticles: 0,
  blueskyPosts: 0,
  redditPosts: 0,
  producthuntLaunches: 0,
  arxivPapers: 0,
  fundingSignals: 0,
  revenueOverlays: 0,
  npmPackages: 0,
};

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

export async function getSidebarSourceCounts(): Promise<SidebarSourceCounts> {
  // Fire all refresh hooks in parallel. Each one is rate-limited to 30s
  // internally and will return { source: "memory", ... } when fresh.
  await Promise.allSettled([
    refreshHackernewsTrendingFromStore(),
    refreshLobstersTrendingFromStore(),
    refreshDevtoTrendingFromStore(),
    refreshBlueskyTrendingFromStore(),
    refreshRedditAllPostsFromStore(),
    refreshProducthuntLaunchesFromStore(),
    refreshArxivTrendingFromStore(),
    refreshFundingNewsFromStore(),
    refreshRevenueOverlaysFromStore(),
    refreshNpmFromStore(),
  ]);

  const npmFile = safe(() => getNpmPackagesFile(), null);
  const npmCount =
    npmFile?.counts?.total ??
    (Array.isArray(npmFile?.packages) ? npmFile.packages.length : 0);

  const overlaysMeta = safe(() => getRevenueOverlaysMeta(), null);
  const overlaysCount = overlaysMeta?.matchedCount ?? 0;

  return {
    hackernewsStories: safe(() => getHnTrendingFile().stories.length, 0),
    lobstersStories: safe(() => getLobstersTrendingFile().stories.length, 0),
    devtoArticles: safe(() => getDevtoTrendingFile().articles.length, 0),
    blueskyPosts: safe(() => getBlueskyTrendingFile().posts.length, 0),
    redditPosts: safe(() => getAllPostsFile().posts.length, 0),
    producthuntLaunches: safe(() => getPhFile().launches.length, 0),
    arxivPapers: safe(() => getArxivTrendingFile().papers.length, 0),
    fundingSignals: safe(() => getFundingSignals().length, 0),
    revenueOverlays: overlaysCount,
    npmPackages: npmCount,
  };
}

export function emptySidebarSourceCounts(): SidebarSourceCounts {
  return { ...ZERO_COUNTS };
}
