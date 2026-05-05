// /githubrepo - isolated trending-repos surface.
//
// Streaming SSR rewrite for AGN-624: render page shell immediately, then
// stream metrics + top-50 table once data-store hydration resolves.

import { Suspense } from "react";
import type { Metadata } from "next";

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
import { LiveTopTable, type CategoryFacet, type LiveRow } from "@/components/home/LiveTopTable";
import { MarkVisited } from "@/components/layout/MarkVisited";
import { Card } from "@/components/ui/Card";
import { FooterBar } from "@/components/ui/FooterBar";
import { Metric, MetricGrid } from "@/components/ui/Metric";
import { SectionHead } from "@/components/ui/SectionHead";
import { CATEGORIES } from "@/lib/constants";
import type { Repo } from "@/lib/types";
import { SITE_NAME, absoluteUrl, safeJsonLd } from "@/lib/seo";
import { getRepoWhy } from "@/lib/repo-why";

export const revalidate = 60;
const PAGE_PATH = "/githubrepo";
const PAGE_TITLE = "Top 50 Trending GitHub Repos";
const PAGE_DESCRIPTION =
  "Live top 50 trending GitHub repositories ranked by momentum, star velocity, and cross-source agreement.";
const OG_IMAGE = absoluteUrl("/og-card.png");

