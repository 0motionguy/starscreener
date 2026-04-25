// /bluesky/trending — Bluesky Signal Terminal page.
//
// Tabs:
//   1. Repo Mentions (default) — tracked repos discussed on Bluesky,
//      ranked by 7d mention volume + recency.
//   2. Trending News — top Bluesky posts across curated AI query
//      families (agents, LLMs, MCP, ...), regardless of repo linkage.
//
// No bubble map. No "scan now" button. Fresh data signal is the small
// LIVE/STALE pill in the header. Server-side auto-rescrape recovers a
// stale source quietly.

import {
  blueskyFetchedAt,
  bskyPostHref,
  getAllBlueskyMentions,
  getBlueskyFile,
} from "@/lib/bluesky";
import {
  getBlueskyTopPosts,
  getBlueskyTrendingFile,
} from "@/lib/bluesky-trending";
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
  "Developer conversations on Bluesky ranked by repost velocity, likes, replies, and repo mentions.";

function classifyVelocity(
  replies: number,
  postedAtMs: number,
): "hot" | "rising" | null {
  const hours = Math.max(0.25, (Date.now() - postedAtMs) / 3_600_000);
  const perHour = replies / hours;
  if (perHour >= 10) return "hot";
  if (perHour >= 3) return "rising";
  return null;
}

function scaleScore(values: number[]): (n: number) => number {
  const max = Math.max(...values, 1);
  return (n: number) => Math.round((n / max) * 100);
}

