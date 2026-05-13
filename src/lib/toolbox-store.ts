// TOOLBOX read adapter — Phase A.2 reader-switch
//
// Reads aggregated signal events from TOOLBOX (api.aiso.tools) and shapes
// them into the same data structures the local data-store returns. Lets
// us flip per-source readers to TOOLBOX without changing the UI layer.
//
// Each fetchXFromToolbox() returns the legacy file shape (HnMentionsFile,
// BskyMentionsFile, etc.) or `null` on any failure — callers fall back to
// the legacy data-store path on null. This keeps the per-source feature
// flag a one-line guard at the refresh hook and preserves degraded-render
// behaviour when TOOLBOX is unreachable.
//
// Endpoint: GET /v1/signals/leaderboard?type=<signal_type>&limit=...
// Reconstructs logical events server-side (TOOLBOX's tb_signals is EAV);
// each returned row is one repo's most recent event.

import "server-only";

import type {
  HnLeaderboardEntry,
  HnMentionsFile,
  HnRepoMention,
  HnStory,
  HnStoryRef,
} from "./hackernews";
import type {
  BskyLeaderboardEntry,
  BskyMentionsFile,
  BskyPost,
  BskyPostRef,
  BskyRepoMention,
} from "./bluesky";
import type {
  DevtoArticle,
  DevtoLeaderboardEntry,
  DevtoMentionsFile,
  DevtoRepoMention,
  DevtoTopArticleRef,
} from "./devto";
import type {
  RedditLeaderboardEntry,
  RedditMentionsFile,
  RedditPost,
  RedditRepoMention,
} from "./reddit";
import type { ToolboxEvent, ToolboxFetchOptions } from "./toolbox-store-common";
import {
  extractGithubFullName,
  fetchLeaderboardEvents,
  maxProducedAtMs,
} from "./toolbox-store-common";

export type { ToolboxFetchOptions };

