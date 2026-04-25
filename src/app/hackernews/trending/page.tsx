// /hackernews/trending — Hacker News news terminal page.
//
// Tab 1 (default): Repo Mentions — repos most-discussed on HN in the
// last 7 days, with top story title + score (engagement).
// Tab 2: Top News — top trending HN stories (Firebase top 500 +
// Algolia 7d sweep, ranked by velocity * log10(score)).
//
// Reads the latest data/hackernews-repo-mentions.json +
// data/hackernews-trending.json on each request so local scraper runs
// show up without restarting.
//
// Stale handling: if the scraper hasn't produced fresh data within the
// stale threshold (2h for fast sources), the page hides everything and
// renders SourceDownEmptyState. No outdated stories leak through.

import {
  getAllHnMentions,
  getHnFile,
  hnItemHref,
} from "@/lib/hackernews";
import {
  getHnTopStories,
  getHnTrendingFile,
} from "@/lib/hackernews-trending";
import {
  NewsSourceLayout,
  type MetricTile,
} from "@/components/news/NewsSourceLayout";
import type { RepoMentionRow } from "@/components/news/RepoMentionsTab";
import type { NewsItem } from "@/components/news/NewsTab";
import { classifyFreshness } from "@/lib/news/freshness";
import { triggerScanIfStale } from "@/lib/news/auto-rescrape";

export const dynamic = "force-dynamic";

export default function HackerNewsTrendingPage() {
  const mentionsFile = getHnFile();
  const fetchedAt = mentionsFile.fetchedAt;
  const verdict = classifyFreshness("hackernews", fetchedAt);

  const mentions = getAllHnMentions();
  const trendingFile = getHnTrendingFile();
  const allStories = trendingFile.stories;
  const topStories = getHnTopStories(30);

  const mentionsRows: RepoMentionRow[] = Object.entries(mentions)
    .map(([fullName, m]) => {
      const top = m.topStory;
      return {
        fullName,
        count: m.count7d,
        engagement: m.scoreSum7d,
        engagementLabel: "Score",
        topExcerpt: top?.title ?? null,
        attribution: top ? `news.ycombinator.com · item ${top.id}` : null,
        topUrl: top ? hnItemHref(top.id) : null,
        topAt: null,
      };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 50);

  const newsItems: NewsItem[] = topStories.map((s) => {
    const linkedRepo = s.linkedRepos?.[0]?.fullName ?? null;
    return {
      id: String(s.id),
      title: s.title,
      url: s.url || hnItemHref(s.id),
      attribution: s.by ? `by ${s.by}` : null,
      score: s.score,
      scoreLabel: "Points",
      comments: s.descendants,
      postedAt: new Date(s.createdUtc * 1000).toISOString(),
      linkedRepo,
      tag: s.everHitFrontPage ? "front-page" : null,
    };
  });

  const frontPageCount = allStories.filter((s) => s.everHitFrontPage).length;
  const githubLinkedCount = allStories.filter(
    (s) => (s.linkedRepos?.length ?? 0) > 0,
  ).length;
  const topScore = allStories.reduce(
    (max, s) => (s.score > max ? s.score : max),
    0,
  );
  const reposHit = Object.keys(mentions).length;

  const metrics: MetricTile[] = [
    {
      label: "Front-page",
      value: frontPageCount,
      hint: `of ${allStories.length} stories tracked`,
    },
    {
      label: "GitHub-link",
      value: githubLinkedCount,
      hint: "stories linking tracked repos",
    },
    {
      label: "Top score",
      value: topScore,
      hint: `${trendingFile.windowHours}h window`,
    },
    {
      label: "Repos hit",
      value: reposHit,
      hint: `${mentionsFile.windowDays}d mention window`,
    },
  ];

    void triggerScanIfStale("hackernews", fetchedAt);

  return (
    <NewsSourceLayout
      source="hackernews"
      sourceLabel="Hacker News"
      tagline="// Firebase + Algolia AI signal"
      description={`Velocity-scored Hacker News stories from the dual-source scrape (Firebase top 500 + Algolia ${mentionsFile.windowDays}d github sweep), plus per-repo mention buckets ranked by 7d frequency.`}
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
