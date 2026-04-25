// /lobsters — Lobsters news terminal page.
//
// Tab 1 (default): Repo Mentions — repos most-discussed on Lobsters in
// the last 7 days, with the top story excerpt and engagement (score).
// Tab 2: Top News — top trending Lobsters stories (regardless of repo
// linkage), ranked by raw score.
//
// Reads data/lobsters-mentions.json + data/lobsters-trending.json on
// each request so a local scrape shows up without a restart.
//
// Stale handling: if the scraper hasn't produced fresh data within the
// 2h fast-source threshold, the page hides everything and renders the
// SourceDownEmptyState. No outdated stories leak through.

import {
  getAllLobstersMentions,
  getLobstersFile,
  type LobstersStory,
} from "@/lib/lobsters";
import {
  getLobstersTrendingFile,
  getLobstersTopStories,
} from "@/lib/lobsters-trending";
import {
  NewsSourceLayout,
  type MetricTile,
} from "@/components/news/NewsSourceLayout";
import type { RepoMentionRow } from "@/components/news/RepoMentionsTab";
import type { NewsItem } from "@/components/news/NewsTab";
import { classifyFreshness } from "@/lib/news/freshness";

export const dynamic = "force-dynamic";

export default function LobstersPage() {
  const mentionsFile = getLobstersFile();
  const fetchedAt = mentionsFile.fetchedAt || null;
  const verdict = classifyFreshness("lobsters", fetchedAt);

  // Skip the heavy data reads when cold — SourceDown will render anyway.
  if (verdict.status === "cold") {
    return (
      <NewsSourceLayout
        source="lobsters"
        sourceLabel="Lobsters"
        tagline="// curated tech aggregator"
        description="GitHub repo mentions across Lobsters' hottest, active, and newest feeds."
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

  const mentions = getAllLobstersMentions();
  const trendingFile = getLobstersTrendingFile();
  const allStories: LobstersStory[] = trendingFile.stories ?? [];
  const topStories = getLobstersTopStories(30);

  // Build a quick lookup so we can pull submitter / createdUtc from the
  // full story snapshot when we only have a LobstersStoryRef on the
  // mention bucket.
  const storyByShortId = new Map<string, LobstersStory>();
  for (const s of allStories) {
    storyByShortId.set(s.shortId, s);
  }

  const mentionsRows: RepoMentionRow[] = Object.entries(mentions)
    .map(([fullName, m]) => {
      const topRef = m.topStory;
      const fullTop = topRef ? storyByShortId.get(topRef.shortId) : null;
      // Engagement: prefer scoreSum across the bucket, fall back to top
      // story score so the column never shows 0 when we have signal.
      const engagement =
        m.scoreSum7d > 0 ? m.scoreSum7d : (topRef?.score ?? 0);
      const submitter = fullTop?.by || null;
      const topUrl = topRef
        ? topRef.commentsUrl || topRef.url || null
        : null;
      const topAt = fullTop?.createdUtc
        ? new Date(fullTop.createdUtc * 1000).toISOString()
        : null;
      return {
        fullName,
        count: m.count7d,
        engagement,
        engagementLabel: "Score",
        topExcerpt: topRef?.title ?? null,
        attribution: submitter ? `by ${submitter}` : null,
        topUrl,
        topAt,
      };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 50);

  const newsItems: NewsItem[] = topStories.map((story) => {
    const linkedRepo = story.linkedRepos?.[0]?.fullName ?? null;
    const tag = story.tags?.[0] ?? null;
    return {
      id: story.shortId,
      title: story.title,
      url: story.commentsUrl || story.url,
      attribution: story.by ? `by ${story.by}` : null,
      score: story.score,
      scoreLabel: "Score",
      comments: story.commentCount,
      postedAt: new Date(story.createdUtc * 1000).toISOString(),
      linkedRepo,
      tag,
    };
  });

  // Metrics --------------------------------------------------------------
  const reposHit = Object.keys(mentions).length;
  const storiesTracked =
    mentionsFile.scannedStories || allStories.length;
  const githubStories = allStories.filter(
    (s) => (s.linkedRepos?.length ?? 0) > 0,
  ).length;

  // Most frequent tag across the trending window.
  const tagCounts = new Map<string, number>();
  for (const s of allStories) {
    for (const t of s.tags ?? []) {
      tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
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
      value: reposHit,
      hint:
        reposHit > 0
          ? `${reposHit} repo${reposHit === 1 ? "" : "s"} mentioned in 7d`
          : "no GitHub links matched tracked repos",
    },
    {
      label: "Stories tracked",
      value: storiesTracked,
      hint: `${trendingFile.windowHours}h trending window`,
    },
    {
      label: "GitHub stories",
      value: githubStories,
      hint: "stories linking a tracked repo",
    },
    {
      label: "Top tag",
      value: topTag ?? "—",
      hint: topTag ? `${topTagCount}× across feed` : null,
    },
  ];

  return (
    <NewsSourceLayout
      source="lobsters"
      sourceLabel="Lobsters"
      tagline="// curated tech aggregator"
      description="GitHub repo mentions and trending stories across Lobsters' hottest, active, and newest public JSON feeds."
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
