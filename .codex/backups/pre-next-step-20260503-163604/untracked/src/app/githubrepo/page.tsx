// /githubrepo — isolated trending-repos surface.
//
// Strips the home page down to its three load-bearing pieces: the page-head
// (title + refreshed clock), the 6-up MetricGrid stats, and the LiveTopTable
// with category tabs. No consensus / breakout / featured / bubble map / FAQ /
// JSON-LD — just the list. Same data wiring as `/` so cards stay consistent.

import { getDerivedRepos } from "@/lib/derived-repos";
import { lastFetchedAt } from "@/lib/trending";
import { Card } from "@/components/ui/Card";
import { Metric, MetricGrid } from "@/components/ui/Metric";
import { FooterBar } from "@/components/ui/FooterBar";
import { SectionHead } from "@/components/ui/SectionHead";
import {
  LiveTopTable,
  type LiveRow,
  type CategoryFacet,
} from "@/components/home/LiveTopTable";
import { CATEGORIES } from "@/lib/constants";
import type { Repo } from "@/lib/types";

export const revalidate = 60;

const CATEGORY_LABELS = new Map(CATEGORIES.map((c) => [c.id, c.shortName]));

const compactNumber = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

function formatCompact(value: number): string {
  return compactNumber.format(Math.max(0, Math.round(value))).toLowerCase();
}

function categoryLabel(repo: Repo): string {
  return CATEGORY_LABELS.get(repo.categoryId) ?? repo.language ?? "Repo";
}

export default async function GithubRepoPage() {
  const repos = getDerivedRepos();

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
    for (const r of liveTableRows) {
      counts.set(r.categoryId, (counts.get(r.categoryId) ?? 0) + 1);
    }
    return CATEGORIES.map((c) => ({
      id: c.id,
      label: c.shortName,
      count: counts.get(c.id) ?? 0,
    }))
      .filter((c) => c.count > 0)
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
      <div className="home-surface">
        <section className="page-head">
          <div>
            <div className="crumb">
              <b>TREND</b> / TERMINAL / GITHUB REPOS
            </div>
            <h1>Top 50 trending GitHub repos — right now.</h1>
            <p className="lede">
              The same momentum-ranked list you see on the front page, isolated
              with stats and category tabs. No consensus / breakouts / featured
              / charts — just the table.
            </p>
          </div>
          <div
            className="clock"
            aria-label={`Data refreshed at ${refreshedTime} UTC`}
          >
            <span className="big">{refreshedTime} UTC</span>
          </div>
        </section>

        <MetricGrid columns={6}>
          <Metric
            label="tracked repos"
            value={formatCompact(repos.length)}
            sub="derived feed"
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
          title="Live / top 50"
          meta={
            <>
              <b>{refreshedTime}</b> / refreshed
            </>
          }
        />
        <Card>
          <LiveTopTable rows={liveTableRows} categories={liveCategories} />
        </Card>
      </div>

      <FooterBar
        meta={`// TRENDINGREPO / githubrepo / serial ${repos.length}`}
        actions={`DATA / ${refreshedTime} UTC`}
      />
    </>
  );
}
