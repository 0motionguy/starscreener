// /bluesky/trending — Bluesky news terminal page.
//
// Tab 1 (default): Repo Mentions — repos most-discussed on Bluesky in
// the last 7 days, with top-post excerpt and engagement (likes).
// Tab 2: Top News — top trending Bluesky posts across curated AI query
// families (agents, LLMs, MCP, ...), regardless of repo linkage.
//
// Reads data/bluesky-mentions.json + data/bluesky-trending.json on each
// request so local scraper runs show up without restarting.
//
// Stale handling: if the scraper hasn't produced fresh data within the
// stale threshold (2h for fast sources), the page hides everything and
// renders SourceDownEmptyState. No outdated posts leak through.

import {
  blueskyFetchedAt,
  bskyPostHref,
  getAllBlueskyMentions,
} from "@/lib/bluesky";
import {
  getBlueskyTopPosts,
  getBlueskyTrendingFile,
} from "@/lib/bluesky-trending";
import {
  NewsSourceLayout,
  type MetricTile,
} from "@/components/news/NewsSourceLayout";
import type { RepoMentionRow } from "@/components/news/RepoMentionsTab";
import type { NewsItem } from "@/components/news/NewsTab";
import { classifyFreshness } from "@/lib/news/freshness";

export const dynamic = "force-dynamic";

export default function BlueskyTrendingPage() {
  const fetchedAt = blueskyFetchedAt;
  const verdict = classifyFreshness("bluesky", fetchedAt);

  // Skip the heavy data reads when cold — SourceDown will render anyway.
  if (verdict.status === "cold") {
    return (
      <NewsSourceLayout
        source="bluesky"
        sourceLabel="Bluesky"
        tagline="// AT Protocol AI signal"
        description="GitHub repo mentions and trending AI posts across Bluesky."
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

  const mentions = getAllBlueskyMentions();
  const trendingFile = getBlueskyTrendingFile();
  const trendingPosts = getBlueskyTopPosts(30);

  const mentionsEntries = Object.entries(mentions);

  const mentionsRows: RepoMentionRow[] = mentionsEntries
    .map(([fullName, m]) => {
      const top = m.topPost;
      const excerpt = top
        ? top.text.length > 80
          ? `${top.text.slice(0, 80)}…`
          : top.text
        : null;
      return {
        fullName,
        count: m.count7d,
        engagement: m.likesSum7d,
        engagementLabel: "Likes",
        topExcerpt: excerpt,
        attribution: top ? `@${top.author.handle}` : null,
        topUrl: top ? top.bskyUrl || bskyPostHref(top.uri, top.author.handle) : null,
        topAt: top ? top.createdAt : null,
      };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 50);

  const newsItems: NewsItem[] = trendingPosts.map((p) => {
    const title = p.text.length > 140 ? `${p.text.slice(0, 140)}…` : p.text;
    return {
      id: p.uri,
      title,
      url: p.bskyUrl || bskyPostHref(p.uri, p.author.handle),
      attribution: `@${p.author.handle}`,
      score: p.likeCount,
      scoreLabel: "Likes",
      comments: p.replyCount,
      postedAt: p.createdAt,
      linkedRepo: p.linkedRepos?.[0]?.fullName ?? null,
      tag: p.matchedTopicLabel ?? p.matchedKeyword ?? null,
    };
  });

  // Source-specific metrics.
  const reposHit = mentionsEntries.length;
  const engagement7d = mentionsEntries.reduce(
    (sum, [, m]) => sum + (m.likesSum7d ?? 0),
    0,
  );
  const topReposts = mentionsEntries.reduce(
    (max, [, m]) => Math.max(max, m.repostsSum7d ?? 0),
    0,
  );
  const families = new Set<string>();
  for (const [, m] of mentionsEntries) {
    for (const post of m.posts) {
      const fam = post.matchedTopicId ?? post.matchedTopicLabel ?? post.matchedKeyword;
      if (fam) families.add(fam);
    }
  }
  const familyCount = families.size;

  const metrics: MetricTile[] = [
    {
      label: "Repos hit",
      value: reposHit.toLocaleString("en-US"),
      hint: `${trendingFile.scannedPosts.toLocaleString("en-US")} posts scanned`,
    },
    {
      label: "Engagement 7d",
      value: engagement7d.toLocaleString("en-US"),
      hint: "sum of likes across repo mentions",
    },
    {
      label: "Topic families",
      value: familyCount.toLocaleString("en-US"),
      hint: familyCount > 0 ? "families with repo hits" : "no family hits this window",
    },
    {
      label: "Top reposts",
      value: topReposts.toLocaleString("en-US"),
      hint: topReposts > 0 ? "max reposts on a single repo 7d" : "no reposts yet",
    },
  ];

  return (
    <NewsSourceLayout
      source="bluesky"
      sourceLabel="Bluesky"
      tagline="// AT Protocol AI signal"
      description="GitHub repo mentions on Bluesky plus top trending posts across curated AI topic families (agents, LLMs, coding agents, MCP, workflow). Score: likes + 2·reposts + 0.5·replies."
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
