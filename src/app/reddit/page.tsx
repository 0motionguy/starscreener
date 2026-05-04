// /reddit - Reddit signal view.
//
// Reads the latest data/reddit-mentions.json on each request so local
// scraper runs show up without restarting Next.js.

import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";

import { getBreakoutCountLast24h, repoFullNameToHref } from "@/lib/reddit";
import {
  getAllRedditPosts,
  getRedditFetchedAt,
  getRedditStats,
  getRedditSubreddits,
  isRedditCold,
  refreshRedditMentionsFromStore,
} from "@/lib/reddit-data";
import { RedditTabsClient } from "@/components/reddit/RedditTabsClient";
import { StatStrip } from "@/components/ui/StatStrip";

const REDDIT_ORANGE = "#ff4500";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Repos Trending on Reddit",
  description:
    "GitHub repos breaking out across r/programming, r/webdev, r/MachineLearning and the wider tech subreddits. Live mention scoring and breakout flagging.",
  alternates: { canonical: "/reddit" },
  openGraph: {
    title: "Repos Trending on Reddit — TrendingRepo",
    description: "GitHub repos breaking out across the tech subreddits, live-scored.",
    url: "/reddit",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Repos Trending on Reddit — TrendingRepo",
    description: "GitHub repos breaking out across the tech subreddits, live-scored.",
  },
};

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

export default async function RedditPage() {
  await refreshRedditMentionsFromStore();
  const redditFetchedAt = getRedditFetchedAt();
  const redditCold = isRedditCold();
  const stats = getRedditStats();
  const allPosts = getAllRedditPosts();
  const subreddits = getRedditSubreddits();
  const breakouts24h = getBreakoutCountLast24h(allPosts);

  return (
    <main className="min-h-screen bg-bg-primary text-text-primary font-mono">
      <div className="max-w-[1400px] mx-auto px-6 py-8">
        <div className="mb-6">
          <StatStrip
            eyebrow={`// REDDIT · ${subreddits.length} SUBS · 24H`}
            status={`${stats.totalMentions} MENTIONS · ${redditCold ? "COLD" : "LIVE"}`}
            accent={REDDIT_ORANGE}
            stats={[
              {
                label: "Repos Hit",
                value: stats.reposWithMentions.toLocaleString("en-US"),
                hint: `${stats.totalMentions} total mentions`,
                tone: "accent",
              },
              {
                label: "Posts Scanned",
                value: stats.postsScanned.toLocaleString("en-US"),
                hint: `across ${stats.subredditsScanned} subs`,
              },
              {
                label: "Breakouts 24H",
                value: breakouts24h.toLocaleString("en-US"),
                hint:
                  breakouts24h > 0
                    ? "≥10x sub baseline"
                    : stats.topRepos[0]
                      ? `top: ${stats.topRepos[0].fullName.split("/")[1]}`
                      : "no data yet",
                tone: breakouts24h > 0 ? "up" : "default",
              },
              {
                label: "Last Scrape",
                value:
                  redditCold || !redditFetchedAt
                    ? "—"
                    : formatRelative(redditFetchedAt),
                hint:
                  redditCold || !redditFetchedAt
                    ? "run scraper"
                    : new Date(redditFetchedAt)
                        .toISOString()
                        .slice(0, 16)
                        .replace("T", " "),
              },
            ]}
          />
        </div>

        {redditCold ? (
          <ColdStart subreddits={subreddits} />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
            <Suspense fallback={<FeedSkeleton />}>
              <RedditTabsClient posts={allPosts} />
            </Suspense>
            <Leaderboard repos={stats.topRepos} />
          </div>
        )}
      </div>
    </main>
  );
}

