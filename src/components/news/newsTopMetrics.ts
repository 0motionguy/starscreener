// Per-source metric + hero builders for <NewsTopHeaderV3>.
//
// Each builder accepts the raw trending payload that the news pages
// already load and returns the {cards, topStories} pair the header
// expects. Three cards always render in this order:
//   0. SNAPSHOT — count + total/top score rows (variant: "snapshot")
//   1. ACTIVITY — horizontal bar chart, one bar per 4-hour bucket of
//      the last 24h (or one bar per source on /signals)
//   2. TOPICS   — horizontal bar chart, top 6 most-mentioned tokens
//      pulled from the item titles (variant: "bars")
//
// All math runs on the server. Arrays are bucketed once per render.

import type {
  NewsHeroStory,
  NewsMetricCard,
  NewsMetricBar,
} from "./NewsTopHeaderV3";
import { hnItemHref, type HnStory, type HnTrendingFile } from "@/lib/hackernews";
import { bskyPostHref, type BskyPost, type BskyTrendingFile } from "@/lib/bluesky";
import type {
  DevtoArticle,
  DevtoMentionsFile,
  DevtoLeaderboardEntry,
} from "@/lib/devto";
import type { Launch, ProductHuntFile } from "@/lib/producthunt";
import type { LobstersStory } from "@/lib/lobsters";
import type { LobstersTrendingFile } from "@/lib/lobsters-trending";
import type { RedditAllPost, AllPostsStats } from "@/lib/reddit-all";

// ---------------------------------------------------------------------------
// Topic palette — cycled through the topic bars. 8 colours × 6 visible
// rows = always at least one cycle. Picked to match the V3 sig palette
// + a couple of supporting hues so the topics card reads as data, not
// a theme stretch.
// ---------------------------------------------------------------------------

const TOPIC_PALETTE = [
  "var(--v3-acc)",
  "#F59E0B",
  "#3AD6C5",
  "#F472B6",
  "#FBBF24",
  "#A78BFA",
  "#34D399",
  "#FB923C",
];

// Stop-words pulled from /news/page.tsx so single-tab and per-source
// pages tokenise titles identically. Keep this list synchronised with
// any updates over there.
const STOP_WORDS = new Set([
  "the","a","an","is","are","was","were","be","been","being","to","of","and","in","on","at","by","for","with","as","from",
  "that","this","it","its","have","has","had","do","does","did","will","would","could","should","may","might","can","shall",
  "you","your","we","our","us","i","my","me","he","she","they","them","his","her","their","what","which","who","when","where",
  "why","how","all","any","both","each","few","more","most","other","some","such","no","nor","not","only","own","same","so","than",
  "too","very","just","now","then","here","there","up","out","if","about","into","through","during","before","after","above","below",
  "between","under","again","further","once","also","but","or","yet","because","until","while","although","though","unless","since",
  "ago","new","using","use","used","show","shows","showing","via","based","build","building","built","make","making","made",
  "get","gets","getting","one","two","three","first","last","way","ways","time","times","day","days","year","years","work","works",
  "working","add","adds","added","adding","fix","fixes","fixed","support","supports","supported","release","releases","released",
  "version","update","updates","updated","github","com","http","https","www","org","io","dev","app","web","site","page","repo",
  "open","source","code","project","projects","tool","tools","api","cli","ui","ux","ai","llm","ml","gpu","cpu","ram",
  "javascript","typescript","python","rust","go","java","cpp","cplusplus","html","css","sql","json","xml","yaml","docker","kubernetes",
  "react","vue","angular","svelte","nextjs","nuxt","node","nodejs","deno","bun","npm","yarn","pnpm","git","github",
]);

// ---------------------------------------------------------------------------
// Generic helpers — exported so /signals (and any other downstream
// surface) can reuse the same time-bucket maths.
// ---------------------------------------------------------------------------

/** Compact "1.2K", "823", "3.4M" formatter for headline numbers. */
export function compactNumber(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 10_000) return `${Math.round(n / 1_000)}K`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString("en-US");
}

/** Tokenise a title down to lowercase words ≥3 chars excluding stop-words. */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
}