export const metadata: Metadata = {
  title: `${PAGE_TITLE} - ${SITE_NAME}`,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: absoluteUrl(PAGE_PATH) },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  openGraph: {
    type: "website",
    url: absoluteUrl(PAGE_PATH),
    title: `${PAGE_TITLE} - ${SITE_NAME}`,
    description: PAGE_DESCRIPTION,
    siteName: SITE_NAME,
    locale: "en_US",
    images: [
      {
        url: OG_IMAGE,
        width: 1200,
        height: 630,
        alt: `${SITE_NAME} GitHub trending repositories`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${PAGE_TITLE} - ${SITE_NAME}`,
    description: PAGE_DESCRIPTION,
    images: [OG_IMAGE],
  },
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

function PageHead({ refreshedTime }: { refreshedTime?: string }) {
  return (
    <section className="page-head">
      <div>
        <div className="crumb">
          <b>TREND</b> / TERMINAL / GITHUB REPOS
        </div>
        <h1>Top 50 trending GitHub repos - right now.</h1>
        <p className="lede">
          The same momentum-ranked list you see on the front page, isolated
          with stats and category tabs. No consensus / breakouts / featured /
          charts - just the table.
        </p>
      </div>
      <div
        className="clock"
        aria-label={
          refreshedTime
            ? `Data refreshed at ${refreshedTime} UTC`
            : "Data refresh pending"
        }
      >
        <span className="big">
          {refreshedTime ? `${refreshedTime} UTC` : "syncing..."}
        </span>
      </div>
    </section>
  );
}

function LoadingShell() {
  return (
    <>
      <PageHead />
      <MetricGrid columns={6}>
        <Metric label="tracked repos" value="..." sub="loading" />
        <Metric label="24h stars" value="..." sub="loading" />
        <Metric label="7d stars" value="..." sub="loading" />
        <Metric label="consensus" value="..." sub="loading" />
        <Metric label="breakouts" value="..." sub="loading" />
        <Metric label="top category" value="..." sub="loading" />
      </MetricGrid>

      <SectionHead
        num="// 01"
        title="Live / top 50"
        meta={
          <>
            <b>...</b> / loading
          </>
        }
      />
      <Card>
        <div className="p-6 text-sm text-[var(--v3-ink-400)]">
          Loading top 50 rows...
        </div>
      </Card>
    </>
  );
}

function ErrorShell({ message }: { message: string }) {
  return (
    <Card>
      <div className="p-6 text-sm">
        <p className="font-semibold text-[var(--v3-neg)]">Failed to load top 50.</p>
        <p className="mt-2 text-[var(--v3-ink-400)]">{message}</p>
      </div>
    </Card>
  );
}

function EmptyShell() {
  return (
    <Card>
      <div className="p-6 text-sm text-[var(--v3-ink-400)]">
        No repos are available right now. Refresh after the next data-store sync.
      </div>
    </Card>
  );
}

export default function GithubRepoPage() {
  return (
    <div className="home-surface">
      <Suspense fallback={<LoadingShell />}>
        <GithubRepoTop50Stream />
      </Suspense>
    </div>
  );
}

function buildTop50WhyNarrative(rows: LiveRow[]): string {
  if (rows.length === 0) {
    return "No trending repos are available in this cycle.";
  }
  const top = rows[0];
  const breakoutLike = rows.filter((r) => r.starsDelta24h > 0 && r.momentumScore >= 70).length;
  const consensusLike = rows.filter((r) => r.mentionCount24h > 0).length;
  const total24h = rows.reduce((sum, r) => sum + Math.max(0, r.starsDelta24h), 0);
  const leadCategory = (() => {
    const counts = new Map<string, number>();
    for (const row of rows) counts.set(row.categoryLabel, (counts.get(row.categoryLabel) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "mixed";
  })();
  return `${top.fullName} leads the live board. The top 50 gained ${formatCompact(total24h)} stars in 24h, with ${breakoutLike} high-momentum movers and ${consensusLike} repos showing active mention flow. ${leadCategory} is the largest category in this snapshot.`;
}

async function GithubRepoTop50Stream() {
  try {
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

    const repos = getDerivedRepos();
    if (repos.length === 0) {
      return (
        <>
          <PageHead />
          <EmptyShell />
          <FooterBar meta="// TRENDINGREPO / githubrepo / serial 0" actions="DATA / n/a" />
        </>
      );
    }

    const liveRows = [...repos]
      .sort((a, b) => b.momentumScore - a.momentumScore)
      .slice(0, 50);

    const liveTableRows: LiveRow[] = await Promise.all(
      liveRows.map(async (repo) => {
        const ps = repo.mentions?.perSource;
        const why = await getRepoWhy(repo.owner, repo.name);
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
          lastCommitAt: repo.lastCommitAt ?? null,
          whyLine: why?.line ?? null,
          whySignal: why?.signal ?? null,
          sources: {
            gh: 1,
            hn: ps?.hackernews.count7d ?? ps?.hackernews.count24h ?? 0,
            r: ps?.reddit.count7d ?? ps?.reddit.count24h ?? 0,
            b: ps?.bluesky.count7d ?? ps?.bluesky.count24h ?? 0,
            d: ps?.devto.count7d ?? ps?.devto.count24h ?? 0,
            lobsters: ps?.lobsters.count7d ?? ps?.lobsters.count24h ?? 0,
            x: ps?.twitter.count7d ?? ps?.twitter.count24h ?? 0,
            npm: ps?.npm.count7d ?? ps?.npm.count24h ?? 0,
            hf: ps?.huggingface.count7d ?? ps?.huggingface.count24h ?? 0,
            arxiv: ps?.arxiv.count7d ?? ps?.arxiv.count24h ?? 0,
          },
        };
      }),
    );

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
    const whyNarrative = buildTop50WhyNarrative(liveTableRows);
    const itemListTop = liveRows.slice(0, 50);

    return (
      <>
        <MarkVisited routeKey="trendingRepos" count={repos.length} />
        <PageHead refreshedTime={refreshedTime} />

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
        <Card className="mt-4">
          <div className="p-6 text-sm text-[var(--v3-ink-300)]">
            <p className="mb-2 font-semibold text-[var(--v3-ink-100)]">Why these repos are trending</p>
            <p>{whyNarrative}</p>
          </div>
        </Card>

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: safeJsonLd({
              "@context": "https://schema.org",
              "@type": "CollectionPage",
              "@id": `${absoluteUrl(PAGE_PATH)}#collection`,
              name: `${PAGE_TITLE} - ${SITE_NAME}`,
              url: absoluteUrl(PAGE_PATH),
              description: PAGE_DESCRIPTION,
              dateModified: refreshed.toISOString(),
              abstract: whyNarrative,
              mainEntity: {
                "@type": "ItemList",
                numberOfItems: itemListTop.length,
                itemListOrder: "https://schema.org/ItemListOrderDescending",
                itemListElement: itemListTop.map((repo, i) => ({
                  "@type": "ListItem",
                  position: i + 1,
                  name: repo.fullName,
                  url: absoluteUrl(`/repo/${repo.owner}/${repo.name}`),
                })),
              },
            }),
          }}
        />

        <FooterBar
          meta={`// TRENDINGREPO / githubrepo / serial ${repos.length}`}
          actions={`DATA / ${refreshedTime} UTC`}
        />
      </>
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown server error";
    return (
      <>
        <PageHead />
        <ErrorShell message={message} />
        <FooterBar
          meta="// TRENDINGREPO / githubrepo / serial error"
          actions="DATA / unavailable"
        />
      </>
    );
  }
}
