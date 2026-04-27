// /reddit/trending - topic mindshare map + post feed.

import { Suspense } from "react";

import {
  getAllPostsFetchedAt,
  getAllPostsStats,
  getAllScoredPosts,
  isAllPostsCold,
  refreshRedditAllPostsFromStore,
} from "@/lib/reddit-all-data";
import { SubredditMindshareMap } from "@/components/reddit-trending/SubredditMindshareMap";
import { AllTrendingTabs } from "@/components/reddit-trending/AllTrendingTabs";
import { NewsTopHeaderV3 } from "@/components/news/NewsTopHeaderV3";
import { buildRedditHeader } from "@/components/news/newsTopMetrics";

const REDDIT_ACCENT = "rgba(255, 77, 77, 0.85)";

export const dynamic = "force-dynamic";

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "unknown";
  const diff = Date.now() - t;
  if (diff < 60_000) return "just now";
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default async function RedditTrendingPage() {
  await refreshRedditAllPostsFromStore();
  const allPostsFetchedAt = getAllPostsFetchedAt();
  const allPostsCold = isAllPostsCold();
  const posts = getAllScoredPosts();
  const stats = getAllPostsStats();

  return (
    <main className="min-h-screen bg-bg-primary text-text-primary font-mono">
      <div className="max-w-[1400px] mx-auto px-4 md:px-6 py-6 md:py-8">
        {/* V3 page header — mono eyebrow + title + tight subtitle. */}
        <header
          className="mb-5 pb-4 border-b"
          style={{ borderColor: "var(--v3-line-100)" }}
        >
          <div
            className="v2-mono mb-2 text-[10px] tracking-[0.18em] uppercase"
            style={{ color: "var(--v3-ink-400)" }}
          >
            {"// TOPIC MINDSHARE ACROSS 45 AI SUBS"}
          </div>
          <h1
            className="text-2xl font-bold uppercase tracking-wider"
            style={{ color: "var(--v3-ink-000)" }}
          >
            REDDIT / ALL TRENDING
          </h1>
          <p
            className="mt-2 text-[13px] leading-relaxed max-w-2xl"
            style={{ color: "var(--v3-ink-300)" }}
          >
            Every scored Reddit post across the tracked subs. Topic phrases are
            extracted from titles with n-gram frequency + baseline-tier
            weighting. Click a bubble to filter the feed to posts discussing
            that topic.
          </p>
        </header>

        {allPostsCold ? (
          <ColdState />
        ) : (
          <>
            {/* V3 top header — 3 chart cards + 3 hero posts. */}
            <div className="mb-6">
              <NewsTopHeaderV3
                eyebrow="// REDDIT · TOP POSTS"
                status={`${stats.totalPosts.toLocaleString("en-US")} TRACKED · 7D · ${
                  allPostsFetchedAt ? formatRelative(allPostsFetchedAt).toUpperCase() : "COLD"
                }`}
                {...buildRedditHeader(posts, stats)}
                accent={REDDIT_ACCENT}
              />
            </div>

            <div className="hidden md:block">
              <Suspense fallback={<MapSkeleton />}>
                <SubredditMindshareMap posts={posts} limit={60} />
              </Suspense>
            </div>

            <Suspense fallback={<FeedSkeleton />}>
              <AllTrendingTabs posts={posts} />
            </Suspense>
          </>
        )}
      </div>
    </main>
  );
}

function MapSkeleton() {
  return (
    <div className="v2-card/40 h-[400px] flex items-center justify-center text-sm text-text-tertiary">
      Loading mindshare map...
    </div>
  );
}

function FeedSkeleton() {
  return (
    <div className="border border-dashed border-border-primary rounded-md p-6 bg-bg-secondary/40 text-sm text-text-tertiary">
      Loading feed...
    </div>
  );
}

function ColdState() {
  return (
    <section className="border border-dashed border-border-primary rounded-md p-8 bg-bg-secondary/40">
      <h2 className="text-lg font-bold uppercase tracking-wider text-accent-green">
        {"// no data yet"}
      </h2>
      <p className="mt-3 text-sm text-text-secondary max-w-xl">
        The Reddit scraper has not run yet. Run{" "}
        <code className="text-text-primary">npm run scrape:reddit</code> locally
        to populate{" "}
        <code className="text-text-primary">data/reddit-all-posts.json</code>,
        then refresh this page.
      </p>
    </section>
  );
}