/**
 * Build the topic bars for a card: count tokens across the supplied
 * titles, drop the long tail, return the top N as bar rows.
 */
export function topicBars(texts: string[], n: number = 6): NewsMetricBar[] {
  const freq = new Map<string, number>();
  for (const text of texts) {
    if (!text) continue;
    for (const token of tokenize(text)) {
      freq.set(token, (freq.get(token) ?? 0) + 1);
    }
  }
  const sorted = Array.from(freq.entries())
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
  return sorted.map(([topic, count], i) => ({
    label: topic.toUpperCase(),
    value: count,
    valueLabel: count.toLocaleString("en-US"),
    color: TOPIC_PALETTE[i % TOPIC_PALETTE.length],
  }));
}

interface ActivityItem {
  /** Epoch seconds. */
  tsSec: number;
  /** Numeric weight (score, likes, votes…) summed into bar.hintLabel. */
  weight: number;
}

/**
 * Bucket items into 6 four-hour windows over the last 24h. Returns one
 * NewsMetricBar per window. The newest window (current 4h) sits at the
 * top of the chart so the eye lands on "right now" first.
 *
 * Bar value = item count in that window.
 * valueLabel = count (right rail, primary).
 * hintLabel = cumulative weight (score / likes / votes) in that window
 *             (right rail, secondary).
 */
export function activityBars(items: ActivityItem[]): NewsMetricBar[] {
  const buckets = 6;
  const hoursPerBucket = 4;
  const windowSec = buckets * hoursPerBucket * 3600;
  const nowSec = Date.now() / 1000;
  const startSec = nowSec - windowSec;

  const counts = new Array<number>(buckets).fill(0);
  const weights = new Array<number>(buckets).fill(0);

  for (const item of items) {
    const t = item.tsSec;
    if (!Number.isFinite(t) || t < startSec || t > nowSec) continue;
    const idx = Math.min(
      buckets - 1,
      Math.floor((t - startSec) / (hoursPerBucket * 3600)),
    );
    counts[idx] += 1;
    weights[idx] += item.weight || 0;
  }

  // Label format reads as a clear range: "0–4H", "4–8H", "20–24H".
  // The first (top) row is the *current* window — "0–4H" — so the
  // chart answers "what's happening right now?" before anything else.
  const labels: string[] = [];
  for (let i = 0; i < buckets; i++) {
    const startH = i * hoursPerBucket;
    const endH = startH + hoursPerBucket;
    labels.push(`${startH}–${endH}H`);
  }

  // counts[0] is bucket nearest to NOW (last hoursPerBucket hours)
  // because we reversed the index math: the newest events fall into
  // the highest index. Flip so newest sits at top.
  const orderedCounts = counts.slice().reverse();
  const orderedWeights = weights.slice().reverse();

  return orderedCounts.map((count, i) => ({
    label: labels[i] ?? "",
    value: count,
    valueLabel: count.toLocaleString("en-US"),
    hintLabel: orderedWeights[i] > 0 ? compactNumber(orderedWeights[i]) : "—",
    color: "var(--v3-acc)",
  }));
}

/**
 * Per-source volume bars — one row per source. Pre-coloured by the
 * source's brand accent so /news and /signals read as the same chart
 * regardless of which page renders it.
 */
export interface SourceVolumeInput {
  code: string;
  label: string;
  color: string;
  itemCount: number;
  totalScore: number;
}

export function sourceVolumeBars(rows: SourceVolumeInput[]): NewsMetricBar[] {
  return rows
    .filter((r) => r.itemCount > 0)
    .map((r) => ({
      label: r.code,
      value: r.itemCount,
      valueLabel: r.itemCount.toLocaleString("en-US"),
      hintLabel: compactNumber(r.totalScore),
      color: r.color,
    }));
}

// ---------------------------------------------------------------------------
// HackerNews
// ---------------------------------------------------------------------------