function ColdStart({ subreddits }: { subreddits: string[] }) {
  return (
    <section
      className="p-8"
      style={{
        background: "var(--v3-bg-025)",
        border: "1px dashed var(--v3-line-100)",
        borderRadius: 2,
      }}
    >
      <div className="max-w-2xl">
        <h2
          className="v2-mono text-lg font-bold uppercase tracking-[0.18em]"
          style={{ color: REDDIT_ORANGE }}
        >
          {"// no data yet"}
        </h2>
        <p
          className="mt-3 text-sm leading-relaxed"
          style={{ color: "var(--v3-ink-300)" }}
        >
          The Reddit scraper has not run yet. It uses Reddit&apos;s public JSON
          endpoints (no OAuth, no app registration required) and scans the most
          recent 100 posts from each subreddit below for GitHub repo mentions.
        </p>

        <div
          className="mt-6 p-4"
          style={{
            background: "var(--v3-bg-000)",
            border: "1px solid var(--v3-line-200)",
            borderRadius: 2,
          }}
        >
          <div
            className="v2-mono mb-2 text-[11px] uppercase tracking-[0.18em]"
            style={{ color: "var(--v3-ink-400)" }}
          >
            run locally
          </div>
          <pre
            className="overflow-x-auto text-xs"
            style={{ color: "var(--v3-ink-100)" }}
          >
{`node scripts/scrape-reddit.mjs
# or
npm run scrape:reddit`}
          </pre>
          <p
            className="mt-3 text-[11px]"
            style={{ color: "var(--v3-ink-400)" }}
          >
            Takes about 4 minutes ({subreddits.length} subs x 5s pause each),
            plus request time. Writes `data/reddit-mentions.json`. Refresh this
            page after.
          </p>
        </div>

        <div className="mt-6">
          <div
            className="v2-mono mb-2 text-[11px] uppercase tracking-[0.18em]"
            style={{ color: "var(--v3-ink-400)" }}
          >
            subreddits scanned ({subreddits.length})
          </div>
          <div className="flex flex-wrap gap-1.5">
            {subreddits.map((subreddit) => (
              <a
                key={subreddit}
                href={`https://www.reddit.com/r/${subreddit}/new/`}
                target="_blank"
                rel="noopener noreferrer"
                className="v2-mono px-2 py-1 text-[11px] tracking-[0.14em] uppercase transition-colors"
                style={{
                  border: "1px solid var(--v3-line-200)",
                  color: "var(--v3-ink-300)",
                  borderRadius: 2,
                }}
              >
                r/{subreddit}
              </a>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function FeedSkeleton() {
  return (
    <div
      className="p-6 text-sm"
      style={{
        background: "var(--v3-bg-025)",
        border: "1px solid var(--v3-line-200)",
        borderRadius: 2,
        color: "var(--v3-ink-400)",
      }}
    >
      Loading feed...
    </div>
  );
}

function Leaderboard({
  repos,
}: {
  repos: ReturnType<typeof getRedditStats>["topRepos"];
}) {
  if (repos.length === 0) return null;
  return (
    <aside>
      <h2
        className="v2-mono mb-3 text-[11px] uppercase tracking-[0.18em]"
        style={{ color: "var(--v3-ink-400)" }}
      >
        {"// repo leaderboard"}
      </h2>
      <ol className="space-y-1.5">
        {repos.map((repo, index) => {
          const stagger = Math.min(index, 6) * 50;
          return (
            <li
              key={repo.fullName}
              className="v2-row group px-3 py-2"
              style={{
                background: "var(--v3-bg-050)",
                border: "1px solid var(--v3-line-200)",
                borderRadius: 2,
                animation: "slide-up 0.35s cubic-bezier(0.2, 0.8, 0.2, 1) both",
                animationDelay: stagger > 0 ? `${stagger}ms` : undefined,
              }}
            >
              <Link
                href={repoFullNameToHref(repo.fullName)}
                className="flex items-center justify-between gap-2 text-xs"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className="w-5 text-right tabular-nums"
                    style={{ color: "var(--v3-ink-400)" }}
                  >
                    {index + 1}
                  </span>
                  <span
                    className="truncate transition-colors group-hover:text-[color:var(--v3-acc)]"
                    style={{ color: "var(--v3-ink-100)" }}
                  >
                    {repo.fullName}
                  </span>
                </span>
                <span
                  className="flex-shrink-0 tabular-nums"
                  style={{ color: "var(--v3-ink-400)" }}
                >
                  {repo.upvotes7d}↑ · {repo.count7d}x
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}
