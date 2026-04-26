// News adapters — map each source's typed data shape into the
// NewsItem / FeaturedItem / stacked-bar / topic-line shape that
// NewsTemplateV2 expects.
//
// Each adapter is small (~30 lines) and pure — call it from a server
// component, hand the result to NewsTemplateV2, done.

import type { HnStory, HnRepoMention } from "@/lib/hackernews";
import type { RedditPost, RedditRepoMention } from "@/lib/reddit";
import type { BskyPost, BskyRepoMention } from "@/lib/bluesky";
import type { DevtoArticle } from "@/lib/devto";
import type { LobstersStory } from "@/lib/lobsters";
import type { Launch as ProductHuntLaunch } from "@/lib/producthunt";

import type { FeaturedItem } from "@/components/today-v2/FeaturedCardsV2";
import type { NewsItem, NewsSourceMeta } from "@/components/today-v2/NewsTemplateV2";

// ---------------------------------------------------------------------------
// Per-source meta — colors aligned with the SidebarV2 source pills
// ---------------------------------------------------------------------------

export const ADAPTER_SOURCES: Record<string, NewsSourceMeta> = {
  hackernews: {
    code: "HN",
    label: "HACKERNEWS",
    color: "rgba(245, 110, 15, 0.85)",
    slug: "hackernews",
  },
  reddit: {
    code: "R",
    label: "REDDIT",
    color: "rgba(255, 77, 77, 0.85)",
    slug: "reddit",
  },
  bluesky: {
    code: "B",
    label: "BLUESKY",
    color: "rgba(58, 214, 197, 0.85)",
    slug: "bluesky",
  },
  devto: {
    code: "D",
    label: "DEVTO",
    color: "rgba(102, 153, 255, 0.85)",
    slug: "devto",
  },
  lobsters: {
    code: "L",
    label: "LOBSTERS",
    color: "rgba(132, 110, 195, 0.85)",
    slug: "lobsters",
  },
  producthunt: {
    code: "PH",
    label: "PRODUCTHUNT",
    color: "rgba(220, 70, 100, 0.85)",
    slug: "producthunt",
  },
  twitter: {
    code: "X",
    label: "TWITTER",
    color: "rgba(220, 168, 43, 0.85)",
    slug: "twitter",
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert a Unix timestamp to "Xh ago" / "Xd ago" / "Xm ago". */
function relativeAge(unixSec: number, nowMs: number = Date.now()): string {
  const diffMs = nowMs - unixSec * 1000;
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

/** Convert ISO string to "Xh ago" etc. */
function relativeAgeIso(iso: string, nowMs: number = Date.now()): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  return relativeAge(Math.floor(t / 1000), nowMs);
}

/** Bucket score into a heat tier so the row gets the right color tint. */
function heatFromScore(
  score: number,
  thresholds: { breakout: number; hot: number; rising: number } = {
    breakout: 500,
    hot: 200,
    rising: 50,
  },
): NewsItem["heat"] {
  if (score >= thresholds.breakout) return "breakout";
  if (score >= thresholds.hot) return "hot";
  if (score >= thresholds.rising) return "rising";
  return "neutral";
}

// ---------------------------------------------------------------------------
// HackerNews adapter
// ---------------------------------------------------------------------------

export function adaptHnStories(
  stories: HnStory[],
  /** Optional fullName → mention dict for repo cross-reference. */
  mentions: Record<string, HnRepoMention> = {},
  limit = 30,
): NewsItem[] {
  // Build a story-id → fullName map from mentions (one-shot, O(n)).
  const repoByStoryId = new Map<number, string>();
  for (const [fullName, m] of Object.entries(mentions)) {
    for (const ref of m.stories ?? []) {
      if (typeof ref.id === "number") repoByStoryId.set(ref.id, fullName);
    }
  }
  return stories.slice(0, limit).map((s) => ({
    id: `hn-${s.id}`,
    title: s.title,
    source: "HN",
    author: s.by,
    score: s.score,
    mentions: s.descendants ?? 0,
    repo: repoByStoryId.get(s.id) ?? null,
    age: relativeAge(s.createdUtc),
    heat: heatFromScore(s.score),
  }));
}

// ---------------------------------------------------------------------------
// Reddit adapter
// ---------------------------------------------------------------------------

export function adaptRedditPosts(
  posts: RedditPost[],
  limit = 30,
): NewsItem[] {
  return posts.slice(0, limit).map((p) => {
    // RedditAllPost (a superset of RedditPost) carries a selftext field —
    // narrow + read it when present.
    const selftext = (p as RedditPost & { selftext?: string }).selftext;
    return {
      id: `reddit-${p.id}`,
      title: p.title,
      source: "R",
      author: p.author || "—",
      score: p.score,
      mentions: p.numComments,
      repo: p.repoFullName ?? null,
      age: relativeAge(p.createdUtc),
      heat: heatFromScore(p.score, {
        breakout: 1500,
        hot: 400,
        rising: 100,
      }),
      body: selftext?.trim() || undefined,
    };
  });
}

// ---------------------------------------------------------------------------
// Bluesky adapter
// ---------------------------------------------------------------------------

export function adaptBlueskyPosts(
  posts: BskyPost[],
  /** Optional fullName → mention dict for repo cross-reference. */
  mentions: Record<string, BskyRepoMention> = {},
  limit = 30,
): NewsItem[] {
  // Build a post-uri → fullName map.
  const repoByUri = new Map<string, string>();
  for (const [fullName, m] of Object.entries(mentions)) {
    for (const ref of m.posts ?? []) {
      if (ref.uri) repoByUri.set(ref.uri, fullName);
    }
  }
  return posts.slice(0, limit).map((p) => {
    const fullText = (p.text ?? "").trim();
    return {
      id: `bsky-${p.cid}`,
      // Bluesky has no title — use the first line of text as the title
      // and pass the full body for the featured-card excerpt.
      title: fullText.split("\n")[0].slice(0, 120) || "(no text)",
      source: "B",
      author: p.author?.handle ?? "—",
      score: (p.likeCount ?? 0) + (p.repostCount ?? 0) * 2,
      mentions: p.replyCount ?? 0,
      repo: repoByUri.get(p.uri) ?? null,
      age: relativeAge(p.createdUtc),
      heat: heatFromScore((p.likeCount ?? 0) + (p.repostCount ?? 0) * 2, {
        breakout: 800,
        hot: 200,
        rising: 50,
      }),
      body: fullText || undefined,
    };
  });
}

// ---------------------------------------------------------------------------
// Dev.to adapter
// ---------------------------------------------------------------------------

export function adaptDevtoArticles(
  articles: DevtoArticle[],
  limit = 30,
): NewsItem[] {
  return articles.slice(0, limit).map((a) => ({
    id: `devto-${a.id}`,
    title: a.title,
    source: "D",
    author: a.author?.username ?? "—",
    score: a.reactionsCount,
    mentions: a.commentsCount,
    // First linked repo wins.
    repo: a.linkedRepos?.[0]?.fullName ?? null,
    age: relativeAgeIso(a.publishedAt),
    heat: heatFromScore(a.reactionsCount, {
      breakout: 200,
      hot: 50,
      rising: 10,
    }),
    // Real article excerpt from the dev.to API.
    body: a.description?.trim() || undefined,
  }));
}

// ---------------------------------------------------------------------------
// Lobsters adapter
// ---------------------------------------------------------------------------

export function adaptLobstersStories(
  stories: LobstersStory[],
  limit = 30,
): NewsItem[] {
  return stories.slice(0, limit).map((s) => ({
    id: `lob-${s.shortId}`,
    title: s.title,
    source: "L",
    author: s.by,
    score: s.score,
    mentions: s.commentCount,
    repo: null,
    age: relativeAge(s.createdUtc),
    heat: heatFromScore(s.score, { breakout: 80, hot: 30, rising: 10 }),
    body: s.description?.trim() || undefined,
  }));
}

// ---------------------------------------------------------------------------
// ProductHunt adapter
// ---------------------------------------------------------------------------

export function adaptProductHuntLaunches(
  launches: ProductHuntLaunch[],
  limit = 30,
): NewsItem[] {
  return launches.slice(0, limit).map((l) => ({
    id: `ph-${l.id}`,
    title: `${l.name} — ${l.tagline}`,
    source: "PH",
    author: l.makers?.[0]?.name ?? "—",
    score: l.votesCount,
    mentions: l.commentsCount,
    repo: null,
    age: relativeAgeIso(l.createdAt),
    heat: heatFromScore(l.votesCount, {
      breakout: 800,
      hot: 300,
      rising: 100,
    }),
    body: l.description?.trim() || undefined,
  }));
}

// ---------------------------------------------------------------------------
// Twitter adapter — leaderboard-of-repos rather than feed-of-posts.
// Each row becomes a "news item" where the title is the repo name and
// the score is mention volume.
// ---------------------------------------------------------------------------

interface TwitterRowLike {
  repoId: string;
  githubFullName: string;
  repoName: string;
  mentionCount24h: number;
  uniqueAuthors24h: number;
  totalLikes24h: number;
  finalTwitterScore: number;
}

export function adaptTwitterLeaderboard(
  rows: TwitterRowLike[],
  limit = 30,
): NewsItem[] {
  return rows.slice(0, limit).map((r) => ({
    id: `tw-${r.repoId}`,
    title: r.githubFullName,
    source: "X",
    author: `${r.uniqueAuthors24h} authors`,
    score: Math.round(r.finalTwitterScore),
    mentions: r.mentionCount24h,
    repo: r.githubFullName,
    age: "24h",
    heat: heatFromScore(r.mentionCount24h, {
      breakout: 80,
      hot: 30,
      rising: 10,
    }),
  }));
}

// ---------------------------------------------------------------------------
// Featured items — pick the top 3 by score and convert to FeaturedItem
// ---------------------------------------------------------------------------

export function pickFeatured(
  items: NewsItem[],
  source: NewsSourceMeta,
): FeaturedItem[] {
  return items.slice(0, 3).map((item) => {
    // Prefer the real body text from the source. If the source doesn't
    // carry one (HN headlines, raw Twitter leaderboard rows), fall back
    // to a one-line meta strip built from real numbers.
    const realBody = item.body?.trim();
    const fallbackMeta = `${item.author ? `by @${item.author} · ` : ""}${item.score.toLocaleString()} score · ${item.mentions} ${item.mentions === 1 ? "comment" : "comments"} · ${item.age} ago`;
    return {
      id: `feat-${item.id}`,
      source: item.source,
      sourceLabel: source.label,
      sourceColor: source.color,
      title: item.title,
      excerpt: realBody && realBody.length > 24 ? realBody : fallbackMeta,
      author: item.author,
      score: item.score,
      mentions: item.mentions,
      age: item.age,
    };
  });
}

// ---------------------------------------------------------------------------
// Hero stats — REAL data only. We never had per-day time series in the
// committed data files, so showing a 7-day chart was synthetic. The
// hero now uses two non-time-series visualizations that ARE backed by
// the snapshot we have:
//
//  1. buildSourceVolume — total real activity per source (item count +
//     summed score). Renders as a single horizontal-bar chart.
//  2. buildTopTopics — real most-mentioned terms across the current
//     item set, with real counts. Renders as a horizontal bar list.
//  3. buildTodayCounter — sum of all current items + their score.
//
// Once a daily-snapshot scrape is wired (separate work item), swap in
// real 7-day series. Until then, no fiction.
// ---------------------------------------------------------------------------

export interface SourceVolumeRow {
  code: string;
  label: string;
  color: string;
  /** Real count of items in the current snapshot. */
  itemCount: number;
  /** Sum of their scores (HN points / Reddit upvotes / etc). */
  totalScore: number;
}

export function buildSourceVolume(
  channels: NewsSourceMeta[],
  itemsByChannel: Record<string, NewsItem[]>,
): SourceVolumeRow[] {
  return channels.map((ch) => {
    const items = itemsByChannel[ch.code] ?? [];
    const totalScore = items.reduce((sum, x) => sum + x.score, 0);
    return {
      code: ch.code,
      label: ch.label,
      color: ch.color,
      itemCount: items.length,
      totalScore,
    };
  });
}

export interface TopTopic {
  topic: string;
  /** Real number of items in the current snapshot containing this term. */
  count: number;
  color: string;
}

const STOP_WORDS = new Set([
  "the",
  "a",
  "an",
  "is",
  "are",
  "for",
  "on",
  "in",
  "to",
  "of",
  "and",
  "or",
  "with",
  "how",
  "why",
  "what",
  "show",
  "ask",
  "hn",
  "i",
  "my",
  "we",
  "by",
  "as",
  "at",
  "this",
  "that",
  "from",
  "your",
  "you",
  "be",
  "it",
  "its",
  "do",
  "does",
  "no",
  "not",
  "out",
  "new",
  "now",
  "use",
  "using",
  "can",
  "will",
  "has",
  "have",
  "than",
  "into",
  "over",
  "via",
  "re",
  "so",
  "if",
  "but",
]);

export function buildTopTopics(items: NewsItem[], limit = 5): TopTopic[] {
  // Real frequency count across current item titles. No time series
  // synthesis — just the actual counts.
  const counts = new Map<string, number>();
  for (const item of items) {
    const tokens = item.title.toLowerCase().match(/\b[a-z][a-z-]{2,}\b/g);
    for (const t of tokens ?? []) {
      if (STOP_WORDS.has(t) || t.length > 22) continue;
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
  }
  const top = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);

  const colors = [
    "rgba(146, 151, 246, 1)",
    "rgba(245, 110, 15, 1)",
    "rgba(58, 214, 197, 1)",
    "rgba(255, 102, 153, 1)",
    "rgba(254, 223, 137, 1)",
  ];

  return top.map(([topic, count], i) => ({
    topic,
    count,
    color: colors[i] ?? colors[0],
  }));
}

export interface TodayCounter {
  totalItems: number;
  totalScore: number;
  topItem: NewsItem | null;
}

export function buildTodayCounter(items: NewsItem[]): TodayCounter {
  if (items.length === 0) {
    return { totalItems: 0, totalScore: 0, topItem: null };
  }
  const totalScore = items.reduce((sum, x) => sum + x.score, 0);
  const topItem = items.reduce<NewsItem>(
    (best, x) => (x.score > best.score ? x : best),
    items[0],
  );
  return {
    totalItems: items.length,
    totalScore,
    topItem,
  };
}