export function buildHackerNewsHeader(
  file: HnTrendingFile,
  topStories: HnStory[],
): { cards: [NewsMetricCard, NewsMetricCard, NewsMetricCard]; topStories: NewsHeroStory[] } {
  const stories = file.stories ?? [];
  const totalScore = stories.reduce((s, x) => s + (x.score ?? 0), 0);
  const totalComments = stories.reduce((s, x) => s + (x.descendants ?? 0), 0);
  const frontPage = stories.filter((s) => s.everHitFrontPage).length;
  const topScore = stories.reduce((m, x) => Math.max(m, x.score ?? 0), 0);

  const activity = activityBars(
    stories.map((s) => ({ tsSec: s.createdUtc, weight: s.score ?? 0 })),
  );
  const topics = topicBars(stories.map((s) => s.title));

  const cards: [NewsMetricCard, NewsMetricCard, NewsMetricCard] = [
    {
      variant: "snapshot",
      title: "// SNAPSHOT · NOW",
      rightLabel: `${stories.length} ITEMS`,
      label: "STORIES TRACKED",
      value: compactNumber(stories.length),
      hint: `${frontPage} HIT FRONT PAGE`,
      rows: [
        { label: "TOTAL SCORE", value: compactNumber(totalScore) },
        { label: "TOP SCORE", value: compactNumber(topScore), tone: "accent" },
        { label: "COMMENTS", value: compactNumber(totalComments) },
      ],
    },
    {
      variant: "bars",
      title: "// ACTIVITY · LAST 24H",
      rightLabel: "PER 4H",
      bars: activity,
      labelWidth: 48,
      emptyText: "NO RECENT STORIES",
    },
    {
      variant: "bars",
      title: "// TOPICS · MENTIONED MOST",
      rightLabel: `TOP ${topics.length}`,
      bars: topics,
      labelWidth: 96,
      emptyText: "NOT ENOUGH SIGNAL YET",
    },
  ];

  const heroStories: NewsHeroStory[] = topStories.slice(0, 3).map((s) => ({
    title: s.title,
    href: hnItemHref(s.id),
    external: true,
    sourceCode: "HN",
    byline: s.by ? `@${s.by}` : undefined,
    scoreLabel: `${compactNumber(s.score ?? 0)} pts · ${compactNumber(s.descendants ?? 0)} cmts`,
    ageHours: s.ageHours ?? null,
  }));

  return { cards, topStories: heroStories };
}

// ---------------------------------------------------------------------------
// Bluesky
// ---------------------------------------------------------------------------

export function buildBlueskyHeader(
  file: BskyTrendingFile,
  topPosts: BskyPost[],
): { cards: [NewsMetricCard, NewsMetricCard, NewsMetricCard]; topStories: NewsHeroStory[] } {
  const posts = file.posts ?? [];
  const totalLikes = posts.reduce((s, p) => s + (p.likeCount ?? 0), 0);
  const totalReposts = posts.reduce((s, p) => s + (p.repostCount ?? 0), 0);
  const topLikes = posts.reduce((m, p) => Math.max(m, p.likeCount ?? 0), 0);

  const activity = activityBars(
    posts.map((p) => ({ tsSec: p.createdUtc, weight: p.likeCount ?? 0 })),
  );
  const topics = topicBars(posts.map((p) => p.text));

  const cards: [NewsMetricCard, NewsMetricCard, NewsMetricCard] = [
    {
      variant: "snapshot",
      title: "// SNAPSHOT · NOW",
      rightLabel: `${posts.length} POSTS`,
      label: "POSTS TRACKED",
      value: compactNumber(posts.length),
      hint: `${file.queries?.length ?? 0} QUERY SLICES`,
      rows: [
        { label: "TOTAL LIKES", value: compactNumber(totalLikes) },
        { label: "TOP LIKES", value: compactNumber(topLikes), tone: "accent" },
        { label: "REPOSTS", value: compactNumber(totalReposts) },
      ],
    },
    {
      variant: "bars",
      title: "// ACTIVITY · LAST 24H",
      rightLabel: "PER 4H",
      bars: activity,
      labelWidth: 48,
      emptyText: "NO RECENT POSTS",
    },
    {
      variant: "bars",
      title: "// TOPICS · MENTIONED MOST",
      rightLabel: `TOP ${topics.length}`,
      bars: topics,
      labelWidth: 96,
      emptyText: "NOT ENOUGH SIGNAL YET",
    },
  ];

  const heroStories: NewsHeroStory[] = topPosts.slice(0, 3).map((p) => ({
    title: (p.text ?? "").length > 110
      ? `${p.text.slice(0, 110)}…`
      : (p.text ?? "(post)"),
    href: bskyPostHref(p.uri, p.author?.handle),
    external: true,
    sourceCode: "BS",
    byline: p.author?.handle ? `@${p.author.handle}` : undefined,
    scoreLabel: `${compactNumber(p.likeCount ?? 0)} ♥ · ${compactNumber(p.repostCount ?? 0)} rt`,
    ageHours: p.ageHours ?? null,
  }));

  return { cards, topStories: heroStories };
}

