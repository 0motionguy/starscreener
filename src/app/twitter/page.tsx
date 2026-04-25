// /twitter — X / Twitter news terminal page.
//
// Twitter is unusual: data is NOT a single data/twitter-*.json file.
// It comes from the OpenClaw / Apify ingestion system stored in
// .data/twitter-*.jsonl, surfaced via getTwitterLeaderboard() +
// getTwitterOverviewStats() in @/lib/twitter/service.
//
// Tab 1 (default): Repo Mentions — top 50 repos by X buzz score in the
// last 24h, with top tweet excerpt + top tweeter handle.
// Tab 2: Top News — top 30 individual tweet signals across all tracked
// repos, sorted by engagement (likes).
//
// Stale handling: classifyFreshness("twitter", lastScannedAt) — past 2h
// the page hides everything and renders SourceDownEmptyState.
//
// URL parity: legacy ?tab=trending|global → ?tab=mentions|news redirect.

import { redirect } from "next/navigation";

import {
  getTwitterLeaderboard,
  getTwitterOverviewStats,
  getTwitterRepoSignal,
} from "@/lib/twitter/service";
import {
  NewsSourceLayout,
  type MetricTile,
} from "@/components/news/NewsSourceLayout";
import type { RepoMentionRow } from "@/components/news/RepoMentionsTab";
import type { NewsItem } from "@/components/news/NewsTab";
import { classifyFreshness } from "@/lib/news/freshness";

export const dynamic = "force-dynamic";

export default async function TwitterPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const { tab: rawTab } = await searchParams;
  const tabParam = Array.isArray(rawTab) ? rawTab[0] : rawTab;

  // Legacy tab redirect — preserve external links.
  if (tabParam === "trending") redirect("/twitter");
  if (tabParam === "global") redirect("/twitter?tab=news");

  const stats = await getTwitterOverviewStats();
  const fetchedAt = stats.lastScannedAt;
  const verdict = classifyFreshness("twitter", fetchedAt);

  if (verdict.status === "cold") {
    return (
      <NewsSourceLayout
        source="twitter"
        sourceLabel="X / Twitter"
        tagline="// real-time repo buzz"
        description="Real-time X/Twitter buzz on tracked GitHub repos via the OpenClaw / Apify ingestion pipeline."
        fetchedAt={fetchedAt}
        freshnessStatus={verdict.status}
        ageLabel={verdict.ageLabel}
        staleAfterMs={verdict.staleAfterMs}
        metrics={[]}
        mentionsRows={[]}
        newsItems={[]}
        mentionsWindowLabel="24h"
      />
    );
  }

  const leaderboard = await getTwitterLeaderboard(50);

  // Pull per-repo signals in parallel so we can surface real tweet text.
  // The store is in-memory, so this is cheap.
  const signals = await Promise.all(
    leaderboard.map((row) => getTwitterRepoSignal(row.githubFullName)),
  );

  const mentionsRows: RepoMentionRow[] = leaderboard.map((row, idx) => {
    const signal = signals[idx];
    const top = signal?.topPosts[0] ?? null;
    return {
      fullName: row.githubFullName,
      count: row.mentionCount24h,
      engagement: row.totalLikes24h,
      engagementLabel: "Likes",
      topExcerpt: top?.text ?? null,
      attribution: top ? `@${top.authorHandle}` : null,
      topUrl: top?.postUrl ?? row.topPostUrl ?? null,
      topAt: top?.postedAt ?? null,
    };
  });

  // Flatten top tweets across all repos, dedupe by postId, sort by
  // engagement (likes proxy), keep top 30.
  type TweetRow = {
    postId: string;
    postUrl: string;
    text: string;
    authorHandle: string;
    engagement: number;
    postedAt: string;
    repoFullName: string;
  };

  const allTweets: TweetRow[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < leaderboard.length; i++) {
    const signal = signals[i];
    if (!signal) continue;
    for (const post of signal.topPosts) {
      if (seen.has(post.postId)) continue;
      seen.add(post.postId);
      allTweets.push({
        postId: post.postId,
        postUrl: post.postUrl,
        text: post.text,
        authorHandle: post.authorHandle,
        engagement: post.engagement,
        postedAt: post.postedAt,
        repoFullName: leaderboard[i].githubFullName,
      });
    }
  }

  const newsItems: NewsItem[] = allTweets
    .sort((a, b) => b.engagement - a.engagement)
    .slice(0, 30)
    .map((t) => ({
      id: t.postId,
      title: t.text,
      url: t.postUrl,
      attribution: `@${t.authorHandle}`,
      score: t.engagement,
      scoreLabel: "Likes",
      postedAt: t.postedAt,
      linkedRepo: t.repoFullName,
      tag: null,
    }));

  const topRepoShort = stats.topRepoFullName?.split("/")[1] ?? "—";

  const metrics: MetricTile[] = [
    {
      label: "Repos with buzz",
      value: stats.reposWithMentions,
      hint: `${stats.scansStored} scans stored`,
    },
    {
      label: "Mentions 24h",
      value: stats.totalMentions24h,
      hint: stats.totalReposts24h
        ? `${stats.totalReposts24h.toLocaleString("en-US")} reposts`
        : null,
    },
    {
      label: "Likes 24h",
      value: stats.totalLikes24h,
      hint: null,
    },
    {
      label: "Top score",
      value:
        stats.topRepoScore !== null ? stats.topRepoScore.toFixed(1) : "—",
      hint: stats.topRepoFullName ? topRepoShort : "no leader yet",
    },
  ];

  return (
    <NewsSourceLayout
      source="twitter"
      sourceLabel="X / Twitter"
      tagline="// real-time repo buzz"
      description="Real-time X/Twitter buzz on tracked GitHub repos via the OpenClaw / Apify ingestion pipeline. 24h window."
      fetchedAt={fetchedAt}
      freshnessStatus={verdict.status}
      ageLabel={verdict.ageLabel}
      staleAfterMs={verdict.staleAfterMs}
      metrics={metrics}
      mentionsRows={mentionsRows}
      newsItems={newsItems}
      mentionsWindowLabel="24h"
    />
  );
}
