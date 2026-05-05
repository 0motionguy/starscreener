// /reddit/trending — V4 SourceFeedTemplate consumer.
import { Suspense } from "react";

import type { Metadata } from "next";

import {
  getAllPostsViewWithFallback,
  refreshRedditAllPostsFromStore,
} from "@/lib/reddit-all-data";
import { buildTrendingRowsDto } from "@/components/reddit-trending/AllTrendingTabs";

// V4 (CORPUS) primitives.
import { SourceFeedTemplate } from "@/components/templates/SourceFeedTemplate";
import { KpiBand } from "@/components/ui/KpiBand";
import { LiveDot } from "@/components/ui/LiveDot";
import { TrendingMentionsSection } from "@/components/news/TrendingMentionsSection";
import { AllTrendingTabs } from "@/components/reddit-trending/AllTrendingTabs";
import { absoluteUrl } from "@/lib/seo";

export const revalidate = 300;

interface PageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export const metadata: Metadata = {
  title: "Trending on Reddit",
  description:
    "Top Reddit posts across the tech subreddits, scored for velocity. Cross-subreddit signal terminal with breakout flagging.",
  alternates: { canonical: "/reddit/trending" },
  openGraph: {
    title: "Trending on Reddit — TrendingRepo",
    description: "Top Reddit tech posts by velocity, cross-subreddit signal.",
    url: absoluteUrl("/reddit/trending"),
    type: "website",
    images: [{ url: absoluteUrl("/og-card.png"), width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Trending on Reddit — TrendingRepo",
    description: "Top Reddit tech posts by velocity, cross-subreddit signal.",
    images: [absoluteUrl("/og-card.png")],
  },
};

function formatClock(iso: string | undefined): string {
  if (!iso) return "warming";
  return new Date(iso).toISOString().slice(11, 19);
}

export default async function RedditTrendingPage({ searchParams }: PageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  return (
    <main className="home-surface">
      <Suspense fallback={<TrendingPageLoading />}>
        <RedditTrendingFeed searchParams={resolvedSearchParams} />
      </Suspense>
    </main>
  );
}

async function RedditTrendingFeed({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const resolvedSearchParams = searchParams ?? {};
  await refreshRedditAllPostsFromStore();
  const view = getAllPostsViewWithFallback();
  const { posts, stats } = view;
  const allPostsFetchedAt = view.fetchedAt;
  const allPostsCold = view.cold;
  const tabsDto = buildTrendingRowsDto(posts, resolvedSearchParams);

  if (allPostsCold) {
    return (
      <>
        <SourceFeedTemplate
          crumb={
            <>
              <b>REDDIT</b> · TERMINAL · /REDDIT/TRENDING
            </>
          }
          title="Reddit · top posts"
          lede="7-day rolling firehose across the tracked subreddits, scored by velocity-weighted upvotes and cross-linked to GitHub repos."
        />
        <ColdState />
      </>
    );
  }

  const topScore = posts.reduce((m, p) => Math.max(m, p.score ?? 0), 0);
  const subredditCount = new Set(posts.map((p) => p.subreddit).filter(Boolean)).size;

  return (
    <SourceFeedTemplate
      crumb={
        <>
          <b>REDDIT</b> · TERMINAL · /REDDIT/TRENDING
        </>
      }
      title="Reddit · top posts"
      lede="7-day rolling firehose across the tracked subreddits, scored by velocity-weighted upvotes and cross-linked to GitHub repos."
      clock={
        <>
          <span className="big">{formatClock(allPostsFetchedAt ?? undefined)}</span>
          <span className="muted">UTC · SCRAPED</span>
          <LiveDot label="FRESH · 1H" />
        </>
      }
      snapshot={
        <KpiBand
          cells={[
            {
              label: "TRACKED",
              value: stats.totalPosts.toLocaleString("en-US"),
              sub: "7d rolling",
              pip: "var(--v4-src-reddit)",
            },
            {
              label: "TOP SCORE",
              value: topScore.toLocaleString("en-US"),
              sub: "velocity peak",
              tone: "acc",
              pip: "var(--v4-acc)",
            },
            {
              label: "SUBREDDITS",
              value: subredditCount,
              sub: "active sources",
              tone: "money",
              pip: "var(--v4-money)",
            },
            {
              label: "GH-LINKED",
              value: stats.postsWithLinkedRepos,
              sub: "repos in feed",
              pip: "var(--v4-blue)",
            },
          ]}
        />
      }
      listEyebrow="Story feed · grouped by subreddit"
      list={
        <div className="space-y-4">
          <TrendingMentionsSection source="reddit" accent="var(--v4-src-reddit)" />
          <AllTrendingTabs
            dto={tabsDto}
            searchParams={resolvedSearchParams}
            pathname="/reddit/trending"
          />
        </div>
      }
    />
  );
}

function TrendingPageLoading() {
  return (
    <SourceFeedTemplate
      crumb={
        <>
          <b>REDDIT</b> · TERMINAL · /REDDIT/TRENDING
        </>
      }
      title="Reddit · top posts"
      lede="7-day rolling firehose across the tracked subreddits, scored by velocity-weighted upvotes and cross-linked to GitHub repos."
      listEyebrow="Story feed · grouped by subreddit"
      list={
        <section className="rounded-md border border-dashed border-border-primary bg-bg-secondary/40 p-6">
          <p className="text-sm font-mono text-text-tertiary">Loading Reddit trending feed…</p>
        </section>
      }
    />
  );
}

function ColdState() {
  return (
    <section
      style={{
        padding: 32,
        background: "var(--v4-bg-025)",
        border: "1px dashed var(--v4-line-100)",
        borderRadius: 2,
      }}
    >
      <h2
        className="v2-mono"
        style={{
          color: "var(--v4-src-reddit)",
          fontSize: 18,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.18em",
        }}
      >
        {"// no data yet"}
      </h2>
      <p style={{ marginTop: 12, maxWidth: "32rem", fontSize: 13, color: "var(--v4-ink-300)" }}>
        The Reddit scraper has not run yet. Run{" "}
        <code style={{ color: "var(--v4-ink-100)" }}>npm run scrape:reddit</code>{" "}
        locally to populate{" "}
        <code style={{ color: "var(--v4-ink-100)" }}>data/reddit-all-posts.json</code>,
        then refresh this page.
      </p>
    </section>
  );
}