// ---------------------------------------------------------------------------
// dev.to
// ---------------------------------------------------------------------------

export function buildDevtoHeaderFromArticles(
  articles: DevtoArticle[],
  leaderboard: DevtoLeaderboardEntry[],
): { cards: [NewsMetricCard, NewsMetricCard, NewsMetricCard]; topStories: NewsHeroStory[] } {
  // Dedupe by URL — articles can appear under multiple repo buckets.
  const seen = new Set<string>();
  const deduped: DevtoArticle[] = [];
  for (const a of articles) {
    if (a.url && seen.has(a.url)) continue;
    if (a.url) seen.add(a.url);
    deduped.push(a);
  }

  const totalReactions = deduped.reduce(
    (s, a) => s + (a.reactionsCount ?? 0),
    0,
  );
  const topReactions = deduped.reduce(
    (m, a) => Math.max(m, a.reactionsCount ?? 0),
    0,
  );
  const reposLinked = leaderboard.length;

  const activity = activityBars(
    deduped.map((a) => ({
      tsSec: a.publishedAt ? Date.parse(a.publishedAt) / 1000 : 0,
      weight: a.reactionsCount ?? 0,
    })),
  );
  const topics = topicBars(deduped.map((a) => a.title));

  const cards: [NewsMetricCard, NewsMetricCard, NewsMetricCard] = [
    {
      variant: "snapshot",
      title: "// SNAPSHOT · NOW",
      rightLabel: `${deduped.length} ARTICLES`,
      label: "ARTICLES TRACKED",
      value: compactNumber(deduped.length),
      hint: `${reposLinked} REPOS LINKED 7D`,
      rows: [
        { label: "TOTAL REACTIONS", value: compactNumber(totalReactions) },
        { label: "TOP REACTIONS", value: compactNumber(topReactions), tone: "accent" },
        { label: "REPOS LINKED", value: compactNumber(reposLinked) },
      ],
    },
    {
      variant: "bars",
      title: "// ACTIVITY · LAST 24H",
      rightLabel: "PER 4H",
      bars: activity,
      labelWidth: 48,
      emptyText: "NO RECENT ARTICLES",
    },
    {
      variant: "bars",
      title: "// TOPICS · MENTIONED MOST",
      rightLabel: `TOP ${topics.length}`,
      bars: topics,
      labelWidth: 96,
      emptyText: "NOT ENOUGH SIGNAL YET",
    },
  ];

  const topArticles = deduped
    .slice()
    .sort((a, b) => (b.reactionsCount ?? 0) - (a.reactionsCount ?? 0))
    .slice(0, 3);
  const heroStories: NewsHeroStory[] = topArticles.map((a) => ({
    title: a.title,
    href: a.url,
    external: true,
    sourceCode: "DV",
    byline: a.author?.username ? `@${a.author.username}` : undefined,
    scoreLabel: `${compactNumber(a.reactionsCount ?? 0)} ♥ · ${compactNumber(a.commentsCount ?? 0)} cmts`,
    ageHours: a.publishedAt
      ? Math.max(0, (Date.now() - Date.parse(a.publishedAt)) / 3_600_000)
      : null,
  }));

  return { cards, topStories: heroStories };
}

/** Convenience wrapper for /news's dev.to tab — flattens mention buckets. */
export function buildDevtoHeader(
  file: DevtoMentionsFile,
  leaderboard: DevtoLeaderboardEntry[],
): { cards: [NewsMetricCard, NewsMetricCard, NewsMetricCard]; topStories: NewsHeroStory[] } {
  const flat: DevtoArticle[] = [];
  for (const mention of Object.values(file.mentions ?? {})) {
    for (const article of mention.articles ?? []) {
      flat.push(article);
    }
  }
  return buildDevtoHeaderFromArticles(flat, leaderboard);
}

