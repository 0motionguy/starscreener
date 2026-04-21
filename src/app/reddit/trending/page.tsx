// /reddit/trending — topic mindshare map + post feed.
//
// Hero: TopicMindshareMap (n-gram topic bubbles, sized by trending score,
// colored by baseline tier, click to filter feed). Below: AllTrendingTabs
// (TRENDING NOW / HOT 7D / BY SUBREDDIT) reading the same post universe.
//
// Mirrors the homepage layout (bubble hero + table) but swaps:
//   repos → topics, stars → upvotes, categories → baseline tiers.

import { Suspense } from "react";
import {
  allPostsCold,
  allPostsFetchedAt,
  getAllScoredPosts,
  getAllPostsStats,
} from "@/lib/reddit-all";
import { extractTopics } from "@/lib/reddit-topics";
import { SubredditMindshareMap } from "@/components/reddit-trending/SubredditMindshareMap";
import { AllTrendingTabs } from "@/components/reddit-trending/AllTrendingTabs";

export const dynamic = "force-static";

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

export default function RedditTrendingPage() {
  const posts = getAllScoredPosts();
  const stats = getAllPostsStats();
  // Topic count surfaced in stats tile — compute once using the 7d window
  // so the number matches the map's largest view.
  const topics7d = allPostsCold
    ? []
    : extractTopics(
        posts.filter(
          (p) => p.createdUtc * 1000 >= Date.now() - 7 * 24 * 60 * 60 * 1000,
        ),
        { maxTopics: 200 },
      );

  return (
    <main className="min-h-screen bg-bg-primary text-text-primary font-mono">
      <div className="max-w-[1400px] mx-auto px-4 md:px-6 py-6 md:py-8">
        {/* Header */}
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

        {/* Cold empty state — scraper hasn't run yet */}
        {allPostsCold ? (
          <ColdState />
        ) : (
          <>
            {/* Hero: topic mindshare map — hidden on phones (the 1200x400
                viewBox crushes to ~120px and the topic phrases are
                unreadable). Mobile users get the tabs + post feed which
                already covers the same data. */}
            <div className="hidden md:block">
              <Suspense fallback={<MapSkeleton />}>
                <SubredditMindshareMap posts={posts} limit={60} />
              </Suspense>
            </div>

            {/* Stat tiles */}
            <section className="mt-6 mb-6 grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatTile
                label="LAST SCRAPE"
                value={formatRelative(allPostsFetchedAt)}
                hint={new Date(allPostsFetchedAt)
                  .toISOString()
                  .slice(0, 16)
                  .replace("T", " ")}
              />
              <StatTile
                label="POSTS TRACKED"
                value={stats.totalPosts.toLocaleString()}
                hint="last 7d, deduped + capped"
              />
              <StatTile
                label="BREAKOUTS 24H"
                value={String(stats.breakouts24h)}
                hint="posts ≥10× sub baseline"
              />
              <StatTile
                label="TOPICS"
                value={String(topics7d.length)}
                hint={`${stats.postsWithLinkedRepos} posts link a tracked repo`}
              />
            </section>

            {/* Feed below map */}
            <Suspense fallback={<FeedSkeleton />}>
              <AllTrendingTabs posts={posts} />
            </Suspense>
          </>
        )}
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

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
      Loading mindshare map…
    </div>
  );
}

function FeedSkeleton() {
  return (
    <div className="border border-dashed border-border-primary rounded-md p-6 bg-bg-secondary/40 text-sm text-text-tertiary">
      Loading feed…
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
        The Reddit scraper hasn&apos;t run yet. Run{" "}
        <code className="text-text-primary">npm run scrape:reddit</code> locally
        to populate <code className="text-text-primary">data/reddit-all-posts.json</code>,
        then refresh this page.
      </p>
    </section>
  );
}
