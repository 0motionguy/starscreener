// TrendingRepo — /top10 (LIVE)
//
// Community share tool. Renders the full operator-terminal Top 10 surface
// (CategoryTabs · ranking panel · ShareStack · MoreGrid) via the Top10Page
// client component, with all eight category bundles composed server-side
// from the live data-store readers. Mirrors scripts/snapshot-top10.ts so
// the live route and the cron snapshot stay byte-identical at fetch time.
//
// Repo-derived categories (REPOS / AGENTS / MOVERS) ship a 80-row repoSlice
// alongside the SSR payload, which lets the client recompute window/metric
// switches without a round-trip.
//
// Frozen historical views live at /top10/[date] and pass repoSlice=[] (no
// client-side recompute on a frozen view).

import type { Metadata } from "next";

import { getDerivedRepos } from "@/lib/derived-repos";
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
import { CATEGORY_META, type Top10Payload } from "@/lib/top10/types";

import { SITE_NAME, absoluteUrl } from "@/lib/seo";
import { Top10Page } from "@/components/top10/Top10Page";
import { FunnelMount } from "@/components/analytics/FunnelMount";

// 60s ISR: page re-renders against fresh Redis at most every minute. The
// refresh hooks at the top of the route handler dedupe within a 30s window,
// so a true cold-render only happens after the cache expires.
export const revalidate = 60;

const TITLE = `Top 10 — ${SITE_NAME}`;
const DESCRIPTION =
  "Top 10 across eight surfaces — repos, agents, movers, LLMs, MCPs, skills, news, funding. Built to share: tap X to post, copy a permalink, or grab the embed.";
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
  // Hydrate the in-memory cache from Redis before reading. Without this the
  // cold-start lambda would render whatever bundled JSON was baked into the
  // deploy. Per CLAUDE.md "Critical Conventions" rule. Parallel + allSettled
  // so a single source outage doesn't block the page.
  await Promise.allSettled([
    refreshHfModelsFromStore(),
    refreshHackernewsTrendingFromStore(),
    refreshBlueskyTrendingFromStore(),
    refreshDevtoTrendingFromStore(),
    refreshLobstersTrendingFromStore(),
    refreshProducthuntLaunchesFromStore(),
    refreshFundingNewsFromStore(),
  ]);

  const repos = getDerivedRepos();
  const hfModels = getHfModelsTrending(40);
  const hn = getHnTopStories(40);
  const bsky = getBlueskyTopPosts(40);
  const devto = getDevtoTopArticles(40);
  const lobsters = getLobstersTopStories(40);
  const ph = getRecentLaunches(7, 40);
  const funding = getFundingSignalsThisWeek();

  // Skills / MCP signal boards are async I/O — settle in parallel so a slow
  // call on one doesn't block the other.
  const [skillsRes, mcpRes] = await Promise.allSettled([
    getSkillsSignalData(),
    getMcpSignalData(),
  ]);
  const skillsBoard =
    skillsRes.status === "fulfilled" ? skillsRes.value.combined : null;
  const mcpBoard = mcpRes.status === "fulfilled" ? mcpRes.value.board : null;

  // Compose the payload exactly as scripts/snapshot-top10.ts does so the live
  // route and the frozen snapshot are byte-identical at fetch time.
  const payload: Top10Payload = {
    repos: repos.length > 0 ? buildRepoTop10(repos, "7d") : emptyBundle("7d"),
    llms:
      hfModels.length > 0 ? buildLlmTop10(hfModels, "7d") : emptyBundle("7d"),
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
    funding:
      funding.length > 0 ? buildFundingTop10(funding) : emptyBundle("7d"),
  };

  // 80-row slice for client-side window/metric recompute on REPOS / AGENTS /
  // MOVERS. Frozen route ships [] because frozen views don't recompute.
  const repoSlice = reposToSlice(repos, 80);

  return (
    <>
      <FunnelMount step="top10_view" flow="top10-discover" />
      <Top10Page
        payload={payload}
        categoryMeta={CATEGORY_META}
        repoSlice={repoSlice}
      />
    </>
  );
}
