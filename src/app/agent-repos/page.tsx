// /agent-repos — V4 leaderboard surface.
//
// Migrated off the legacy TerminalLayout chrome to V4 primitives composed
// directly (Leaderboard pattern à la /breakouts). Surfaces the curated set
// of agent runtimes / frameworks / orchestrators / OpenClaw-likes from
// `AGENT_REPO_FULL_NAMES`, ranked by total stars.
//
// Mockup reference: home.html top10 panel + signals.html § KPI strip.

import type { Metadata } from "next";

import {
  AGENT_REPO_TARGET_COUNT,
  selectAgentRepos,
} from "@/lib/agent-repos";
import { getDerivedRepos } from "@/lib/derived-repos";
import { formatNumber, slugToId } from "@/lib/utils";
import { absoluteUrl, SITE_NAME } from "@/lib/seo";

import { PageHead } from "@/components/ui/PageHead";
import { SectionHead } from "@/components/ui/SectionHead";
import { KpiBand } from "@/components/ui/KpiBand";
import { VerdictRibbon } from "@/components/ui/VerdictRibbon";
import { LiveDot } from "@/components/ui/LiveDot";
import { RankRow } from "@/components/ui/RankRow";

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

  const heading = (
    <section className="page-head">
      <div>
        <div className="crumb">
          <b>Trend terminal</b> / agent repos
        </div>
        <h1>Top agent runtimes and frameworks by stars.</h1>
        <p className="lede">
          Curated from GitHub agent searches and the OpenClaw ecosystem:
          runtimes, frameworks, orchestrators, and OpenClaw-like systems.
        </p>
      </div>
      <div className="clock">
        <span className="big">{repos.length}</span>
        <span className="live">of {AGENT_REPO_TARGET_COUNT} tracked</span>
      </div>
    </section>
  );

  return (
    <TerminalLayout
      repos={repos}
      className="home-surface terminal-page agent-repos-page"
      filterBarVariant="minimal"
      showFeatured={false}
      heading={heading}
      sortOverride={{ column: "stars", direction: "desc" }}
    />
  );
}
