// TrendingRepo — /top10
//
// TOOL · 05. Pick a category, snapshot a chart, and post it. Eight rankings
// (REPOS · LLMS · AGENTS · MCPS · SKILLS · MOVERS · NEWS · FUNDING) backed
// by the live corpus, each renderable as a 4-aspect share card.
//
// All readers are wired to the data-store. Async refresh hooks run in
// parallel up front so a fresh Redis payload swaps in before the sync
// getters fire; everything degrades to bundled JSON when Redis is absent.
// Promise.allSettled on the refreshes means a single failed source can't
// block the page.

import type { Metadata } from "next";

import { getDerivedRepos } from "@/lib/derived-repos";
import { getHfModelsTrending, refreshHfModelsFromStore } from "@/lib/huggingface";
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

import { SITE_NAME, absoluteUrl } from "@/lib/seo";
import { AGENT_REPO_SET } from "@/lib/agent-repos";
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
} from "@/lib/top10/builders";
import {
  CATEGORY_META,
  type RepoSliceLite,
  type Top10Payload,
} from "@/lib/top10/types";
import { Top10Page } from "@/components/top10/Top10Page";

// 30-min ISR — same cadence as homepage; underlying readers refresh every
// 6 hours via cron, so a tighter cache wastes work without buying freshness.
export const revalidate = 1800;

const TITLE = `Top 10 — ${SITE_NAME}`;
const DESCRIPTION =
  "Top 10 across eight surfaces — repos, LLMs, agents, MCPs, skills, movers, news, funding. One-click share to X, IG, YT, Square. Updated every 6 hours.";
const OG_IMAGE = absoluteUrl("/api/og/top10?cat=repos&window=7d&aspect=h");

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: absoluteUrl("/top10") },
  openGraph: {
    type: "website",
    url: absoluteUrl("/top10"),
    title: TITLE,
    description: DESCRIPTION,
    siteName: SITE_NAME,
    images: [
      {
        url: OG_IMAGE,
        width: 1200,
        height: 675,
        alt: "TrendingRepo — Top 10 across eight surfaces",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: [OG_IMAGE],
  },
};

export default async function Top10RootPage() {
  // Refresh all async sources in parallel. Each call is rate-limited (30s
  // floor) and never throws — Promise.allSettled is belt + braces in case
  // a future revision regresses that contract.
  await Promise.allSettled([
    refreshHfModelsFromStore(),
    refreshHackernewsTrendingFromStore(),
    refreshBlueskyTrendingFromStore(),
    refreshDevtoTrendingFromStore(),
    refreshLobstersTrendingFromStore(),
    refreshProducthuntLaunchesFromStore(),
    refreshFundingNewsFromStore(),
  ]);

  // Sync getters now read from the in-memory cache the refreshes just primed.
  // getDerivedRepos drives REPOS / AGENTS / MOVERS in one pass.
  const repos = getDerivedRepos();
  const hfModels = getHfModelsTrending(40);
  const hn = getHnTopStories(40);
  const bsky = getBlueskyTopPosts(40);
  const devto = getDevtoTopArticles(40);
  const lobsters = getLobstersTopStories(40);
  const ph = getRecentLaunches(7, 40);
  const funding = getFundingSignalsThisWeek();

  const [skillsRes, mcpRes] = await Promise.allSettled([
    getSkillsSignalData(),
    getMcpSignalData(),
  ]);

  const skillsBoard =
    skillsRes.status === "fulfilled" ? skillsRes.value.combined : null;
  const mcpBoard = mcpRes.status === "fulfilled" ? mcpRes.value.board : null;

  // Build all 8 bundles. Each builder handles empty input gracefully (returns
  // an emptyBundle when its slice is empty) so the page still renders even on
  // a cold lambda with no Redis.
  const payload: Top10Payload = {
    repos: repos.length > 0 ? buildRepoTop10(repos, "7d") : emptyBundle("7d"),
    llms: hfModels.length > 0 ? buildLlmTop10(hfModels, "7d") : emptyBundle("7d"),
    agents: repos.length > 0 ? buildAgentTop10(repos, "7d") : emptyBundle("7d"),
    mcps: buildMcpTop10(mcpBoard, "7d"),
    skills: buildSkillsTop10(skillsBoard, "7d"),
    movers:
      repos.length > 0 ? buildMoversTop10(repos, "24h") : emptyBundle("24h"),
    news: buildNewsTop10({
      hn,
      bluesky: bsky,
      devto,
      lobsters,
      producthunt: ph,
    }),
    funding: funding.length > 0 ? buildFundingTop10(funding) : emptyBundle("7d"),
  };

  // Top-80 repo slice for client-side window/metric switching of REPOS /
  // AGENTS / MOVERS. Tag agents up-front so the client doesn't need to
  // re-import the AGENT_REPO_SET. ~30 KB serialised — cheaper than pre-baking
  // every (window, metric) combination server-side.
  const repoSlice: RepoSliceLite[] =
    repos.length > 0
      ? reposToSlice(repos, 80).map((r) => ({
          ...r,
          isAgent: AGENT_REPO_SET.has(r.fullName.toLowerCase()),
        }))
      : [];

  return (
    <Top10Page
      payload={payload}
      categoryMeta={CATEGORY_META}
      repoSlice={repoSlice}
    />
  );
}