export default function BlueskyTrendingPage() {
  const fetchedAt = blueskyFetchedAt;
  const verdict = classifyFreshness("bluesky", fetchedAt);

  const mentions = getAllBlueskyMentions();
  const mentionsFile = getBlueskyFile();
  const trendingFile = getBlueskyTrendingFile();
  const trendingPosts = getBlueskyTopPosts(30);

  // ─── Repo Mentions tab ─────────────────────────────────────────────────
  // Sort repos by 7d mention count, then build a SignalRow per repo with
  // the top-post excerpt for context. Velocity comes from the top post's
  // replies/hour, signal score from a normalized engagement.
  const mentionEntries = Object.entries(mentions)
    .filter(([, m]) => m.count7d > 0)
    .sort((a, b) => b[1].count7d - a[1].count7d)
    .slice(0, 50);
  const mentionScale = scaleScore(mentionEntries.map(([, m]) => m.likesSum7d));

  const mentionRows: SignalRow[] = mentionEntries.map(([fullName, m]) => {
    const top = m.topPost;
    const postedAtMs = top ? Date.parse(top.createdAt) : 0;
    const excerpt = top
      ? top.text.length > 80
        ? `${top.text.slice(0, 80)}…`
        : top.text
      : null;
    return {
      id: `bluesky-mention:${fullName}`,
      title: fullName,
      href: `/repo/${fullName}`,
      external: false,
      attribution: top
        ? `${m.count7d}× · @${top.author.handle}: ${excerpt}`
        : `${m.count7d}× / 7d`,
      engagement: m.likesSum7d,
      engagementLabel: "Likes",
      comments: top?.replyCount,
      velocity: top
        ? classifyVelocity(top.replyCount ?? 0, postedAtMs)
        : null,
      postedAt: top ? top.createdAt : null,
      signalScore: mentionScale(m.likesSum7d),
      linkedRepo: null,
      badges: m.count7d >= 5 ? ["fire"] : undefined,
    };
  });

  // ─── Trending News tab ─────────────────────────────────────────────────
  // Re-rank by likes + 2*reposts + 0.5*replies for the signal score.
  const newsScale = scaleScore(
    trendingPosts.map(
      (p) => p.likeCount + 2 * p.repostCount + 0.5 * p.replyCount,
    ),
  );

  const newsRows: SignalRow[] = trendingPosts.map((post) => {
    const postedAtMs = Date.parse(post.createdAt);
    const score = post.likeCount + 2 * post.repostCount + 0.5 * post.replyCount;
    const title =
      post.text.length > 120 ? `${post.text.slice(0, 120)}…` : post.text;
    return {
      id: `bluesky-news:${post.uri}`,
      title,
      href: post.bskyUrl || bskyPostHref(post.uri, post.author.handle),
      external: true,
      attribution: `@${post.author.handle}`,
      engagement: post.likeCount,
      engagementLabel: "Likes",
      comments: post.replyCount,
      velocity: classifyVelocity(post.replyCount ?? 0, postedAtMs),
      postedAt: post.createdAt,
      signalScore: newsScale(score),
      linkedRepo: post.linkedRepos?.[0]?.fullName ?? null,
    };
  });

  // ─── Metric strip ─────────────────────────────────────────────────────
  const totalScanned = trendingFile.scannedPosts ?? 0;
  const repoMentionCount = Object.keys(mentions).length;
  const windowDays = mentionsFile.windowDays ?? 7;

  // Topic Momentum: top family hit count (post matching). Falls back to
  // keywordCounts when queryFamilies is absent.
  const families = trendingFile.queryFamilies ?? [];
  let topFamilyLabel: string | null = null;
  let topFamilyCount = 0;
  let activeFamilyCount = 0;
  if (families.length > 0) {
    const queryCounts = trendingFile.queryCounts ?? {};
    for (const fam of families) {
      const total = fam.queries.reduce(
        (sum, q) => sum + (queryCounts[q] ?? 0),
        0,
      );
      if (total > 0) activeFamilyCount += 1;
      if (total > topFamilyCount) {
        topFamilyCount = total;
        topFamilyLabel = fam.label;
      }
    }
  } else {
    const keywordCounts = trendingFile.keywordCounts ?? {};
    for (const [label, count] of Object.entries(keywordCounts)) {
      if (count > 0) activeFamilyCount += 1;
      if (count > topFamilyCount) {
        topFamilyCount = count;
        topFamilyLabel = label;
      }
    }
  }

  // Engagement 24h: sum of likes+reposts+replies on posts within 24h.
  const dayAgoMs = Date.now() - 24 * 3_600_000;
  const engagement24h = trendingFile.posts.reduce((sum, p) => {
    const t = Date.parse(p.createdAt);
    if (!Number.isFinite(t) || t < dayAgoMs) return sum;
    return sum + (p.likeCount ?? 0) + (p.repostCount ?? 0) + (p.replyCount ?? 0);
  }, 0);

  // Top Signal: top trending post score (likes + 2*reposts + 0.5*replies).
  const topPost = trendingPosts[0] ?? null;
  const topPostScore = topPost
    ? topPost.likeCount + 2 * topPost.repostCount + 0.5 * topPost.replyCount
    : 0;
  const topPostExcerpt = topPost?.text.slice(0, 40) ?? null;

  const metrics: SignalMetricCardProps[] = [
    {
      label: "Trending posts",
      value: totalScanned.toLocaleString("en-US"),
      helper: "total scanned this window",
      sparkTone: "brand",
    },
    {
      label: "Repo mentions",
      value: repoMentionCount,
      delta: `${windowDays}d window`,
      sparkTone: "info",
    },
    {
      label: "Topic momentum",
      value: topFamilyLabel ?? "—",
      helper: topFamilyCount > 0 ? `${topFamilyCount} hits` : null,
      sparkTone: "up",
    },
    {
      label: "Engagement 24h",
      value: engagement24h.toLocaleString("en-US"),
      helper: "likes + reposts + replies",
      sparkTone: engagement24h > 0 ? "warning" : "info",
    },
    {
      label: "Active topics",
      value: activeFamilyCount,
      helper:
        families.length > 0
          ? `${activeFamilyCount} / ${families.length} families`
          : null,
      sparkTone: "info",
    },
    {
      label: "Top signal",
      value: Math.round(topPostScore),
      helper: topPostExcerpt,
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
      emptyTitle: "No tracked repos mentioned on Bluesky in the last 7 days.",
      emptySubtitle: "Pipeline is healthy; the watch list just hasn't lit up yet.",
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
      emptyTitle: "Bluesky is quiet right now. Check back in a few minutes.",
    },
  ];

  void triggerScanIfStale("bluesky", fetchedAt);

  return (
    <SignalSourcePage
      source="bluesky"
      sourceLabel="BLUESKY"
      mode="TRENDING"
      subtitle={SUBTITLE}
      fetchedAt={fetchedAt}
      freshnessStatus={verdict.status}
      ageLabel={verdict.ageLabel}
      metrics={metrics}
      tabs={tabs}
    />
  );
}
