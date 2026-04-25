// /devto — dev.to news terminal page.
//
// Tab 1 (default): Repo Mentions — repos most-discussed in dev.to articles
// in the last 7 days, with top article excerpt and reactions.
// Tab 2: Top News — top trending dev.to articles regardless of whether
// they link a tracked repo.
//
// Reads data/devto-mentions.json + data/devto-trending.json on each
// request. Stale handling uses the dev.to-specific 26h threshold (much
// longer than reddit/HN's 2h) — past it, the page hides everything and
// renders SourceDownEmptyState.

import { getDevtoFile } from "@/lib/devto";
import { getDevtoTrendingFile } from "@/lib/devto-trending";
import {
  NewsSourceLayout,
  type MetricTile,
} from "@/components/news/NewsSourceLayout";
import type { RepoMentionRow } from "@/components/news/RepoMentionsTab";
import type { NewsItem } from "@/components/news/NewsTab";
import { classifyFreshness } from "@/lib/news/freshness";
import { triggerScanIfStale } from "@/lib/news/auto-rescrape";

export const dynamic = "force-dynamic";

export default function DevtoPage() {
  const mentionsFile = getDevtoFile();
  const fetchedAt = mentionsFile.fetchedAt;
  const verdict = classifyFreshness("devto", fetchedAt);

  const trendingFile = getDevtoTrendingFile();
  const mentions = mentionsFile.mentions;
  const trendingArticles = trendingFile.articles;

  const mentionsRows: RepoMentionRow[] = Object.entries(mentions)
    .map(([fullName, m]) => {
      const top = m.topArticle;
      const matchingArticle = top
        ? m.articles.find((a) => a.id === top.id) ?? null
        : null;
      const engagement = top
        ? top.reactions
        : m.reactionsSum7d;
      return {
        fullName,
        count: m.count7d,
        engagement,
        engagementLabel: "Reactions",
        topExcerpt: top?.title ?? null,
        attribution: top ? `@${top.author}` : null,
        topUrl: top?.url ?? null,
        topAt: matchingArticle?.publishedAt ?? null,
      };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 50);

  const newsItems: NewsItem[] = trendingArticles
    .slice()
    .sort((a, b) => b.trendingScore - a.trendingScore)
    .slice(0, 30)
    .map((article) => ({
      id: String(article.id),
      title: article.title,
      url: article.url,
      attribution: `@${article.author.username}`,
      score: article.reactionsCount,
      scoreLabel: "Reactions",
      comments: article.commentsCount,
      postedAt: article.publishedAt,
      linkedRepo: article.linkedRepos?.[0]?.fullName ?? null,
      tag: article.tags?.[0] ?? null,
    }));

  // Metrics
  const repoMentionEntries = Object.entries(mentions);
  const totalReactions = repoMentionEntries.reduce(
    (sum, [, m]) => sum + (m.reactionsSum7d ?? 0),
    0,
  );

  // Most common tag across trending articles.
  const tagCounts = new Map<string, number>();
  for (const article of trendingArticles) {
    for (const tag of article.tags ?? []) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }
  let topTag: string | null = null;
  let topTagCount = 0;
  for (const [tag, count] of tagCounts) {
    if (count > topTagCount) {
      topTag = tag;
      topTagCount = count;
    }
  }

  const metrics: MetricTile[] = [
    {
      label: "Repos hit",
      value: repoMentionEntries.length,
      hint: `${trendingArticles.length} trending articles`,
    },
    {
      label: "Articles tracked",
      value: mentionsFile.scannedArticles.toLocaleString("en-US"),
      hint: `${mentionsFile.windowDays}d window`,
    },
    {
      label: "Total reactions",
      value: totalReactions.toLocaleString("en-US"),
      hint: "across tracked repo mentions",
    },
    {
      label: "Top tag",
      value: topTag ? `#${topTag}` : "—",
      hint: topTag ? `${topTagCount} articles` : null,
    },
  ];

  void triggerScanIfStale("devto", fetchedAt);

  return (
    <NewsSourceLayout
      source="devto"
      sourceLabel="dev.to"
      tagline="// dev media articles & posts"
      description={`GitHub repo mentions across dev.to long-form writing. Scans ${mentionsFile.scannedArticles.toLocaleString("en-US")} articles from popularity, rising, and curated AI/dev tag slices for github.com/<owner>/<name> matches in titles, descriptions, tags, and bodies.`}
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
