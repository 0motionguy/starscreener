// /reddit — Reddit news terminal page.
//
// Tab 1 (default): Repo Mentions — repos most-discussed on Reddit in the
// last 7 days, with top post excerpt and engagement (upvotes).
// Tab 2: Top News — top trending Reddit posts in AI-dev subs regardless
// of whether they link a tracked repo.
//
// Reads the latest data/reddit-mentions.json + data/reddit-all-posts.json
// on each request so local scraper runs show up without restarting.
//
// Stale handling: if the scraper hasn't produced fresh data within the
// stale threshold (2h for fast sources), the page hides everything and
// renders SourceDownEmptyState. No outdated posts leak through.

import {
  getAllRedditMentions,
  getAllRedditPosts,
  getRedditFetchedAt,
  getRedditStats,
  getRedditSubreddits,
} from "@/lib/reddit-data";
import {
  NewsSourceLayout,
  type MetricTile,
} from "@/components/news/NewsSourceLayout";
import type { RepoMentionRow } from "@/components/news/RepoMentionsTab";
import type { NewsItem } from "@/components/news/NewsTab";
import { classifyFreshness } from "@/lib/news/freshness";

export const dynamic = "force-dynamic";

export default function RedditPage() {
  const fetchedAt = getRedditFetchedAt();
  const verdict = classifyFreshness("reddit", fetchedAt);

  // Skip the heavy data reads when cold — SourceDown will render anyway.
  if (verdict.status === "cold") {
    return (
      <NewsSourceLayout
        source="reddit"
        sourceLabel="Reddit"
        tagline="// AI-dev subreddit firehose"
        description="GitHub repo mentions across AI-dev subreddits."
        fetchedAt={fetchedAt}
        freshnessStatus={verdict.status}
        ageLabel={verdict.ageLabel}
        staleAfterMs={verdict.staleAfterMs}
        metrics={[]}
        mentionsRows={[]}
        newsItems={[]}
      />
    );
  }

  const mentions = getAllRedditMentions();
  const stats = getRedditStats();
  const subreddits = getRedditSubreddits();
  const allPosts = getAllRedditPosts();

  const mentionsRows: RepoMentionRow[] = Object.entries(mentions)
    .map(([fullName, m]) => {
      const top = m.posts[0] ?? null;
      return {
        fullName,
        count: m.count7d,
        engagement: m.upvotes7d,
        engagementLabel: "Upvotes",
        topExcerpt: top?.title ?? null,
        attribution: top ? `r/${top.subreddit} · u/${top.author}` : null,
        topUrl: top ? `https://www.reddit.com${top.permalink}` : null,
        topAt: top
          ? new Date(top.createdUtc * 1000).toISOString()
          : null,
      };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 50);

  const newsItems: NewsItem[] = allPosts
    .slice()
    .sort((a, b) => b.score - a.score)
    .slice(0, 30)
    .map((post) => ({
      id: post.id,
      title: post.title,
      url: post.url || `https://www.reddit.com${post.permalink}`,
      attribution: `r/${post.subreddit} · u/${post.author}`,
      score: post.score,
      scoreLabel: "Upvotes",
      comments: post.numComments,
      postedAt: new Date(post.createdUtc * 1000).toISOString(),
      linkedRepo: post.repoFullName ?? null,
      tag: null,
    }));

  const reposWithMentions = stats.reposWithMentions;
  const breakouts = allPosts.filter(
    (p) => (p.baselineRatio ?? 0) >= 10,
  ).length;

  const metrics: MetricTile[] = [
    {
      label: "Repos hit",
      value: reposWithMentions,
      hint: `${stats.totalMentions} total mentions`,
    },
    {
      label: "Posts scanned",
      value: stats.postsScanned,
      hint: `across ${subreddits.length} subs`,
    },
    {
      label: "Breakouts 24h",
      value: breakouts,
      hint:
        breakouts > 0 ? "posts ≥10× sub baseline" : "no high-velocity posts",
    },
    {
      label: "Top sub",
      value: stats.topRepos[0]?.fullName.split("/")[1] ?? "—",
      hint: stats.topRepos[0] ? `${stats.topRepos[0].count7d}× / 7d` : null,
    },
  ];

  return (
    <NewsSourceLayout
      source="reddit"
      sourceLabel="Reddit"
      tagline="// AI-dev subreddit firehose"
      description={`GitHub repo mentions across ${subreddits.length} AI-dev subreddits. Scans ~100 most recent posts per sub for github.com/<owner>/<name> matches.`}
      fetchedAt={fetchedAt}
      freshnessStatus={verdict.status}
      ageLabel={verdict.ageLabel}
      staleAfterMs={verdict.staleAfterMs}
      metrics={metrics}
      mentionsRows={mentionsRows}
      newsItems={newsItems}
    />
  );
}
