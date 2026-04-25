// /reddit — Reddit Signal Terminal page.
//
// Tabs:
//   1. Repo Mentions (default) — tracked repos discussed on Reddit, with
//      subreddit context and the top post inline on every row.
//   2. Trending News — top Reddit posts across watched AI-dev subs.
//   3. Subreddits — dense list with mention totals and the top repo
//      discussed in each subreddit.
//   4. Topics — n-gram topic clusters extracted from post titles
//      (replaces the retired bubble-map mindshare view).
//
// No bubble map. No "scan now" button. Auto-rescrape runs server-side
// when the source goes stale. Right-rail surfaces top topics so the
// feed is one click from the cross-cutting view.

import Link from "next/link";

import {
  getAllRedditMentions,
  getAllRedditPosts,
  getRedditFetchedAt,
  getRedditStats,
  getRedditSubreddits,
} from "@/lib/reddit-data";
import { getAllScoredPosts } from "@/lib/reddit-all-data";
import { extractTopics, type Topic } from "@/lib/reddit-topics";
import {
  SignalSourcePage,
  type SignalTabSpec,
} from "@/components/signal/SignalSourcePage";
import type { SignalRow } from "@/components/signal/SignalTable";
import type { SignalMetricCardProps } from "@/components/signal/SignalMetricCard";
import { classifyFreshness } from "@/lib/news/freshness";
import { triggerScanIfStale } from "@/lib/news/auto-rescrape";

export const dynamic = "force-dynamic";

const SUBTITLE =
  "Live Reddit discussions ranked by repo mentions, subreddit velocity, and builder relevance.";

interface SubredditTally {
  subreddit: string;
  mentions: number;
  topRepo: string | null;
  topRepoCount: number;
  upvotesSum: number;
  commentsSum: number;
}

function classifyVelocity(
  comments: number,
  postedAtMs: number,
): "hot" | "rising" | null {
  const hours = Math.max(0.25, (Date.now() - postedAtMs) / 3_600_000);
  const perHour = comments / hours;
  if (perHour >= 10) return "hot";
  if (perHour >= 3) return "rising";
  return null;
}

function scaleScore(values: number[]): (n: number) => number {
  const max = Math.max(...values, 1);
  return (n: number) => Math.round((n / max) * 100);
}

