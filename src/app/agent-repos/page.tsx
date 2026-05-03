// /agent-repos — mirrors the /githubrepo layout, filtered to the curated
// agent-repo set from `AGENT_REPO_FULL_NAMES`.
//
// Same data wiring as /githubrepo (9 store hydrations, MetricGrid +
// LiveTopTable + category tabs) so cards stay consistent across surfaces.
// Only the underlying repo subset differs.

import type { Metadata } from "next";

import {
  AGENT_REPO_TARGET_COUNT,
  selectAgentRepos,
} from "@/lib/agent-repos";
import { getDerivedRepos } from "@/lib/derived-repos";
import { lastFetchedAt, refreshTrendingFromStore } from "@/lib/trending";
import { refreshRedditMentionsFromStore } from "@/lib/reddit-data";
import { refreshHackernewsMentionsFromStore } from "@/lib/hackernews";
import { refreshBlueskyMentionsFromStore } from "@/lib/bluesky";
import { refreshDevtoMentionsFromStore } from "@/lib/devto";
import { refreshLobstersMentionsFromStore } from "@/lib/lobsters";
import { refreshNpmFromStore } from "@/lib/npm";
import { refreshHfModelsFromStore } from "@/lib/huggingface";
import { refreshArxivFromStore } from "@/lib/arxiv";
import { absoluteUrl, SITE_NAME } from "@/lib/seo";

import { Card } from "@/components/ui/Card";
import { Metric, MetricGrid } from "@/components/ui/Metric";
import { FooterBar } from "@/components/ui/FooterBar";
import { PageHead } from "@/components/ui/PageHead";
import { SectionHead } from "@/components/ui/SectionHead";
import { FreshnessBadge } from "@/components/shared/FreshnessBadge";
import { MarkVisited } from "@/components/layout/MarkVisited";
import {
  LiveTopTable,
  type CategoryFacet,
  type LiveRow,
} from "@/components/home/LiveTopTable";
import { CATEGORIES } from "@/lib/constants";
import type { Repo } from "@/lib/types";

export const revalidate = 60;

export const metadata: Metadata = {
  title: `Agent Repos — ${SITE_NAME}`,
  description:
    "Top tracked AI agent runtimes, frameworks, orchestrators, and OpenClaw-like systems ranked by total GitHub stars.",
  alternates: { canonical: absoluteUrl("/agent-repos") },
};

const compactNumber = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

function formatCompact(value: number): string {
  return compactNumber.format(Math.max(0, Math.round(value))).toLowerCase();
}

const CATEGORY_LABELS = new Map(CATEGORIES.map((c) => [c.id, c.shortName]));

function categoryLabel(repo: Repo): string {
  return CATEGORY_LABELS.get(repo.categoryId) ?? repo.language ?? "Repo";
}

