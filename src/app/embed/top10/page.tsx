// /embed/top10 — chrome-free iframe-friendly Top 10 surface.
//
// Third-party sites can drop `<iframe src="trendingrepo.com/embed/top10">`
// and get the live ranking + share panel without the topbar/sidebar/mobile
// nav. Uses the existing `<Top10Page>` client wrapper (so window/metric
// switching, theme picker, share-card preview all still work) but injects
// inline CSS that hides every site-chrome element when this route is mounted.
//
// Why CSS instead of a separate layout: the root layout owns <html>/<body>
// and wraps every page. A route-group layout can't replace that without a
// hydration mismatch. Hiding chrome at the CSS level is one rule, ships
// today, and keeps the code path identical to the live /top10 — which means
// the embed inherits every future polish to the live page automatically.

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

export const revalidate = 1800;

export const metadata: Metadata = {
  title: `Top 10 — ${SITE_NAME} (embed)`,
  description: "Embedded Top 10 ranking from TrendingRepo.",
  alternates: { canonical: absoluteUrl("/top10") },
  // Embeds shouldn't be indexed — the canonical /top10 already is. Keeps SERPs
  // clean and avoids duplicate-content penalties on host sites.
  robots: { index: false, follow: true },
};

export default async function EmbedTop10Page() {
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

  const [skillsRes, mcpRes] = await Promise.allSettled([
    getSkillsSignalData(),
    getMcpSignalData(),
  ]);

  const skillsBoard =
    skillsRes.status === "fulfilled" ? skillsRes.value.combined : null;
  const mcpBoard = mcpRes.status === "fulfilled" ? mcpRes.value.board : null;

  // Embed surface intentionally skips priorTopSlugs + sparkline overlays —
  // they're best-effort enhancements that don't matter for the iframe use
  // case (host sites embed for the live ranking, not historical context).
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

  const repoSlice: RepoSliceLite[] =
    repos.length > 0
      ? reposToSlice(repos, 80).map((r) => ({
          ...r,
          isAgent: AGENT_REPO_SET.has(r.fullName.toLowerCase()),
        }))
      : [];

  return (
    <>
      {/* CSS-level chrome suppression: hide the site Header, Sidebar, mobile
          nav, and skip-link so the embed renders edge-to-edge. The selectors
          target structural roles, not class names, so a future redesign of
          chrome doesn't silently re-show it inside the iframe. */}
      <style>{`
        body header,
        body > [class*="sidebar"],
        body aside.sidebar,
        body nav[class*="MobileNav"],
        body nav.mobile-nav,
        body .app-shell > aside,
        body .app-shell > header,
        body footer,
        body [data-mobile-drawer] {
          display: none !important;
        }
        body .app-shell {
          grid-template-columns: 1fr !important;
        }
        body main, body .app-main {
          padding-top: 0 !important;
        }
        body {
          background: var(--v3-bg-000, #08090a);
        }
      `}</style>
      <Top10Page
        payload={payload}
        categoryMeta={CATEGORY_META}
        repoSlice={repoSlice}
      />
    </>
  );
}