export default function RedditPage() {
  const fetchedAt = getRedditFetchedAt();
  const verdict = classifyFreshness("reddit", fetchedAt);

  const mentions = getAllRedditMentions();
  const stats = getRedditStats();
  const subreddits = getRedditSubreddits();
  const allPosts = getAllRedditPosts();

  // ─── Repo Mentions tab ─────────────────────────────────────────────────
  const mentionEntries = Object.entries(mentions)
    .filter(([, m]) => m.count7d > 0)
    .sort((a, b) => b[1].count7d - a[1].count7d)
    .slice(0, 50);
  const mentionScale = scaleScore(mentionEntries.map(([, m]) => m.upvotes7d));

  const mentionRows: SignalRow[] = mentionEntries.map(([fullName, m]) => {
    const top = m.posts[0] ?? null;
    const postedAtMs = top ? top.createdUtc * 1000 : 0;
    const subList = Array.from(
      new Set(m.posts.slice(0, 4).map((p) => `r/${p.subreddit}`)),
    ).slice(0, 3);
    return {
      id: `reddit-mention:${fullName}`,
      title: fullName,
      href: `/repo/${fullName}`,
      external: false,
      attribution: top
        ? `${m.count7d}× · ${subList.join(" · ")} · "${top.title.slice(0, 80)}${top.title.length > 80 ? "…" : ""}"`
        : `${m.count7d}× / 7d`,
      engagement: m.upvotes7d,
      engagementLabel: "Upvotes",
      comments: top?.numComments,
      velocity: top ? classifyVelocity(top.numComments ?? 0, postedAtMs) : null,
      postedAt: top ? new Date(postedAtMs).toISOString() : null,
      signalScore: mentionScale(m.upvotes7d),
      linkedRepo: null,
      badges: m.count7d >= 5 ? ["fire"] : undefined,
    };
  });

  // ─── Trending News tab ─────────────────────────────────────────────────
  const topPosts = allPosts.slice().sort((a, b) => b.score - a.score).slice(0, 30);
  const newsScale = scaleScore(topPosts.map((p) => p.score));

  const newsRows: SignalRow[] = topPosts.map((post) => {
    const postedAtMs = post.createdUtc * 1000;
    return {
      id: `reddit-news:${post.id}`,
      title: post.title,
      href: post.url || `https://www.reddit.com${post.permalink}`,
      external: true,
      attribution: `r/${post.subreddit} · u/${post.author}`,
      engagement: post.score,
      engagementLabel: "Upvotes",
      comments: post.numComments,
      velocity: classifyVelocity(post.numComments ?? 0, postedAtMs),
      postedAt: new Date(postedAtMs).toISOString(),
      signalScore: newsScale(post.score),
      linkedRepo: post.repoFullName ?? null,
    };
  });

  // ─── Subreddits aggregation ────────────────────────────────────────────
  const tally = new Map<string, SubredditTally>();
  for (const [fullName, m] of Object.entries(mentions)) {
    for (const post of m.posts) {
      const sub = post.subreddit;
      const cur =
        tally.get(sub) ?? {
          subreddit: sub,
          mentions: 0,
          topRepo: null,
          topRepoCount: 0,
          upvotesSum: 0,
          commentsSum: 0,
        };
      cur.mentions += 1;
      cur.upvotesSum += post.score ?? 0;
      cur.commentsSum += post.numComments ?? 0;
      const repoCount = m.posts.filter((p) => p.subreddit === sub).length;
      if (repoCount > cur.topRepoCount) {
        cur.topRepo = fullName;
        cur.topRepoCount = repoCount;
      }
      tally.set(sub, cur);
    }
  }
  const subList = Array.from(tally.values()).sort(
    (a, b) => b.mentions - a.mentions,
  );

  // ─── Topics aggregation (replaces retired bubble map) ──────────────────
  const allScored = getAllScoredPosts();
  const topics: Topic[] = extractTopics(
    allScored.filter(
      (p) => p.createdUtc * 1000 >= Date.now() - 7 * 24 * 60 * 60 * 1000,
    ),
    { maxTopics: 30 },
  );

  // ─── Metric strip ─────────────────────────────────────────────────────
  const last24hPosts = allPosts.filter(
    (p) => Date.now() - p.createdUtc * 1000 < 24 * 3_600_000,
  );
  const commentsLast24h = last24hPosts.reduce(
    (s, p) => s + (p.numComments ?? 0),
    0,
  );
  const commentsPerHour = commentsLast24h / 24;
  const hotDiscussions = allPosts.filter(
    (p) => classifyVelocity(p.numComments ?? 0, p.createdUtc * 1000) === "hot",
  ).length;
  const activeSubs = subList.filter((s) => s.mentions > 0).length;
  const topRepo = stats.topRepos[0]?.fullName.split("/")[1] ?? "—";

  const metrics: SignalMetricCardProps[] = [
    {
      label: "Hot discussions",
      value: hotDiscussions,
      helper: hotDiscussions > 0 ? "≥10 cmt/h sustained" : "no hot threads now",
      sparkTone: "warning",
    },
    {
      label: "Repo mentions",
      value: stats.reposWithMentions,
      delta: stats.totalMentions > 0 ? `${stats.totalMentions} total` : null,
      sparkTone: "brand",
    },
    {
      label: "Active subreddits",
      value: `${activeSubs} / ${subreddits.length}`,
      helper: subList[0]?.subreddit ? `top: r/${subList[0].subreddit}` : null,
      sparkTone: "info",
    },
    {
      label: "Comments velocity",
      value: `${Math.round(commentsPerHour)}/h`,
      helper:
        commentsPerHour >= 10
          ? "Hot"
          : commentsPerHour >= 3
            ? "Rising"
            : "Steady",
      sparkTone: commentsPerHour >= 10 ? "warning" : "info",
    },
    {
      label: "Top topic",
      value: topics[0]?.phrase ?? "—",
      helper: topics[0]
        ? `${topics[0].count} posts · r/${topics[0].dominantSub}`
        : null,
      sparkTone: "up",
    },
    {
      label: "Top repo",
      value: topRepo,
      helper: stats.topRepos[0]
        ? `${stats.topRepos[0].count7d}× · ${stats.topRepos[0].upvotes7d}↑`
        : null,
      sparkTone: "brand",
    },
  ];

  // ─── Tabs ─────────────────────────────────────────────────────────────
  const tabs: SignalTabSpec[] = [
    {
      id: "mentions",
      label: "Repo Mentions",
      rows: mentionRows,
      columns: ["rank", "title", "engagement", "velocity", "age", "signal"],
      emptyTitle: "No tracked repos mentioned on Reddit in the last 7 days.",
      emptySubtitle:
        "Pipeline is healthy; the watch list just hasn't lit up yet.",
    },
    {
      id: "news",
      label: "Trending News",
      rows: newsRows,
      columns: [
        "rank",
        "title",
        "linkedRepo",
        "engagement",
        "velocity",
        "age",
        "signal",
      ],
      emptyTitle: "Reddit is quiet right now. Check back in a few minutes.",
    },
    {
      id: "subreddits",
      label: "Subreddits",
      rows: [],
      content: <SubredditsList rows={subList} />,
    },
    {
      id: "topics",
      label: "Topics",
      rows: [],
      content: <TopicsList topics={topics} />,
    },
  ];

  void triggerScanIfStale("reddit", fetchedAt);

  return (
    <SignalSourcePage
      source="reddit"
      sourceLabel="REDDIT"
      mode="TRENDING"
      subtitle={SUBTITLE}
      fetchedAt={fetchedAt}
      freshnessStatus={verdict.status}
      ageLabel={verdict.ageLabel}
      metrics={metrics}
      tabs={tabs}
      rightRail={<TopTopicsPanel topics={topics} />}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Subreddits tab — dense list. No chart, no bubble map.
// ─────────────────────────────────────────────────────────────────────────

function SubredditsList({ rows }: { rows: SubredditTally[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-card border border-dashed border-border-primary bg-bg-muted/30 px-4 py-10 text-center">
        <p className="font-mono text-sm text-text-tertiary">
          No active subreddits in the current window.
        </p>
      </div>
    );
  }
  const max = rows[0]?.mentions ?? 1;
  return (
    <div className="overflow-x-auto rounded-card border border-border-primary bg-bg-card">
      <table className="w-full text-xs">
        <thead className="text-left text-text-tertiary">
          <tr className="border-b border-border-primary bg-bg-muted/40">
            <th className="px-2 py-2 w-10 font-mono text-[10px] uppercase tracking-[0.12em]">
              #
            </th>
            <th className="px-2 py-2 font-mono text-[10px] uppercase tracking-[0.12em]">
              Subreddit
            </th>
            <th className="px-2 py-2 w-44 font-mono text-[10px] uppercase tracking-[0.12em]">
              Volume
            </th>
            <th className="px-2 py-2 hidden md:table-cell font-mono text-[10px] uppercase tracking-[0.12em]">
              Top repo
            </th>
            <th className="px-2 py-2 w-20 hidden md:table-cell font-mono text-[10px] uppercase tracking-[0.12em]">
              Upvotes
            </th>
            <th className="px-2 py-2 w-20 hidden md:table-cell font-mono text-[10px] uppercase tracking-[0.12em]">
              Comments
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => (
            <tr
              key={r.subreddit}
              className="border-b border-border-primary/40 last:border-b-0 hover:bg-bg-muted/20"
            >
              <td className="px-2 py-2 font-mono text-text-tertiary tabular-nums">
                {idx + 1}
              </td>
              <td className="px-2 py-2">
                <a
                  href={`https://www.reddit.com/r/${r.subreddit}/`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-text-primary hover:underline"
                >
                  r/{r.subreddit}
                </a>
              </td>
              <td className="px-2 py-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono tabular-nums text-text-secondary w-8">
                    {r.mentions}
                  </span>
                  <div className="h-1.5 w-24 rounded-full bg-bg-muted overflow-hidden">
                    <div
                      className="h-full bg-brand"
                      style={{
                        width: `${Math.max(4, (r.mentions / max) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              </td>
              <td className="px-2 py-2 hidden md:table-cell">
                {r.topRepo ? (
                  <Link
                    href={`/repo/${r.topRepo}`}
                    className="font-mono text-[11px] text-functional hover:underline"
                  >
                    {r.topRepo}
                  </Link>
                ) : (
                  <span className="text-text-tertiary">—</span>
                )}
              </td>
              <td className="px-2 py-2 hidden md:table-cell font-mono text-text-secondary tabular-nums">
                {r.upvotesSum}
              </td>
              <td className="px-2 py-2 hidden md:table-cell font-mono text-text-tertiary tabular-nums">
                {r.commentsSum}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Topics tab — n-gram topic clusters (replaces the retired bubble map).
// ─────────────────────────────────────────────────────────────────────────

function TopicsList({ topics }: { topics: Topic[] }) {
  if (topics.length === 0) {
    return (
      <div className="rounded-card border border-dashed border-border-primary bg-bg-muted/30 px-4 py-10 text-center">
        <p className="font-mono text-sm text-text-tertiary">
          Topic clustering is warming up.
        </p>
      </div>
    );
  }
  const max = topics[0]?.count ?? 1;
  return (
    <div className="overflow-x-auto rounded-card border border-border-primary bg-bg-card">
      <table className="w-full text-xs">
        <thead className="text-left text-text-tertiary">
          <tr className="border-b border-border-primary bg-bg-muted/40">
            <th className="px-2 py-2 w-10 font-mono text-[10px] uppercase tracking-[0.12em]">
              #
            </th>
            <th className="px-2 py-2 font-mono text-[10px] uppercase tracking-[0.12em]">
              Topic
            </th>
            <th className="px-2 py-2 w-44 font-mono text-[10px] uppercase tracking-[0.12em]">
              Volume
            </th>
            <th className="px-2 py-2 hidden md:table-cell font-mono text-[10px] uppercase tracking-[0.12em]">
              Dominant sub
            </th>
            <th className="px-2 py-2 w-20 hidden md:table-cell font-mono text-[10px] uppercase tracking-[0.12em]">
              Upvotes
            </th>
          </tr>
        </thead>
        <tbody>
          {topics.map((t, idx) => (
            <tr
              key={t.phrase}
              className="border-b border-border-primary/40 last:border-b-0 hover:bg-bg-muted/20"
            >
              <td className="px-2 py-2 font-mono text-text-tertiary tabular-nums">
                {idx + 1}
              </td>
              <td className="px-2 py-2 font-medium text-text-primary">
                {t.phrase}
              </td>
              <td className="px-2 py-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono tabular-nums text-text-secondary w-8">
                    {t.count}
                  </span>
                  <div className="h-1.5 w-24 rounded-full bg-bg-muted overflow-hidden">
                    <div
                      className="h-full bg-brand"
                      style={{
                        width: `${Math.max(4, (t.count / max) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              </td>
              <td className="px-2 py-2 hidden md:table-cell">
                <a
                  href={`https://www.reddit.com/r/${t.dominantSub}/`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-[11px] text-text-secondary hover:text-text-primary hover:underline"
                >
                  r/{t.dominantSub}
                </a>
              </td>
              <td className="px-2 py-2 hidden md:table-cell font-mono text-text-tertiary tabular-nums">
                {t.upvotesSum.toLocaleString("en-US")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Right-rail panel — top topics at a glance.
// ─────────────────────────────────────────────────────────────────────────

function TopTopicsPanel({ topics }: { topics: Topic[] }) {
  if (topics.length === 0) return null;
  const max = topics[0]?.count ?? 1;
  return (
    <div className="rounded-card border border-border-primary bg-bg-card p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="font-mono text-[10px] uppercase tracking-[0.16em] text-text-tertiary">
          Top Topics
        </h2>
        <span className="font-mono text-[10px] text-text-tertiary">7d</span>
      </div>
      <ol className="space-y-1.5">
        {topics.slice(0, 8).map((t, idx) => (
          <li
            key={t.phrase}
            className="flex items-center gap-2 text-xs"
            title={`${t.count} posts · r/${t.dominantSub} · ${t.upvotesSum}↑`}
          >
            <span className="font-mono text-text-tertiary tabular-nums w-4">
              {idx + 1}
            </span>
            <span className="flex-1 truncate text-text-primary">
              {t.phrase}
            </span>
            <span className="font-mono tabular-nums text-text-secondary w-6 text-right">
              {t.count}
            </span>
            <div className="h-1 w-12 rounded-full bg-bg-muted overflow-hidden">
              <div
                className="h-full bg-brand"
                style={{
                  width: `${Math.max(4, (t.count / max) * 100)}%`,
                }}
              />
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