export default async function AgentReposPage() {
  // Hydrate the same 9 stores /githubrepo uses so LiveTopTable mention
  // badges reflect the latest data-store payloads, not stale bundled snapshots.
  await Promise.all([
    refreshTrendingFromStore(),
    refreshRedditMentionsFromStore(),
    refreshHackernewsMentionsFromStore(),
    refreshBlueskyMentionsFromStore(),
    refreshDevtoMentionsFromStore(),
    refreshLobstersMentionsFromStore(),
    refreshNpmFromStore(),
    refreshHfModelsFromStore(),
    refreshArxivFromStore(),
  ]);

  // Same shape as /githubrepo, but filtered to the curated agent-repo set.
  const repos = selectAgentRepos(getDerivedRepos());

  const liveRows = [...repos]
    .sort((a, b) => b.momentumScore - a.momentumScore)
    .slice(0, 50);
  const liveTableRows: LiveRow[] = liveRows.map((repo) => {
    const ps = repo.mentions?.perSource;
    return {
      id: repo.id,
      fullName: repo.fullName,
      owner: repo.owner,
      name: repo.name,
      href: `/repo/${repo.owner}/${repo.name}`,
      categoryId: repo.categoryId,
      categoryLabel: categoryLabel(repo),
      language: repo.language ?? null,
      stars: repo.stars,
      starsDelta24h: repo.starsDelta24h,
      starsDelta7d: repo.starsDelta7d,
      starsDelta30d: repo.starsDelta30d,
      forks: repo.forks,
      sparklineData: repo.sparklineData,
      momentumScore: repo.momentumScore,
      mentionCount24h: repo.mentionCount24h ?? 0,
      sources: {
        gh: 1,
        hn: ps?.hackernews.count24h ?? 0,
        r: ps?.reddit.count24h ?? 0,
        b: ps?.bluesky.count24h ?? 0,
        d: ps?.devto.count24h ?? 0,
        lobsters: ps?.lobsters.count24h ?? 0,
        x: ps?.twitter.count24h ?? 0,
        npm: ps?.npm.count24h ?? 0,
        hf: ps?.huggingface.count24h ?? 0,
        arxiv: ps?.arxiv.count24h ?? 0,
      },
    };
  });
  const liveCategories: CategoryFacet[] = (() => {
    const counts = new Map<string, number>();
    for (const row of liveTableRows) {
      counts.set(row.categoryId, (counts.get(row.categoryId) ?? 0) + 1);
    }
    return CATEGORIES.map((category) => ({
      id: category.id,
      label: category.shortName,
      count: counts.get(category.id) ?? 0,
    }))
      .filter((category) => category.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  })();

  const refreshed = new Date(lastFetchedAt);
  const refreshedTime = refreshed.toISOString().slice(11, 19);
  const total24h = repos.reduce(
    (sum, repo) => sum + Math.max(0, repo.starsDelta24h),
    0,
  );
  const total7d = repos.reduce(
    (sum, repo) => sum + Math.max(0, repo.starsDelta7d),
    0,
  );
  const breakoutCount = repos.filter(
    (r) => r.movementStatus === "rising" || r.movementStatus === "hot",
  ).length;
  const consensusCount = repos.filter(
    (r) => (r.crossSignalScore ?? 0) >= 2,
  ).length;
  const topCategory = CATEGORIES.map((category) => ({
    label: category.shortName,
    delta: repos
      .filter((repo) => repo.categoryId === category.id)
      .reduce((sum, repo) => sum + Math.max(0, repo.starsDelta24h), 0),
  })).sort((a, b) => b.delta - a.delta)[0];

  return (
    <>
      <main className="home-surface agent-repos-page">
        <MarkVisited routeKey="agentRepos" count={repos.length} />
        <PageHead
          crumb={
            <>
              <b>AGENTS</b> · TERMINAL · /AGENT-REPOS
            </>
          }
          h1="Agent Repos"
          lede="Top agent runtimes, frameworks, orchestrators, and OpenClaw-like systems — same momentum-ranked layout as /githubrepo, filtered to the curated agent-repo set."
          clock={
            <>
              <span className="big">{repos.length}</span>
              <span className="muted">
                REPOS · OF {AGENT_REPO_TARGET_COUNT}
              </span>
              <FreshnessBadge source="mcp" lastUpdatedAt={lastFetchedAt} />
            </>
          }
        />

        <MetricGrid columns={6}>
          <Metric
            label="tracked repos"
            value={formatCompact(repos.length)}
            sub={`of ${AGENT_REPO_TARGET_COUNT} curated`}
          />
          <Metric
            label="24h stars"
            value={formatCompact(total24h)}
            delta="+ live"
            tone="positive"
          />
          <Metric
            label="7d stars"
            value={formatCompact(total7d)}
            sub="rolling window"
          />
          <Metric
            label="consensus"
            value={consensusCount}
            sub="multi-source"
            tone="consensus"
          />
          <Metric
            label="breakouts"
            value={breakoutCount}
            sub="velocity spike"
            tone="accent"
          />
          <Metric
            label="top category"
            value={topCategory?.label ?? "n/a"}
            sub="momentum leader"
          />
        </MetricGrid>

        <SectionHead
          num="// 01"
          title="Live / top agent repos"
          meta={
            <>
              <b>{refreshedTime}</b> / refreshed
            </>
          }
        />
        <Card>
          <LiveTopTable rows={liveTableRows} categories={liveCategories} />
        </Card>
      </main>

      <FooterBar
        meta={`// TRENDINGREPO / agent-repos / serial ${repos.length}`}
        actions={`DATA / ${refreshedTime} UTC`}
      />
    </>
  );
}
