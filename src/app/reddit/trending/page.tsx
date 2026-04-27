// /reddit/trending - topic mindshare map + post feed.

import { Suspense } from "react";

import {
  getAllPostsFetchedAt,
  getAllPostsStats,
  getAllScoredPosts,
  isAllPostsCold,
  refreshRedditAllPostsFromStore,
} from "@/lib/reddit-all-data";
import { extractTopics } from "@/lib/reddit-topics";
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
  const topics7d = allPostsCold
    ? []
    : extractTopics(
        posts.filter(
          (post) =>
            post.createdUtc * 1000 >= Date.now() - 7 * 24 * 60 * 60 * 1000,
        ),
        { maxTopics: 200 },
      );

  return (
    <main className="min-h-screen bg-bg-primary text-text-primary font-mono">
      <div className="max-w-[1400px] mx-auto px-4 md:px-6 py-6 md:py-8">
        <header className="mb-6 border-b border-border-primary pb-6">
          <div className="flex items-baseline gap-3 flex-wrap">
            <h1 className="text-2xl font-bold uppercase tracking-wider">
              REDDIT / ALL TRENDING
            </h1>
            <span className="text-xs text-text-tertiary">
              {"// topic mindshare across 45 AI subs"}
            </span>
          </div>
          <p className="mt-2 text-sm text-text-secondary max-w-2xl">
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

function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="border border-border-primary rounded-md px-4 py-3 bg-bg-secondary">
      <div className="text-[10px] uppercase tracking-wider text-text-tertiary">
        {label}
      </div>
      <div className="mt-1 text-xl font-bold truncate">{value}</div>
      {hint ? (
        <div className="mt-0.5 text-[11px] text-text-tertiary truncate">
          {hint}
        </div>
      ) : null}
    </div>
  );
}

function MapSkeleton() {
  return (
    <div className="rounded-card border border-border-primary bg-bg-card/40 h-[400px] flex items-center justify-center text-sm text-text-tertiary">
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
