// /reddit/trending - post feed (bubble map removed per UX request).

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

const REDDIT_ACCENT = "rgba(255, 77, 77, 0.85)";

export const revalidate = 300;

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
      className="p-6 text-sm"
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
      className="p-8"
      style={{
        background: "var(--v4-bg-025)",
        border: "1px dashed var(--v4-line-100)",
        borderRadius: 2,
      }}
    >
      <h2
        className="v2-mono text-lg font-bold uppercase tracking-[0.18em]"
        style={{ color: "#ff4500" }}
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
