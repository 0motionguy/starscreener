// Shared resolver for a Top10Bundle from live data — used by both the
// `/api/og/top10` route and the `/tools/top-10` page fallback so the two
// surfaces can never drift on ranking when no daily snapshot exists.
//
// Snapshot-first reads live in the caller; this is only the *fallback* path
// that runs when no cron-baked snapshot is available for the requested date.

import { getDerivedRepos } from "@/lib/derived-repos";
import {
  getBlueskyTopPosts,
  refreshBlueskyTrendingFromStore,
} from "@/lib/bluesky-trending";
import {
  getDevtoTopArticles,
  refreshDevtoTrendingFromStore,
} from "@/lib/devto-trending";
import {
  getFundingSignalsThisWeek,
  refreshFundingNewsFromStore,
} from "@/lib/funding-news";
import {
  getHnTopStories,
  refreshHackernewsTrendingFromStore,
} from "@/lib/hackernews-trending";
import {
  getLobstersTopStories,
  refreshLobstersTrendingFromStore,
} from "@/lib/lobsters-trending";
import {
  getRecentLaunches,
  refreshProducthuntLaunchesFromStore,
} from "@/lib/producthunt";

import {
  buildAgentTop10,
  buildFundingTop10,
  buildMoversTop10,
  buildNewsTop10,
  buildRepoTop10,
  emptyBundle,
} from "./builders";
import type { Top10Bundle, Top10Category, Top10Window } from "./types";

export async function resolveBundle(
  category: Top10Category,
  window: Top10Window,
): Promise<Top10Bundle> {
  switch (category) {
    case "repos":
    case "agents":
    case "movers": {
      const repos = getDerivedRepos();
      if (category === "repos") return buildRepoTop10(repos, window);
      if (category === "agents") return buildAgentTop10(repos, window);
      return buildMoversTop10(repos, window);
    }
    case "llms": {
      // Wave 4 will populate from the AA leaderboard. Empty until then.
      return emptyBundle(window);
    }
    case "news": {
      await Promise.allSettled([
        refreshHackernewsTrendingFromStore(),
        refreshBlueskyTrendingFromStore(),
        refreshDevtoTrendingFromStore(),
        refreshLobstersTrendingFromStore(),
        refreshProducthuntLaunchesFromStore(),
      ]);
      return buildNewsTop10({
        hn: getHnTopStories(40),
        bluesky: getBlueskyTopPosts(40),
        devto: getDevtoTopArticles(40),
        lobsters: getLobstersTopStories(40),
        producthunt: getRecentLaunches(7, 40),
      });
    }
    case "funding": {
      await refreshFundingNewsFromStore().catch(() => undefined);
      const signals = getFundingSignalsThisWeek();
      return signals.length > 0
        ? buildFundingTop10(signals)
        : emptyBundle("7d");
    }
  }
}