// ---------------------------------------------------------------------------
// ProductHunt
// ---------------------------------------------------------------------------

export function buildProductHuntHeader(
  file: ProductHuntFile,
  topLaunches: Launch[],
): { cards: [NewsMetricCard, NewsMetricCard, NewsMetricCard]; topStories: NewsHeroStory[] } {
  const launches = file.launches ?? [];
  const totalVotes = launches.reduce((s, l) => s + (l.votesCount ?? 0), 0);
  const totalComments = launches.reduce((s, l) => s + (l.commentsCount ?? 0), 0);
  const topVotes = launches.reduce((m, l) => Math.max(m, l.votesCount ?? 0), 0);

  const activity = activityBars(
    launches.map((l) => ({
      tsSec: l.createdAt ? Date.parse(l.createdAt) / 1000 : 0,
      weight: l.votesCount ?? 0,
    })),
  );
  const topics = topicBars(
    launches.map((l) => `${l.name} ${l.tagline ?? ""}`),
  );

  const cards: [NewsMetricCard, NewsMetricCard, NewsMetricCard] = [
    {
      variant: "snapshot",
      title: "// SNAPSHOT · NOW",
      rightLabel: `${launches.length} LAUNCHES`,
      label: "LAUNCHES TRACKED",
      value: compactNumber(launches.length),
      hint: `${file.windowDays ?? 7}D WINDOW`,
      rows: [
        { label: "TOTAL VOTES", value: compactNumber(totalVotes) },
        { label: "TOP VOTES", value: compactNumber(topVotes), tone: "accent" },
        { label: "COMMENTS", value: compactNumber(totalComments) },
      ],
    },
    {
      variant: "bars",
      title: "// ACTIVITY · LAST 24H",
      rightLabel: "PER 4H",
      bars: activity,
      labelWidth: 48,
      emptyText: "NO RECENT LAUNCHES",
    },
    {
      variant: "bars",
      title: "// TOPICS · MENTIONED MOST",
      rightLabel: `TOP ${topics.length}`,
      bars: topics,
      labelWidth: 96,
      emptyText: "NOT ENOUGH SIGNAL YET",
    },
  ];

  const heroStories: NewsHeroStory[] = topLaunches.slice(0, 3).map((l) => ({
    title: l.tagline ? `${l.name} — ${l.tagline}` : l.name,
    href: l.url || `https://www.producthunt.com/posts/${l.id}`,
    external: true,
    sourceCode: "PH",
    byline: l.makers?.[0]?.name ? `by ${l.makers[0].name}` : undefined,
    scoreLabel: `${compactNumber(l.votesCount ?? 0)} ▲ · ${compactNumber(l.commentsCount ?? 0)} cmts`,
    ageHours: l.createdAt
      ? Math.max(0, (Date.now() - Date.parse(l.createdAt)) / 3_600_000)
      : null,
  }));

  return { cards, topStories: heroStories };
}

// ---------------------------------------------------------------------------
// Reddit
// ---------------------------------------------------------------------------

