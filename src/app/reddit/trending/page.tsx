// /reddit/trending — V4 SourceFeedTemplate consumer.

import { Suspense } from "react";

import {
  getAllPostsFetchedAt,
  getAllPostsStats,
  getAllScoredPosts,
  isAllPostsCold,
  refreshRedditAllPostsFromStore,
} from "@/lib/reddit-all-data";
import { AllTrendingTabs } from "@/components/reddit-trending/AllTrendingTabs";

// V4 (CORPUS) primitives.
import { SourceFeedTemplate } from "@/components/templates/SourceFeedTemplate";
import { KpiBand } from "@/components/ui/KpiBand";
import { LiveDot } from "@/components/ui/LiveDot";

export const revalidate = 300;

function formatClock(iso: string | undefined): string {
  if (!iso) return "warming";
  return new Date(iso).toISOString().slice(11, 19);
}

export default async function RedditTrendingPage() {
  await refreshRedditAllPostsFromStore();
  const allPostsFetchedAt = getAllPostsFetchedAt();
  const allPostsCold = isAllPostsCold();
  const posts = getAllScoredPosts();
  const stats = getAllPostsStats();

  if (allPostsCold) {
    return (
      <main className="home-surface">
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
      </main>
    );
  }

  const topScore = posts.reduce((m, p) => Math.max(m, p.score ?? 0), 0);
  const subredditCount = new Set(posts.map((p) => p.subreddit).filter(Boolean)).size;

  return (
    <main className="home-surface">
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
          <Suspense fallback={<FeedSkeleton />}>
            <AllTrendingTabs posts={posts} />
          </Suspense>
        }
      />
    </main>
  );
}

function FeedSkeleton() {
  return (
    <div
      style={{
        padding: 24,
        fontSize: 13,
        background: "var(--v4-bg-025)",
        border: "1px solid var(--v4-line-200)",
        borderRadius: 2,
        color: "var(--v4-ink-400)",
      }}
    >
      Loading feed...
    </div>
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
