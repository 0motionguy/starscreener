// /top10 — live payload builder.
//
// Mirrors scripts/snapshot-top10.ts main() exactly so the live page renders
// the same 8-category Top10Payload the cron snapshot would write. Pulled out
// into a reusable function so both the live `/top10` route and the snapshot
// script share one source of truth — divergence between live and frozen
// would silently break the "yesterday vs today" diff badges.
//
// Each refresh hook is rate-limited and dedupe'd internally (30s window),
// so calling this on every render is cheap when warm. ISR at 60s on the
// route caps the cold-render cost.

import { getDerivedRepos } from "@/lib/derived-repos";
import { selectAgentRepos } from "@/lib/agent-repos";
import {
  getHfModelsTrending,
  refreshHfModelsFromStore,
} from "@/lib/huggingface";
import {
  getSkillsSignalData,
  getMcpSignalData,
} from "@/lib/ecosystem-leaderboards";
import {
  getHnTopStories,
  refreshHackernewsTrendingFromStore,
} from "@/lib/hackernews-trending";
import {
  getBlueskyTopPosts,
  refreshBlueskyTrendingFromStore,
} from "@/lib/bluesky-trending";
import {
  getDevtoTopArticles,
  refreshDevtoTrendingFromStore,
} from "@/lib/devto-trending";
import {
  getLobstersTopStories,
  refreshLobstersTrendingFromStore,
} from "@/lib/lobsters-trending";
import {
  getRecentLaunches,
  refreshProducthuntLaunchesFromStore,
} from "@/lib/producthunt";
import {
  getFundingSignalsThisWeek,
  refreshFundingNewsFromStore,
} from "@/lib/funding-news";
import { refreshTrendingFromStore } from "@/lib/trending";
import { refreshRecentReposFromStore } from "@/lib/recent-repos";
import {
  buildAgentTop10,
  buildFundingTop10,
  buildLlmTop10,
  buildMcpTop10,
  buildMoversTop10,
  buildNewsTop10,
  buildRepoTop10,
  buildSkillsTop10,
  emptyBundle,
  reposToSlice,
} from "./builders";
import { loadPriorTopSlugs } from "./snapshots";
import type { RepoSliceLite, Top10Payload } from "./types";

export interface LiveTop10Result {
  payload: Top10Payload;
  /** Top-80 repo slice for client-side window/metric recompute on REPOS/AGENTS/MOVERS. */
  repoSlice: RepoSliceLite[];
  /** ISO timestamp the payload was assembled. */
  computedAt: string;
}

export async function buildLiveTop10Payload(): Promise<LiveTop10Result> {
  // Hydrate the in-memory cache from Redis before reading. allSettled so a
  // single source's outage doesn't blank the page — the failing category just
  // empties out.
  await Promise.allSettled([
    refreshTrendingFromStore(),
    refreshRecentReposFromStore(),
    refreshHfModelsFromStore(),
    refreshHackernewsTrendingFromStore(),
    refreshBlueskyTrendingFromStore(),
    refreshDevtoTrendingFromStore(),
    refreshLobstersTrendingFromStore(),
    refreshProducthuntLaunchesFromStore(),
    refreshFundingNewsFromStore(),
  ]);

  const repos = getDerivedRepos();
  // Mark agents on the slice so the client-side rebuilder doesn't have to
  // re-run the agent classifier.
  const agentFullNames = new Set(
    selectAgentRepos(repos).map((r) => r.fullName),
  );

  const hfModels = getHfModelsTrending(40);
  const hn = getHnTopStories(40);
  const bsky = getBlueskyTopPosts(40);
  const devto = getDevtoTopArticles(40);
  const lobsters = getLobstersTopStories(40);
  const ph = getRecentLaunches(7, 40);
  const funding = getFundingSignalsThisWeek();

  const [skillsRes, mcpRes, priorRes] = await Promise.allSettled([
    getSkillsSignalData(),
    getMcpSignalData(),
    loadPriorTopSlugs(),
  ]);

  const skillsBoard =
    skillsRes.status === "fulfilled" ? skillsRes.value.combined : null;
  const mcpBoard = mcpRes.status === "fulfilled" ? mcpRes.value.board : null;
  const prior = priorRes.status === "fulfilled" ? priorRes.value : null;

  const payload: Top10Payload = {
    repos:
      repos.length > 0
        ? buildRepoTop10(repos, "7d", "cross-signal", {
            priorTopSlugs: prior?.repos,
          })
        : emptyBundle("7d"),
    llms:
      hfModels.length > 0
        ? buildLlmTop10(hfModels, "7d", { priorTopSlugs: prior?.llms })
        : emptyBundle("7d"),
    agents:
      repos.length > 0
        ? buildAgentTop10(repos, "7d", "cross-signal", {
            priorTopSlugs: prior?.agents,
          })
        : emptyBundle("7d"),
    mcps: buildMcpTop10(mcpBoard, "7d", { priorTopSlugs: prior?.mcps }),
    skills: buildSkillsTop10(skillsBoard, "7d", {
      priorTopSlugs: prior?.skills,
    }),
    movers:
      repos.length > 0
        ? buildMoversTop10(repos, "24h", { priorTopSlugs: prior?.movers })
        : emptyBundle("24h"),
    news: buildNewsTop10(
      {
        hn,
        bluesky: bsky,
        devto,
        lobsters,
        producthunt: ph,
      },
      { priorTopSlugs: prior?.news },
    ),
    funding:
      funding.length > 0
        ? buildFundingTop10(funding, { priorTopSlugs: prior?.funding })
        : emptyBundle("7d"),
  };

  // Top-80 repo slice with isAgent flag for client-side recompute. Annotates
  // each row so the AGENTS-from-slice path doesn't need to re-run the
  // classifier on the client.
  const repoSlice = reposToSlice(repos).map((r) => ({
    ...r,
    isAgent: agentFullNames.has(r.fullName),
  }));

  return {
    payload,
    repoSlice,
    computedAt: new Date().toISOString(),
  };
}