export function buildRedditHeader(
  posts: RedditAllPost[],
  stats: AllPostsStats,
): { cards: [NewsMetricCard, NewsMetricCard, NewsMetricCard]; topStories: NewsHeroStory[] } {
  const totalScore = posts.reduce((s, p) => s + (p.score ?? 0), 0);
  const totalComments = posts.reduce((s, p) => s + (p.numComments ?? 0), 0);
  const topScore = posts.reduce((m, p) => Math.max(m, p.score ?? 0), 0);

  const activity = activityBars(
    posts.map((p) => ({ tsSec: p.createdUtc, weight: p.score ?? 0 })),
  );
  const topics = topicBars(posts.map((p) => p.title));

  const cards: [NewsMetricCard, NewsMetricCard, NewsMetricCard] = [
    {
      variant: "snapshot",
      title: "// SNAPSHOT · NOW",
      rightLabel: `${stats.totalPosts} POSTS`,
      label: "POSTS TRACKED",
      value: compactNumber(stats.totalPosts),
      hint: `${stats.breakouts24h} BREAKOUTS · 24H`,
      rows: [
        { label: "TOTAL SCORE", value: compactNumber(totalScore) },
        { label: "TOP SCORE", value: compactNumber(topScore), tone: "accent" },
        { label: "COMMENTS", value: compactNumber(totalComments) },
      ],
    },
    {
      variant: "bars",
      title: "// ACTIVITY · LAST 24H",
      rightLabel: "PER 4H",
      bars: activity,
      labelWidth: 56,
      emptyText: "NO RECENT POSTS",
    },
    {
      variant: "bars",
      title: "// TOPICS · MENTIONED MOST",
      rightLabel: `TOP ${topics.length}`,
      bars: topics,
      labelWidth: 96,
      emptyText: "NOT ENOUGH SIGNAL YET",
    },
  ];

  const heroes = posts
    .slice()
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, 3);
  const heroStories: NewsHeroStory[] = heroes.map((p) => ({
    title: p.title,
    href: p.url || `https://www.reddit.com${p.permalink}`,
    external: true,
    sourceCode: "R",
    byline: p.subreddit ? `r/${p.subreddit}` : undefined,
    scoreLabel: `${compactNumber(p.score ?? 0)} ↑ · ${compactNumber(p.numComments ?? 0)} cmts`,
    ageHours: p.createdUtc
      ? Math.max(0, (Date.now() / 1000 - p.createdUtc) / 3600)
      : null,
  }));

  return { cards, topStories: heroStories };
}

// ---------------------------------------------------------------------------
// Lobsters
// ---------------------------------------------------------------------------

export function buildLobstersHeader(
  file: LobstersTrendingFile,
  topStories: LobstersStory[],
): { cards: [NewsMetricCard, NewsMetricCard, NewsMetricCard]; topStories: NewsHeroStory[] } {
  const stories = file.stories ?? [];
  const totalScore = stories.reduce((s, x) => s + (x.score ?? 0), 0);
  const totalComments = stories.reduce(
    (s, x) => s + (x.commentCount ?? 0),
    0,
  );
  const topScore = stories.reduce((m, x) => Math.max(m, x.score ?? 0), 0);

  const activity = activityBars(
    stories.map((s) => ({ tsSec: s.createdUtc, weight: s.score ?? 0 })),
  );
  const topics = topicBars(stories.map((s) => s.title));

  const cards: [NewsMetricCard, NewsMetricCard, NewsMetricCard] = [
    {
      variant: "snapshot",
      title: "// SNAPSHOT · NOW",
      rightLabel: `${stories.length} ITEMS`,
      label: "STORIES TRACKED",
      value: compactNumber(stories.length),
      hint: `${file.windowHours ?? 24}H WINDOW`,
      rows: [
        { label: "TOTAL SCORE", value: compactNumber(totalScore) },
        { label: "TOP SCORE", value: compactNumber(topScore), tone: "accent" },
        { label: "COMMENTS", value: compactNumber(totalComments) },
      ],
    },
    {
      variant: "bars",
      title: "// ACTIVITY · LAST 24H",
      rightLabel: "PER 4H",
      bars: activity,
      labelWidth: 48,
      emptyText: "NO RECENT STORIES",
    },
    {
      variant: "bars",
      title: "// TOPICS · MENTIONED MOST",
      rightLabel: `TOP ${topics.length}`,
      bars: topics,
      labelWidth: 96,
      emptyText: "NOT ENOUGH SIGNAL YET",
    },
  ];

  const heroStories: NewsHeroStory[] = topStories.slice(0, 3).map((s) => ({
    title: s.title,
    href: s.url || `https://lobste.rs/s/${s.shortId ?? ""}`,
    external: true,
    sourceCode: "LZ",
    byline: s.by ? `@${s.by}` : undefined,
    scoreLabel: `${compactNumber(s.score ?? 0)} pts · ${compactNumber(s.commentCount ?? 0)} cmts`,
    ageHours: s.ageHours ?? null,
  }));

  return { cards, topStories: heroStories };
}