function slugIdFromFullName(fullName: string): string {
  return String(fullName)
    .toLowerCase()
    .replace(/\//g, "--")
    .replace(/\./g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

function isoFromMaxOrNow(maxMs: number): string {
  return (maxMs > 0 ? new Date(maxMs) : new Date()).toISOString();
}

// ---------------------------------------------------------------------------
// HN mentions adapter
// ---------------------------------------------------------------------------

function eventToHnMention(event: ToolboxEvent): HnRepoMention | null {
  const f = event.fields;
  if (typeof f !== "object" || f === null) return null;
  const count7d = typeof f.count_7d === "number" ? f.count_7d : null;
  if (count7d === null) return null;
  return {
    count7d,
    scoreSum7d: typeof f.score_sum_7d === "number" ? f.score_sum_7d : 0,
    everHitFrontPage:
      typeof f.ever_hit_front_page === "boolean" ? f.ever_hit_front_page : false,
    topStory:
      f.top_story && typeof f.top_story === "object"
        ? (f.top_story as HnStoryRef)
        : null,
    stories: Array.isArray(f.stories_top10) ? (f.stories_top10 as HnStory[]) : [],
  };
}

/**
 * Fetch the latest HN mentions snapshot from TOOLBOX and shape it into an
 * HnMentionsFile. Returns null on any error so the caller can fall back to
 * the legacy data-store path without throwing.
 *
 * Caveat: TOOLBOX's dual-write caps stories at 10 per repo. Windowed counts
 * (count24h, count30d) computed at reader load time from `stories` will
 * undercount for viral repos with >10 stories in 7 days. Acceptable for
 * the tracer-bullet flip; documented inline.
 */
export async function fetchHnMentionsFromToolbox(
  opts: ToolboxFetchOptions,
): Promise<HnMentionsFile | null> {
  const body = await fetchLeaderboardEvents(opts, "trending.hn.mentions");
  if (!body) return null;

  const mentions: Record<string, HnRepoMention> = {};
  const mentionsByRepoId: Record<string, HnRepoMention> = {};

  for (const ev of body.targets) {
    const fullName = extractGithubFullName(ev.target_identity);
    if (!fullName) continue;
    const mention = eventToHnMention(ev);
    if (!mention) continue;
    mentions[fullName] = mention;
    mentionsByRepoId[slugIdFromFullName(fullName)] = mention;
  }

  const leaderboard: HnLeaderboardEntry[] = Object.entries(mentions)
    .map(([fullName, m]) => ({
      fullName,
      count7d: m.count7d,
      scoreSum7d: m.scoreSum7d,
    }))
    .sort((a, b) => b.scoreSum7d - a.scoreSum7d);

  return {
    fetchedAt: isoFromMaxOrNow(maxProducedAtMs(body.targets)),
    windowDays: 7,
    scannedAlgoliaHits: 0,
    scannedFirebaseItems: 0,
    mentions,
    mentionsByRepoId,
    leaderboard,
  };
}

// ---------------------------------------------------------------------------
// Bluesky mentions adapter
// ---------------------------------------------------------------------------

function eventToBskyMention(event: ToolboxEvent): BskyRepoMention | null {
  const f = event.fields;
  if (typeof f !== "object" || f === null) return null;
  const count7d = typeof f.count_7d === "number" ? f.count_7d : null;
  if (count7d === null) return null;
  return {
    count7d,
    likesSum7d: typeof f.likes_sum_7d === "number" ? f.likes_sum_7d : 0,
    repostsSum7d: typeof f.reposts_sum_7d === "number" ? f.reposts_sum_7d : 0,
    repliesSum7d: typeof f.replies_sum_7d === "number" ? f.replies_sum_7d : 0,
    topPost:
      f.top_post && typeof f.top_post === "object"
        ? (f.top_post as BskyPostRef)
        : null,
    posts: Array.isArray(f.posts_top10) ? (f.posts_top10 as BskyPost[]) : [],
  };
}

export async function fetchBlueskyMentionsFromToolbox(
  opts: ToolboxFetchOptions,
): Promise<BskyMentionsFile | null> {
  const body = await fetchLeaderboardEvents(opts, "trending.bluesky.mentions");
  if (!body) return null;

  const mentions: Record<string, BskyRepoMention> = {};
  for (const ev of body.targets) {
    const fullName = extractGithubFullName(ev.target_identity);
    if (!fullName) continue;
    const mention = eventToBskyMention(ev);
    if (!mention) continue;
    mentions[fullName] = mention;
  }

  const leaderboard: BskyLeaderboardEntry[] = Object.entries(mentions)
    .map(([fullName, m]) => ({
      fullName,
      count7d: m.count7d,
      likesSum7d: m.likesSum7d,
    }))
    .sort((a, b) => b.likesSum7d - a.likesSum7d);

  return {
    fetchedAt: isoFromMaxOrNow(maxProducedAtMs(body.targets)),
    windowDays: 7,
    scannedPosts: 0,
    searchQuery: "",
    pagesFetched: 0,
    mentions,
    leaderboard,
  };
}

// ---------------------------------------------------------------------------
// dev.to mentions adapter
// ---------------------------------------------------------------------------

function eventToDevtoMention(event: ToolboxEvent): DevtoRepoMention | null {
  const f = event.fields;
  if (typeof f !== "object" || f === null) return null;
  const count7d = typeof f.count_7d === "number" ? f.count_7d : null;
  if (count7d === null) return null;
  return {
    count7d,
    reactionsSum7d:
      typeof f.reactions_sum_7d === "number" ? f.reactions_sum_7d : 0,
    commentsSum7d:
      typeof f.comments_sum_7d === "number" ? f.comments_sum_7d : 0,
    topArticle:
      f.top_article && typeof f.top_article === "object"
        ? (f.top_article as DevtoTopArticleRef)
        : null,
    articles: Array.isArray(f.articles_top10)
      ? (f.articles_top10 as DevtoArticle[])
      : [],
  };
}

export async function fetchDevtoMentionsFromToolbox(
  opts: ToolboxFetchOptions,
): Promise<DevtoMentionsFile | null> {
  const body = await fetchLeaderboardEvents(opts, "trending.devto.mentions");
  if (!body) return null;

  const mentions: Record<string, DevtoRepoMention> = {};
  for (const ev of body.targets) {
    const fullName = extractGithubFullName(ev.target_identity);
    if (!fullName) continue;
    const mention = eventToDevtoMention(ev);
    if (!mention) continue;
    mentions[fullName] = mention;
  }

  const leaderboard: DevtoLeaderboardEntry[] = Object.entries(mentions)
    .map(([fullName, m]) => ({
      fullName,
      count7d: m.count7d,
      reactionsSum7d: m.reactionsSum7d,
    }))
    .sort((a, b) => b.reactionsSum7d - a.reactionsSum7d);

  return {
    fetchedAt: isoFromMaxOrNow(maxProducedAtMs(body.targets)),
    windowDays: 7,
    scannedArticles: 0,
    bodyFetchMode: "description-only",
    mentions,
    leaderboard,
  };
}

// ---------------------------------------------------------------------------
// Reddit mentions adapter
//
// Field-name remap: the dual-write (`scripts/_toolbox-ingest.mjs:189`) sends
// `score_sum_7d` but the local canonical field is `upvotes7d` (see
// `RedditRepoMention` in src/lib/reddit.ts). Mapping happens in
// eventToRedditMention. The over-sent `top_post` field is ignored — local
// type carries no per-mention topPost.
// ---------------------------------------------------------------------------

function eventToRedditMention(event: ToolboxEvent): RedditRepoMention | null {
  const f = event.fields;
  if (typeof f !== "object" || f === null) return null;
  const count7d = typeof f.count_7d === "number" ? f.count_7d : null;
  if (count7d === null) return null;
  return {
    count7d,
    upvotes7d: typeof f.score_sum_7d === "number" ? f.score_sum_7d : 0,
    posts: Array.isArray(f.posts_top10) ? (f.posts_top10 as RedditPost[]) : [],
  };
}

export async function fetchRedditMentionsFromToolbox(
  opts: ToolboxFetchOptions,
): Promise<RedditMentionsFile | null> {
  const body = await fetchLeaderboardEvents(opts, "trending.reddit.mentions");
  if (!body) return null;

  const mentions: Record<string, RedditRepoMention> = {};
  for (const ev of body.targets) {
    const fullName = extractGithubFullName(ev.target_identity);
    if (!fullName) continue;
    const mention = eventToRedditMention(ev);
    if (!mention) continue;
    mentions[fullName] = mention;
  }

  const leaderboard: RedditLeaderboardEntry[] = Object.entries(mentions)
    .map(([fullName, m]) => ({
      fullName,
      count7d: m.count7d,
      upvotes7d: m.upvotes7d,
    }))
    .sort((a, b) => {
      if (b.upvotes7d !== a.upvotes7d) return b.upvotes7d - a.upvotes7d;
      if (b.count7d !== a.count7d) return b.count7d - a.count7d;
      return a.fullName.localeCompare(b.fullName);
    });

  return {
    fetchedAt: isoFromMaxOrNow(maxProducedAtMs(body.targets)),
    cold: Object.keys(mentions).length === 0,
    scannedSubreddits: [],
    scannedPostsTotal: 0,
    mentions,
    // `topPosts` not transmitted by dual-write. buildGlobalRedditPosts falls
    // through to flattenMentionPosts(file) when topPosts is empty.
    topPosts: [],
    leaderboard,
  };
}
