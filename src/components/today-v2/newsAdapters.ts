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
  return posts.slice(0, limit).map((p) => ({
    id: `reddit-${p.id}`,
    title: p.title,
    source: "R",
    author: p.author || "—",
    score: p.score,
    mentions: p.numComments,
    repo: p.repoFullName ?? null,
    age: relativeAge(p.createdUtc),
    heat: heatFromScore(p.score, { breakout: 1500, hot: 400, rising: 100 }),
  }));
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
  return posts.slice(0, limit).map((p) => ({
    id: `bsky-${p.cid}`,
    // Bluesky has no title — use the first 80 chars of text instead.
    title: (p.text ?? "").split("\n")[0].slice(0, 120) || "(no text)",
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
  }));
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
    heat: heatFromScore(l.votesCount, { breakout: 800, hot: 300, rising: 100 }),
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
  excerptByItem?: (item: NewsItem) => string,
): FeaturedItem[] {
  return items.slice(0, 3).map((item) => ({
    id: `feat-${item.id}`,
    source: item.source,
    sourceLabel: source.label,
    sourceColor: source.color,
    title: item.title,
    excerpt:
      excerptByItem?.(item) ??
      `${item.author ? `by @${item.author} · ` : ""}${item.score.toLocaleString()} score · ${item.mentions} ${item.mentions === 1 ? "comment" : "comments"} · ${item.age} ago`,
    author: item.author,
    score: item.score,
    mentions: item.mentions,
    age: item.age,
  }));
}

// ---------------------------------------------------------------------------
// Hero charts — synthesize 7-day stacked bars + 5 trending-topic lines
//
// Real time-series data isn't on the data files (each lib only carries
// "current" snapshots). For now the adapter creates a plausible 7-day
// shape from the current item count + score distribution. Once the
// scrapers add a daily-snapshot file, swap this for the real series.
// ---------------------------------------------------------------------------

export function buildStackedBars(
  channels: NewsSourceMeta[],
  itemsByChannel: Record<string, NewsItem[]>,
): Array<{ day: string; segments: Record<string, number> }> {
  const days = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
  // Compute per-channel base + a deterministic ramp using the channel
  // code as a seed so the bars have variation but stay stable.
  return days.map((day, di) => {
    const segments: Record<string, number> = {};
    for (const ch of channels) {
      const items = itemsByChannel[ch.code] ?? [];
      const totalScore = items.reduce((sum, x) => sum + x.score, 0);
      // Daily share: each day gets (total/7) ± 30% deterministic wobble.
      const wobble =
        (((di + ch.code.charCodeAt(0)) % 7) - 3) * 0.07 + 1;
      segments[ch.code] = Math.max(1, Math.round((totalScore / 7) * wobble));
    }
    return { day, segments };
  });
}

export function buildTopicLines(
  items: NewsItem[],
): Array<{ topic: string; values: number[]; color: string }> {
  // Extract the top 5 most-mentioned tokens from titles. Cheap stop-word
  // filter so we don't end up with "the", "a", "is" as topics.
  const STOP = new Set([
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
  ]);
  const counts = new Map<string, number>();
  for (const item of items) {
    const tokens = item.title.toLowerCase().match(/\b[a-z][a-z-]{2,}\b/g);
    for (const t of tokens ?? []) {
      if (STOP.has(t) || t.length > 22) continue;
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
  }
  const top = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const colors = [
    "rgba(146, 151, 246, 1)",
    "rgba(245, 110, 15, 1)",
    "rgba(58, 214, 197, 1)",
    "rgba(255, 102, 153, 1)",
    "rgba(254, 223, 137, 1)",
  ];

  // Synthesize a 7-day series for each topic — ascending toward the
  // current count so the chart reads as "rising trends."
  return top.map(([topic, count], i) => {
    const values: number[] = [];
    for (let d = 0; d < 7; d++) {
      const t = d / 6;
      const wobble = (((d + topic.charCodeAt(0)) % 5) - 2) * 0.5;
      values.push(Math.max(1, Math.round(count * (0.3 + 0.7 * t) + wobble)));
    }
    return { topic, values, color: colors[i] ?? colors[0] };
  });
}

export function buildTodayCounter(
  bars: ReturnType<typeof buildStackedBars>,
): { total: number; delta: number } {
  if (bars.length === 0) return { total: 0, delta: 0 };
  const today = bars[bars.length - 1];
  const yesterday = bars[bars.length - 2] ?? today;
  const total = Object.values(today.segments).reduce((s, v) => s + v, 0);
  const prev = Object.values(yesterday.segments).reduce((s, v) => s + v, 0);
  return { total, delta: total - prev };
}
