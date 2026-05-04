// /reddit/trending — V4 SourceFeedTemplate consumer.

import { readFileSync } from "fs";
import { resolve } from "path";

import type { Metadata } from "next";
import { Suspense } from "react";

import {
  getAllPostsFetchedAt,
  getAllPostsStats,
  getAllScoredPosts,
  isAllPostsCold,
  refreshRedditAllPostsFromStore,
} from "@/lib/reddit-all-data";
import { AllTrendingTabs } from "@/components/reddit-trending/AllTrendingTabs";
import { buildRedditHeader } from "@/components/news/newsTopMetrics";
import { SourceFeedTemplate } from "@/components/source-feed/SourceFeedTemplate";

// V4 (CORPUS) primitives.
import { SourceFeedTemplate } from "@/components/templates/SourceFeedTemplate";
import { KpiBand } from "@/components/ui/KpiBand";
import { LiveDot } from "@/components/ui/LiveDot";

export const revalidate = 300;

// SSR safety net — when the in-memory cache is empty (Redis returned `missing`
// AND the per-Lambda module cache hasn't been seeded yet) the page used to
// render the cold empty-state even though the bundled JSON snapshot ships
// with every Vercel build. Read it directly so users always see the most
// recent committed scan as a floor. Cached at module scope: bundled data is
// immutable for the deploy lifetime so re-reading per render is wasted work.
let bundledFallback: { posts: RedditAllPost[]; lastFetchedAt: string } | null =
  null;
function loadBundledFallback(): {
  posts: RedditAllPost[];
  lastFetchedAt: string;
} {
  if (bundledFallback) return bundledFallback;
  try {
    const raw = readFileSync(
      resolve(process.cwd(), "data", "reddit-all-posts.json"),
      "utf8",
    );
    const parsed = JSON.parse(raw) as Partial<RedditAllPostsFile>;
    bundledFallback = {
      posts: Array.isArray(parsed.posts) ? (parsed.posts as RedditAllPost[]) : [],
      lastFetchedAt:
        typeof parsed.lastFetchedAt === "string" ? parsed.lastFetchedAt : "",
    };
  } catch {
    bundledFallback = { posts: [], lastFetchedAt: "" };
  }
  return bundledFallback;
}

export const metadata: Metadata = {
  title: "Trending on Reddit",
  description:
    "Top Reddit posts across the tech subreddits, scored for velocity. Cross-subreddit signal terminal with breakout flagging.",
  alternates: { canonical: "/reddit/trending" },
  openGraph: {
    title: "Trending on Reddit — TrendingRepo",
    description: "Top Reddit tech posts by velocity, cross-subreddit signal.",
    url: "/reddit/trending",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Trending on Reddit — TrendingRepo",
    description: "Top Reddit tech posts by velocity, cross-subreddit signal.",
  },
};

function formatClock(iso: string | undefined): string {
  if (!iso) return "warming";
  return new Date(iso).toISOString().slice(11, 19);
}

export default async function RedditTrendingPage() {
  await refreshRedditAllPostsFromStore();
  let allPostsFetchedAt = getAllPostsFetchedAt();
  let allPostsCold = isAllPostsCold();
  let posts = getAllScoredPosts();
  let stats = getAllPostsStats();

  // SSR fallback: if Redis returned cold/empty (typical on a fresh Lambda
  // before the first refresh tick lands), splice in the bundled JSON
  // snapshot so visitors never see the cold empty-state. Bundled data ages
  // out per deploy but it's strictly better than "no data yet" for a
  // page hit by 2k+ users/day. The Redis refresh hook overlays fresher
  // data on the next render once the in-flight read resolves.
  if (allPostsCold || posts.length === 0) {
    const fallback = loadBundledFallback();
    if (fallback.posts.length > 0) {
      posts = fallback.posts;
      stats = {
        totalPosts: fallback.posts.length,
        breakouts24h: 0,
        topicsSurfaced: 0,
        postsWithLinkedRepos: fallback.posts.filter(
          (p) => Array.isArray(p.linkedRepos) && p.linkedRepos.length > 0,
        ).length,
      };
      allPostsFetchedAt = fallback.lastFetchedAt || allPostsFetchedAt;
      allPostsCold = false;
    }
  }

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
    <SourceFeedTemplate
      cold={allPostsCold}
      coldState={<ColdState />}
      header={{
        routeTitle: "REDDIT - TOP POSTS",
        liveLabel: "LIVE - 7D",
        eyebrow: `// REDDIT - LIVE FIREHOSE - ${
          allPostsFetchedAt ? formatRelative(allPostsFetchedAt).toUpperCase() : "COLD"
        }`,
        meta: [
          { label: "TRACKED", value: stats.totalPosts.toLocaleString("en-US") },
          { label: "WINDOW", value: "7D" },
        ],
        ...buildRedditHeader(posts, stats),
        accent: REDDIT_ACCENT,
        caption: [
          "// LAYOUT compact-v1",
          "- 3-COL - 320 / 1FR / 1FR",
          "- DATA UNCHANGED",
        ],
      }}
    >
      <Suspense fallback={<FeedSkeleton />}>
        <AllTrendingTabs posts={posts} />
      </Suspense>
    </SourceFeedTemplate>
  );
}

function FeedSkeleton() {
  return (
    <div
      style={{
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
      <p
        className="mt-3 max-w-xl text-sm"
        style={{ color: "var(--v4-ink-300)" }}
      >
        The Reddit scraper has not run yet. Run{" "}
        <code style={{ color: "var(--v4-ink-100)" }}>npm run scrape:reddit</code>{" "}
        locally to populate{" "}
        <code style={{ color: "var(--v4-ink-100)" }}>data/reddit-all-posts.json</code>,
        then refresh this page.
      </p>
    </section>
  );
}
