// Cross-channel mention markers for the repo detail Stars chart.

import {
  getHnMentions,
  type HnStory,
} from "@/lib/hackernews";
import {
  type RedditPost,
  redditPostHref,
} from "@/lib/reddit";
import { getRedditMentions } from "@/lib/reddit-data";
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
import {
  MENTION_PLATFORM_COLORS,
  MENTION_PLATFORM_LABELS,
  type MentionMarker,
  type MentionPlatform,
} from "./MentionMarkerMeta";

function fromHnStory(story: HnStory): MentionMarker {
  return {
    id: `hn-${story.id}`,
    platform: "hn",
    platformLabel: MENTION_PLATFORM_LABELS.hn,
    color: MENTION_PLATFORM_COLORS.hn,
    xValue: story.createdUtc * 1000,
    title: story.title,
    author: story.by,
    score: story.score,
    scoreLabel: "points",
    url: `https://news.ycombinator.com/item?id=${story.id}`,
  };
}

function fromRedditPost(post: RedditPost): MentionMarker {
  return {
    id: `reddit-${post.id}`,
    platform: "reddit",
    platformLabel: MENTION_PLATFORM_LABELS.reddit,
    color: MENTION_PLATFORM_COLORS.reddit,
    xValue: post.createdUtc * 1000,
    title: post.title,
    author: `u/${post.author} · r/${post.subreddit}`,
    score: post.score,
    scoreLabel: "upvotes",
    url: redditPostHref(post.permalink, post.url),
  };
}

function fromBskyPost(post: BskyPost): MentionMarker {
  const handle = post.author?.handle ?? "unknown";
  const parsed = Date.parse(post.createdAt);
  const xValue = Number.isFinite(parsed) ? parsed : (post.createdUtc ?? 0) * 1000;
  return {
    id: `bsky-${post.uri}`,
    platform: "bluesky",
    platformLabel: MENTION_PLATFORM_LABELS.bluesky,
    color: MENTION_PLATFORM_COLORS.bluesky,
    xValue,
    title: post.text,
    author: `@${handle}`,
    score: post.likeCount,
    scoreLabel: "likes",
    url: post.bskyUrl,
  };
}

function fromDevtoArticle(article: DevtoArticle): MentionMarker {
  return {
    id: `devto-${article.id}`,
    platform: "devto",
    platformLabel: MENTION_PLATFORM_LABELS.devto,
    color: MENTION_PLATFORM_COLORS.devto,
    stroke: "#ffffff",
    xValue: Date.parse(article.publishedAt),
    title: article.title,
    author: `@${article.author?.username ?? "anon"}`,
    score: article.reactionsCount,
    scoreLabel: "reactions",
    url: article.url,
  };
}

function fromPhLaunch(launch: Launch): MentionMarker {
  const parsed = Date.parse(launch.createdAt);
  const xValue = Number.isFinite(parsed)
    ? parsed
    : Date.now() - launch.daysSinceLaunch * 86_400_000;
  return {
    id: `ph-${launch.id}`,
    platform: "ph",
    platformLabel: MENTION_PLATFORM_LABELS.ph,
    color: MENTION_PLATFORM_COLORS.ph,
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

export function buildMentionMarkers(
  fullName: string,
  windowDays = 30,
): MentionMarker[] {
  const out: MentionMarker[] = [];
  const cutoff = Date.now() - windowDays * 86_400_000;

  const hn = getHnMentions(fullName);
  if (hn) for (const story of hn.stories) out.push(fromHnStory(story));

  const reddit = getRedditMentions(fullName);
  if (reddit) for (const post of reddit.posts) out.push(fromRedditPost(post));

  const bluesky = getBlueskyMentions(fullName);
  if (bluesky) for (const post of bluesky.posts) out.push(fromBskyPost(post));

  const devto = getDevtoMentions(fullName);
  if (devto) for (const article of devto.articles) out.push(fromDevtoArticle(article));

  const launch = getLaunchForRepo(fullName);
  if (launch) out.push(fromPhLaunch(launch));

  return out
    .filter((marker) => Number.isFinite(marker.xValue) && marker.xValue >= cutoff)
    .sort((a, b) => a.xValue - b.xValue);
}

export function groupMarkersByPlatform(
  markers: MentionMarker[],
): Map<MentionPlatform, MentionMarker[]> {
  const out = new Map<MentionPlatform, MentionMarker[]>();
  for (const marker of markers) {
    const bucket = out.get(marker.platform);
    if (bucket) bucket.push(marker);
    else out.set(marker.platform, [marker]);
  }
  return out;
}
