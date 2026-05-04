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

  const totalStars = repos.reduce((sum, repo) => sum + repo.stars, 0);
  const topByStars = repos[0];
  const newRepos7d = repos.filter((repo) => {
    if (!repo.createdAt) return false;
    const createdMs = Date.parse(repo.createdAt);
    if (Number.isNaN(createdMs)) return false;
    return Date.now() - createdMs <= 7 * 24 * 3600 * 1000;
  }).length;
  const mostDeployed = [...repos].sort((a, b) => b.forks - a.forks)[0];

  return (
    <main className="home-surface agent-repos-page">
      <PageHead
        crumb={
          <>
            <b>AGENTS</b> · TERMINAL · /AGENT-REPOS
          </>
        }
        h1="Top agent runtimes and frameworks by total GitHub stars."
        lede="Curated from GitHub agent searches and the OpenClaw ecosystem. Runtimes, frameworks, orchestrators, and OpenClaw-like systems such as OpenClaw, Hermes, NanoClaw, and NemoClaw. Plugins, skills, tutorials, and awesome lists stay in the general repo views."
        clock={
          <>
            <span className="big">{repos.length}</span>
            <span className="muted">
              REPOS · OF {AGENT_REPO_TARGET_COUNT}
            </span>
            <LiveDot label="LIVE" />
          </>
        }
      />

      <VerdictRibbon
        tone="acc"
        stamp={{
          eyebrow: "// AGENT BOARD",
          headline: `${repos.length} / ${AGENT_REPO_TARGET_COUNT} TRACKED`,
          sub: `${formatNumber(totalStars)} combined stars · refreshed live`,
        }}
        text={
          <>
            <b>{repos.length} agent repos</b> with live data, led by{" "}
            <span style={{ color: "var(--v4-acc)" }}>
              {topByStars ? topByStars.fullName : "—"}
            </span>{" "}
            at{" "}
            <span style={{ color: "var(--v4-money)" }}>
              {topByStars ? formatNumber(topByStars.stars) : "—"} stars
            </span>
            .
          </>
        }
        actionHref="/feeds/agent-repos.xml"
        actionLabel="RSS →"
      />

      <KpiBand
        cells={[
          {
            label: "Total agent repos",
            value: formatNumber(repos.length),
            sub: `of ${AGENT_REPO_TARGET_COUNT} curated`,
          },
          {
            label: "Top by stars",
            value: topByStars
              ? formatNumber(topByStars.stars)
              : "—",
            sub: topByStars ? topByStars.fullName : "no data",
            tone: "money",
          },
          {
            label: "New · 7d",
            value: formatNumber(newRepos7d),
            sub: newRepos7d > 0 ? "fresh repos" : "no new repos",
            tone: newRepos7d > 0 ? "acc" : "default",
          },
          {
            label: "Most-deployed",
            value: mostDeployed
              ? formatNumber(mostDeployed.forks)
              : "—",
            sub: mostDeployed
              ? `${mostDeployed.fullName} · forks`
              : "no data",
          },
        ]}
      />

      <SectionHead
        num="// 01"
        title="Top agent repos"
        meta={
          <>
            <b>{repos.length}</b> · BY STARS
          </>
        }
      />
      {repos.length === 0 ? (
        <div
          style={{
            fontFamily: "var(--font-geist-mono), monospace",
            fontSize: 12,
            color: "var(--v4-ink-300)",
            padding: "16px 0",
          }}
        >
          No agent repos with live data right now.
        </div>
      ) : (
        <div className="v4-leaderboard-template__leaderboard">
          {repos.map((repo, index) => {
            const slug = slugToId(repo.fullName);
            const delta24 = repo.starsDelta24h ?? 0;
            const direction =
              delta24 > 0 ? "up" : delta24 < 0 ? "down" : "flat";
            const deltaLabel =
              delta24 > 0
                ? `+${formatNumber(delta24)}`
                : delta24 < 0
                  ? formatNumber(delta24)
                  : "0";
            return (
              <RankRow
                key={repo.id}
                rank={index + 1}
                title={
                  <>
                    {repo.owner}{" "}
                    <span style={{ color: "var(--v4-ink-400)" }}>/</span>{" "}
                    {repo.name}
                  </>
                }
                desc={
                  repo.description?.trim() ||
                  (repo.language ? repo.language : "—")
                }
                metric={{
                  value: formatNumber(repo.stars),
                  label: "STARS",
                }}
                delta={{
                  value: deltaLabel,
                  direction,
                  label: "24H",
                }}
                href={`/agent-repos/${slug}`}
                first={index === 0}
              />
            );
          })}
        </div>
      )}
    </main>
  );
}
