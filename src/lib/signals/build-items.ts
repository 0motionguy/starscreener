// Per-source adapters: convert each source's native records into the
// uniform SignalItem[] shape consumed by consensus / volume / tag-momentum.
//
// Keeps the page.tsx orchestrator focused on layout. Adding a new source
// = adding one toSignalItems function here.

import type { HnStory } from "../hackernews";
import type { BskyPost } from "../bluesky";
import type { DevtoArticle } from "../devto";
import type { RedditPost } from "../reddit";
import type { TrendingRow } from "../trending";
import type { RssItem } from "../rss-feeds";
import type { TwitterPostItem } from "../twitter";
import type { SignalItem } from "./types";

function clamp01(v: number): number {
  return Math.max(0, Math.min(100, v));
}

function tokenize(s: string): string[] {
  // Cheap tag pull-out for sources without native tags.
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s\-#]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4);
}

export function hnToSignalItems(stories: HnStory[]): SignalItem[] {
  return stories.map((s) => ({
    source: "hn",
    id: `hn:${s.id}`,
    title: s.title,
    url: s.url || `https://news.ycombinator.com/item?id=${s.id}`,
    postedAtMs: s.createdUtc * 1000,
    linkedRepo: s.linkedRepos?.[0]?.fullName?.toLowerCase() ?? null,
    tags: Array.isArray(s.content_tags) ? s.content_tags.slice(0, 5) : [],
    engagement: s.score,
    signalScore: clamp01(s.trendingScore ?? Math.round(s.score / 5)),
    attribution: s.by,
  }));
}

export function redditToSignalItems(posts: RedditPost[]): SignalItem[] {
  return posts.map((p) => ({
    source: "reddit",
    id: `reddit:${p.id}`,
    title: p.title,
    url: p.url || `https://www.reddit.com${p.permalink}`,
    postedAtMs: p.createdUtc * 1000,
    linkedRepo: p.repoFullName?.toLowerCase() ?? null,
    tags: Array.isArray(p.content_tags) ? p.content_tags.slice(0, 5) : [],
    engagement: p.score,
    signalScore: clamp01(p.trendingScore ?? Math.round(p.score / 10)),
    attribution: `r/${p.subreddit} · u/${p.author}`,
  }));
}

export function bskyToSignalItems(posts: BskyPost[]): SignalItem[] {
  return posts.map((p) => {
    const postedMs = p.createdUtc
      ? p.createdUtc * 1000
      : Date.parse(p.createdAt) || 0;
    const tags: string[] = [];
    if (p.matchedKeyword) tags.push(p.matchedKeyword.toLowerCase());
    if (p.matchedTopicLabel) tags.push(p.matchedTopicLabel.toLowerCase());
    if (Array.isArray(p.content_tags)) tags.push(...p.content_tags.slice(0, 4));
    return {
      source: "bluesky",
      id: `bsky:${p.uri}`,
      title: p.text || `@${p.author?.handle ?? "unknown"}`,
      url: p.bskyUrl || null,
      postedAtMs: postedMs,
      linkedRepo: p.linkedRepos?.[0]?.fullName?.toLowerCase() ?? null,
      tags: tags.slice(0, 5),
      engagement: p.likeCount,
      signalScore: clamp01(p.trendingScore ?? Math.round(p.likeCount / 2)),
      attribution: `@${p.author?.handle ?? "unknown"}`,
    };
  });
}

export function devtoToSignalItems(articles: DevtoArticle[]): SignalItem[] {
  return articles.map((a) => ({
    source: "devto",
    id: `devto:${a.id}`,
    title: a.title,
    url: a.url,
    postedAtMs: Date.parse(a.publishedAt) || 0,
    linkedRepo: a.linkedRepos?.[0]?.fullName?.toLowerCase() ?? null,
    tags: Array.isArray(a.tags) ? a.tags.slice(0, 5) : [],
    engagement: a.reactionsCount,
    signalScore: clamp01(a.trendingScore ?? Math.round(a.reactionsCount / 5)),
    attribution: a.author?.username ?? "",
  }));
}

/**
 * GitHub trending repos are aggregates, not events — they don't carry a
 * "posted at" timestamp. We stamp them with the trending dataset's
 * fetchedAt so they cluster honestly in the volume bucket where we last
 * saw them update, instead of falsifying per-row times.
 */
export function githubToSignalItems(
  rows: TrendingRow[],
  fetchedAtIso: string,
): SignalItem[] {
  const fetchedMs = Date.parse(fetchedAtIso) || Date.now();
  return rows.map((r) => {
    const stars = Number.parseInt(r.stars ?? "0", 10) || 0;
    const score = Number.parseFloat(r.total_score ?? "0") || 0;
    const tags: string[] = [];
    if (r.primary_language) tags.push(r.primary_language.toLowerCase());
    if (r.collection_names) {
      for (const c of r.collection_names.split(",").map((s) => s.trim())) {
        if (c) tags.push(c.toLowerCase());
      }
    }
    return {
      source: "github",
      id: `gh:${r.repo_id || r.repo_name}`,
      title: r.repo_name,
      url: `https://github.com/${r.repo_name}`,
      postedAtMs: fetchedMs,
      linkedRepo: r.repo_name?.toLowerCase() ?? null,
      tags: tags.slice(0, 5),
      engagement: stars,
      signalScore: clamp01(Math.min(100, score)),
      attribution: r.primary_language || "—",
    };
  });
}

export function twitterToSignalItems(posts: TwitterPostItem[]): SignalItem[] {
  return posts.map((p) => ({
    source: "x",
    id: `x:${p.postId}`,
    title: p.text,
    url: p.postUrl,
    postedAtMs: Date.parse(p.postedAt) || 0,
    linkedRepo: p.repoFullName?.toLowerCase() ?? null,
    tags: tokenize(p.text).slice(0, 4),
    engagement: p.engagement,
    signalScore: clamp01(Math.log10(Math.max(1, p.engagement)) * 25),
    attribution: `@${p.authorHandle}`,
  }));
}

export function rssToSignalItems(
  items: RssItem[],
  source: "claude" | "openai",
): SignalItem[] {
  return items.map((it) => {
    const tags: string[] = [];
    if (it.category) tags.push(it.category.toLowerCase());
    tags.push(...tokenize(it.title).slice(0, 3));
    return {
      source,
      id: `${source}:${it.id}`,
      title: it.title,
      url: it.url || null,
      postedAtMs: Date.parse(it.publishedAt) || 0,
      linkedRepo: null,
      tags: tags.slice(0, 5),
      engagement: 0,
      // RSS posts get a flat moderate score so they have a chance to enter
      // consensus when the same story shows up on HN/Reddit/X. They never
      // dominate the radar by themselves.
      signalScore: 50,
      attribution: it.author || (source === "claude" ? "Anthropic" : "OpenAI"),
    };
  });
}
