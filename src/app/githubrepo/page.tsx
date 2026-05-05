// /githubrepo — isolated trending-repos surface.
//
// Strips the home page down to its three load-bearing pieces: the page-head
// (title + refreshed clock), the 6-up MetricGrid stats, and the LiveTopTable
// with category tabs. No consensus / breakout / featured / bubble map / FAQ —
// just the list. Same data wiring as `/` so cards stay consistent.
//
// Inline JSON-LD (CollectionPage + ItemList + BreadcrumbList) anchors this
// surface in structured data so crawlers don't fall back to the parent
// homepage feed, plus an explicit per-page Metadata export with canonical /
// OG / Twitter / robots so rich-result tooling has a complete head block.

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
import { Card } from "@/components/ui/Card";
import { Metric, MetricGrid } from "@/components/ui/Metric";
import { FooterBar } from "@/components/ui/FooterBar";
import { SectionHead } from "@/components/ui/SectionHead";
import { MarkVisited } from "@/components/layout/MarkVisited";
import {
  LiveTopTable,
  type CategoryFacet,
  type LiveRow,
} from "@/components/home/LiveTopTable";
import { CATEGORIES } from "@/lib/constants";
import {
  SITE_NAME,
  SITE_URL,
  absoluteUrl,
  safeJsonLd,
} from "@/lib/seo";
import type { Repo } from "@/lib/types";

export const revalidate = 60;

const PAGE_PATH = "/githubrepo";
const PAGE_TITLE = "Top 50 trending GitHub repos — live";
const PAGE_DESCRIPTION =
  "Live momentum-ranked list of the top 50 trending GitHub repositories with cross-source mention chips (Hacker News, Reddit, Bluesky, dev.to, Lobsters, npm, Hugging Face, arXiv, X). Refreshes every minute.";
const PAGE_OG_TITLE = `${PAGE_TITLE} — ${SITE_NAME}`;

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: absoluteUrl(PAGE_PATH) },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: PAGE_OG_TITLE,
    description: PAGE_DESCRIPTION,
    url: absoluteUrl(PAGE_PATH),
    locale: "en_US",
    images: [
      {
        url: "/og-card.png",
        width: 1200,
        height: 630,
        alt: `${SITE_NAME} — top 50 trending GitHub repositories, live`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@0motionguy",
    creator: "@0motionguy",
    title: PAGE_OG_TITLE,
    description: PAGE_DESCRIPTION,
    images: ["/og-card.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-snippet": -1,
      "max-image-preview": "large",
      "max-video-preview": -1,
    },
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

export default async function GithubRepoPage() {
  // Keep the LiveTopTable mention badges tied to the latest data-store
  // payloads instead of stale bundled snapshots.
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
      // Chip on/off uses the wider 7d window so slow-cadence sources
      // (lobsters / npm / hf / arxiv / devto) actually fire on the row.
      // 24h is too narrow for most non-twitter signals — the result was
      // "8 chip slots, only github + twitter colored." Falls back to the
      // 24h count when 7d is missing.
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

  // Top 20 of the visible 50 — keeps the structured-data payload bounded
  // while still giving crawlers a meaningful ItemList to anchor against.
  const itemListTop = liveRows.slice(0, 20);
  const pageUrl = absoluteUrl(PAGE_PATH);

  return (
    <>
      <MarkVisited routeKey="trendingRepos" count={repos.length} />
      {/* CollectionPage + ItemList JSON-LD — declares this page is a
          curated list of trending GitHub repos and enumerates the top 20
          so structured-data rich results can pick them up. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: safeJsonLd({
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            "@id": `${SITE_URL}${PAGE_PATH}#page`,
            name: PAGE_OG_TITLE,
            description: PAGE_DESCRIPTION,
            url: pageUrl,
            inLanguage: "en-US",
            isPartOf: {
              "@type": "WebSite",
              name: SITE_NAME,
              url: SITE_URL,
            },
            dateModified: new Date(lastFetchedAt).toISOString(),
            mainEntity: {
              "@type": "ItemList",
              numberOfItems: itemListTop.length,
              itemListOrder: "https://schema.org/ItemListOrderDescending",
              itemListElement: itemListTop.map((repo, i) => ({
                "@type": "ListItem",
                position: i + 1,
                url: absoluteUrl(`/repo/${repo.owner}/${repo.name}`),
                name: repo.fullName,
              })),
            },
          }),
        }}
      />
      {/* BreadcrumbList JSON-LD — Home -> GitHub repos so crawlers can
          attach this surface to the canonical home anchor. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: safeJsonLd({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              {
                "@type": "ListItem",
                position: 1,
                name: "Home",
                item: absoluteUrl("/"),
              },
              {
                "@type": "ListItem",
                position: 2,
                name: "GitHub repos",
                item: pageUrl,
              },
            ],
          }),
        }}
      />
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
