// Cross-channel mention markers for the repo detail Stars chart.
//
// Aggregates HN / Reddit / Bluesky / Dev.to / ProductHunt mentions of a
// single repo into a flat MentionMarker[] keyed by epoch ms. Each marker
// carries the platform tone, a display label, the source URL, and the
// minimal metadata the chart tooltip renders.
//
// Pure data-shaping module — no React. The marker layer itself renders
// inside RepoDetailChart using recharts <Scatter> series so hover sync
// stays inside the same chart context as the area path.
//
// Server-readable (no "use client") so the page route can pre-compute
// the markers and ship a slim props shape to the client chart.
//
// Marker placement rule: each marker's xValue is the epoch ms of the
// underlying post/launch timestamp; the chart maps this to the same
// 30-day numeric x scale the Stars area uses (also keyed in epoch ms).

import {
  getHnMentions,
  type HnStory,
} from "@/lib/hackernews";
import {
  getRedditMentions,
  type RedditPost,
} from "@/lib/reddit";
import {
  getBlueskyMentions,
  type BskyPost,
} from "@/lib/bluesky";
import {
  getDevtoMentions,
  type DevtoArticle,
} from "@/lib/devto";
import {
  getLaunchForRepo,
  type Launch,
} from "@/lib/producthunt";

export type MentionPlatform = "hn" | "reddit" | "bluesky" | "devto" | "ph";

export interface MentionMarker {
  /** Stable key (`<platform>-<id>`). Used as React key + Scatter dataKey. */
  id: string;
  platform: MentionPlatform;
  /** Display name shown in the tooltip and aria label. */
  platformLabel: string;
  /** Marker fill color. */
  color: string;
  /** Optional border (used to keep the dark dev.to dot visible on dark bg). */
  stroke?: string;
  /** Epoch ms — placed on the X axis. */
  xValue: number;
  /** Post title or product name. */
  title: string;
  /** Author / handle / maker. */
  author: string;
  /** Score-style metric for tooltip (likes, upvotes, reactions, etc.). */
  score: number;
  scoreLabel: string;
  /** Outbound source URL. Always opened in new tab via the chart click handler. */
  url: string;
}

const PLATFORM_LABEL: Record<MentionPlatform, string> = {
  hn: "Hacker News",
  reddit: "Reddit",
  bluesky: "Bluesky",
  devto: "dev.to",
  ph: "ProductHunt",
};

const PLATFORM_COLOR: Record<MentionPlatform, string> = {
  hn: "#ff6600",
  reddit: "#ff4500",
  bluesky: "#0085FF",
  devto: "#0a0a0a",
  ph: "#DA552F",
};

function fromHnStory(s: HnStory): MentionMarker {
  return {
    id: `hn-${s.id}`,
    platform: "hn",
    platformLabel: PLATFORM_LABEL.hn,
    color: PLATFORM_COLOR.hn,
    xValue: s.createdUtc * 1000,
    title: s.title,
    author: s.by,
    score: s.score,
    scoreLabel: "points",
    url: `https://news.ycombinator.com/item?id=${s.id}`,
  };
}

function fromRedditPost(p: RedditPost): MentionMarker {
  return {
    id: `reddit-${p.id}`,
    platform: "reddit",
    platformLabel: PLATFORM_LABEL.reddit,
    color: PLATFORM_COLOR.reddit,
    xValue: p.createdUtc * 1000,
    title: p.title,
    author: `u/${p.author} · r/${p.subreddit}`,
    score: p.score,
    scoreLabel: "upvotes",
    url: `https://reddit.com${p.permalink}`,
  };
}

function fromBskyPost(p: BskyPost): MentionMarker {
  const handle = p.author?.handle ?? "unknown";
  // BskyPost.createdAt is ISO; fall back to createdUtc if parse fails.
  const ts = Date.parse(p.createdAt);
  const xValue = Number.isFinite(ts)
    ? ts
    : (p.createdUtc ?? 0) * 1000;
  return {
    id: `bsky-${p.uri}`,
    platform: "bluesky",
    platformLabel: PLATFORM_LABEL.bluesky,
    color: PLATFORM_COLOR.bluesky,
    xValue,
    title: p.text,
    author: `@${handle}`,
    score: p.likeCount,
    scoreLabel: "likes",
    url: p.bskyUrl,
  };
}

function fromDevtoArticle(a: DevtoArticle): MentionMarker {
  return {
    id: `devto-${a.id}`,
    platform: "devto",
    platformLabel: PLATFORM_LABEL.devto,
    color: PLATFORM_COLOR.devto,
    stroke: "#ffffff",
    xValue: Date.parse(a.publishedAt),
    title: a.title,
    author: `@${a.author?.username ?? "anon"}`,
    score: a.reactionsCount,
    scoreLabel: "reactions",
    url: a.url,
  };
}

function fromPhLaunch(launch: Launch): MentionMarker {
  // launch.createdAt is ISO; daysSinceLaunch is a fallback.
  const parsed = Date.parse(launch.createdAt);
  const xValue = Number.isFinite(parsed)
    ? parsed
    : Date.now() - launch.daysSinceLaunch * 86_400_000;
  return {
    id: `ph-${launch.id}`,
    platform: "ph",
    platformLabel: PLATFORM_LABEL.ph,
    color: PLATFORM_COLOR.ph,
    xValue,
    title: `${launch.name} — ${launch.tagline}`,
    author: launch.makers?.[0]?.username
      ? `@${launch.makers[0].username}`
      : "—",
    score: launch.votesCount,
    scoreLabel: "upvotes",
    url: launch.url,
  };
}

/**
 * Aggregate every cross-channel mention of `fullName` into a flat marker
 * list, sorted ascending by timestamp. Filters to the trailing `windowDays`
 * window so markers always line up inside the chart's visible x-domain.
 */
export function buildMentionMarkers(
  fullName: string,
  windowDays = 30,
): MentionMarker[] {
  const out: MentionMarker[] = [];
  const cutoff = Date.now() - windowDays * 86_400_000;

  const hn = getHnMentions(fullName);
  if (hn) for (const s of hn.stories) out.push(fromHnStory(s));

  const reddit = getRedditMentions(fullName);
  if (reddit) for (const p of reddit.posts) out.push(fromRedditPost(p));

  const bsky = getBlueskyMentions(fullName);
  if (bsky) for (const p of bsky.posts) out.push(fromBskyPost(p));

  const devto = getDevtoMentions(fullName);
  if (devto) for (const a of devto.articles) out.push(fromDevtoArticle(a));

  const ph = getLaunchForRepo(fullName);
  if (ph) out.push(fromPhLaunch(ph));

  return out
    .filter((m) => Number.isFinite(m.xValue) && m.xValue >= cutoff)
    .sort((a, b) => a.xValue - b.xValue);
}

/**
 * Group markers by platform — used by the chart to drive one Scatter
 * series per platform with its own color/shape.
 */
export function groupMarkersByPlatform(
  markers: MentionMarker[],
): Map<MentionPlatform, MentionMarker[]> {
  const out = new Map<MentionPlatform, MentionMarker[]>();
  for (const m of markers) {
    const arr = out.get(m.platform);
    if (arr) arr.push(m);
    else out.set(m.platform, [m]);
  }
  return out;
}

export const MENTION_PLATFORM_LABELS = PLATFORM_LABEL;
export const MENTION_PLATFORM_COLORS = PLATFORM_COLOR;
