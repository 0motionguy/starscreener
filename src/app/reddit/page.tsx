// /reddit - Reddit signal view.
//
// Reads the latest data/reddit-mentions.json on each request so local
// scraper runs show up without restarting Next.js.

import { Suspense } from "react";
import Link from "next/link";

import { getBreakoutCountLast24h, repoFullNameToHref } from "@/lib/reddit";
import {
  getAllRedditPosts,
  getRedditFetchedAt,
  getRedditStats,
  getRedditSubreddits,
  isRedditCold,
} from "@/lib/reddit-data";
import { RedditTabsClient } from "@/components/reddit/RedditTabsClient";

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

export default function RedditPage() {
  const redditFetchedAt = getRedditFetchedAt();
  const redditCold = isRedditCold();
  const stats = getRedditStats();
  const allPosts = getAllRedditPosts();
  const subreddits = getRedditSubreddits();
  const breakouts24h = getBreakoutCountLast24h(allPosts);

  return (
    <main className="min-h-screen bg-bg-primary text-text-primary font-mono">
      <div className="max-w-[1400px] mx-auto px-6 py-8">
        <header className="mb-8 border-b border-border-primary pb-6">
          <div className="flex items-baseline gap-3">
            <h1 className="text-2xl font-bold uppercase tracking-wider">
              REDDIT
            </h1>
            <span className="text-xs text-text-tertiary">
              {"// r/AI-signal · local preview"}
            </span>
          </div>
          <p className="mt-2 text-sm text-text-secondary max-w-2xl">
            GitHub repo mentions aggregated across {subreddits.length} AI-dev
            subreddits (mirrors the agnt.newsroom watcher list). Scans the
            most recent ~100 posts per sub, matches
            github.com/&lt;owner&gt;/&lt;name&gt; against tracked repos.
          </p>
        </header>

        <section className="mb-6 grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatTile
            label="LAST SCRAPE"
            value={
              redditCold || !redditFetchedAt
                ? "—"
                : formatRelative(redditFetchedAt)
            }
            hint={
              redditCold || !redditFetchedAt
                ? "run scraper"
                : new Date(redditFetchedAt)
                    .toISOString()
                    .slice(0, 16)
                    .replace("T", " ")
            }
          />
          <StatTile
            label="REPOS HIT"
            value={String(stats.reposWithMentions)}
            hint={`${stats.totalMentions} total mentions`}
          />
          <StatTile
            label="POSTS SCANNED"
            value={String(stats.postsScanned)}
            hint={`across ${stats.subredditsScanned} subs`}
          />
          <StatTile
            label="BREAKOUTS 24H"
            value={String(breakouts24h)}
            hint={
              breakouts24h > 0
                ? "posts >=10x sub baseline"
                : stats.topRepos[0]
                  ? `top: ${stats.topRepos[0].fullName.split("/")[1]}`
                  : "no data yet"
            }
          />
        </section>

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

function ColdStart({ subreddits }: { subreddits: string[] }) {
  return (
    <section className="border border-dashed border-border-primary rounded-md p-8 bg-bg-secondary/40">
      <div className="max-w-2xl">
        <h2 className="text-lg font-bold uppercase tracking-wider text-accent-green">
          {"// no data yet"}
        </h2>
        <p className="mt-3 text-sm text-text-secondary leading-relaxed">
          The Reddit scraper has not run yet. It uses Reddit&apos;s public JSON
          endpoints (no OAuth, no app registration required) and scans the most
          recent 100 posts from each subreddit below for GitHub repo mentions.
        </p>

        <div className="mt-6 rounded border border-border-primary bg-bg-primary p-4">
          <div className="text-[11px] uppercase tracking-wider text-text-tertiary mb-2">
            run locally
          </div>
          <pre className="text-xs text-text-primary overflow-x-auto">
{`node scripts/scrape-reddit.mjs
# or
npm run scrape:reddit`}
          </pre>
          <p className="mt-3 text-[11px] text-text-tertiary">
            Takes about 4 minutes ({subreddits.length} subs x 5s pause each),
            plus request time. Writes `data/reddit-mentions.json`. Refresh this
            page after.
          </p>
        </div>

        <div className="mt-6">
          <div className="text-[11px] uppercase tracking-wider text-text-tertiary mb-2">
            subreddits scanned ({subreddits.length})
          </div>
          <div className="flex flex-wrap gap-1.5">
            {subreddits.map((subreddit) => (
              <a
                key={subreddit}
                href={`https://www.reddit.com/r/${subreddit}/new/`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] px-2 py-1 rounded border border-border-primary text-text-secondary hover:text-brand hover:border-brand transition-colors"
              >
                r/{subreddit}
              </a>
            ))}
          </div>
        </div>

        <p className="mt-6 text-[11px] text-text-tertiary leading-relaxed">
          GitHub Actions can refresh this feed on a schedule. If Reddit tightens
          anonymous limits later, the next step is an installed-app OAuth flow
          with a descriptive client id; the scraper already uses a custom
          User-Agent, so that upgrade stays isolated to the fetch layer.
        </p>
      </div>
    </section>
  );
}

function FeedSkeleton() {
  return (
    <div className="border border-border-primary rounded-md p-6 bg-bg-secondary/40 text-sm text-text-tertiary">
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
      <h2 className="text-sm uppercase tracking-wider text-text-tertiary mb-3">
        {"// repo leaderboard"}
      </h2>
      <ol className="space-y-1.5">
        {repos.map((repo, index) => (
          <li
            key={repo.fullName}
            className="border border-border-primary rounded-md px-3 py-2 bg-bg-secondary hover:border-brand transition-colors"
          >
            <Link
              href={repoFullNameToHref(repo.fullName)}
              className="flex items-center justify-between gap-2 text-xs"
            >
              <span className="flex items-center gap-2 min-w-0">
                <span className="text-text-tertiary tabular-nums w-5 text-right">
                  {index + 1}
                </span>
                <span className="text-text-primary truncate">
                  {repo.fullName}
                </span>
              </span>
              <span className="flex-shrink-0 text-text-tertiary tabular-nums">
                {repo.upvotes7d}↑ · {repo.count7d}x
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </aside>
  );
}
