// StarScreener — Bluesky (AT Protocol) live social adapter.
//
// Public search via `public.api.bsky.app` — no auth required for
// app.bsky.feed.searchPosts. The static JSON at data/bluesky-mentions.json
// is produced by scripts/scrape-bluesky.mjs on a cron; this adapter gives
// the ingest pipeline a live path so mentions land in MentionStore with
// the same dedup / URL normalisation / jsonl persistence as HN, Reddit, GH.
//
// Contract: never throws. Logs `[social:bluesky] …` on error, returns [].

import type { Sentiment, SocialPlatform } from "@/lib/types";
import { bskyPostHref } from "@/lib/bluesky";
import { slugToId } from "@/lib/utils";
import { sourceHealthTracker } from "@/lib/source-health-tracker";
import type { RepoMention, SocialAdapter } from "../types";
import { inferSentiment } from "./social-adapters";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USER_AGENT = "TrendingRepo/1.0 (+https://trendingrepo.com)";
const FETCH_TIMEOUT_MS = 5000;

/** AT Proto searchPosts caps limit at 100; 25 is a sensible per-repo default. */
const SEARCH_LIMIT = 25;

/** Content truncation cap (keep store payload tight). */
const CONTENT_MAX_CHARS = 220;

/** Influencer threshold — high-engagement post signals broader reach. */
const INFLUENCER_ENGAGEMENT_THRESHOLD = 100;

/** Engagement weights — mirror scripts/scrape-bluesky.mjs computeTrendingScore. */
const REPOST_WEIGHT = 2;

/**
 * Engagement → estimated reach multiplier. Bluesky's Discover + Following
 * feeds mean a single viral post averages ~30x its engagement count in
 * impressions (vs HN's ~150x story-points or Reddit's ~50x upvotes).
 */
const REACH_MULTIPLIER = 30;

/**
 * Unauthenticated AppView endpoint for post search. `api.bsky.app` is the
 * canonical public edge that serves searchPosts without a session JWT.
 * `public.api.bsky.app` exists but is behind stricter rate gating that 403s
 * most anonymous traffic (verified empirically 2026-04-24). Stick with the
 * bare host.
 */
const SEARCH_ENDPOINT =
  "https://api.bsky.app/xrpc/app.bsky.feed.searchPosts";

// ---------------------------------------------------------------------------
// API response shape — app.bsky.feed.searchPosts
// ---------------------------------------------------------------------------

interface BskyAuthorRaw {
  handle?: unknown;
  displayName?: unknown;
  did?: unknown;
}

interface BskyPostRecordRaw {
  text?: unknown;
  createdAt?: unknown;
}

interface BskyPostRaw {
  uri?: unknown;
  cid?: unknown;
  author?: BskyAuthorRaw;
  record?: BskyPostRecordRaw;
  likeCount?: unknown;
  repostCount?: unknown;
  replyCount?: unknown;
  quoteCount?: unknown;
  indexedAt?: unknown;
}

/** Dependency-injection hook for unit tests. */
export type FetchLike = typeof fetch;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timeoutSignal(ms: number): { signal: AbortSignal; clear: () => void } {
  type TimeoutFn = (ms: number) => AbortSignal;
  const native = (AbortSignal as unknown as { timeout?: TimeoutFn }).timeout;
  if (typeof native === "function") {
    return { signal: native.call(AbortSignal, ms), clear: () => {} };
  }
  const controller = new AbortController();
  const handle = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, clear: () => clearTimeout(handle) };
}

function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const slice = text.slice(0, max);
  const lastSpace = slice.lastIndexOf(" ");
  return (lastSpace > max - 30 ? slice.slice(0, lastSpace) : slice).trimEnd();
}

function extractPosts(body: unknown): BskyPostRaw[] {
  if (!body || typeof body !== "object") return [];
  const posts = (body as { posts?: unknown }).posts;
  if (!Array.isArray(posts)) return [];
  return posts as BskyPostRaw[];
}

/** Normalise whitespace in a post's record.text so RepoMention.content stays clean. */
function normaliseText(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

/**
 * Live Bluesky adapter. Queries `app.bsky.feed.searchPosts?q=<fullName>` via
 * the public AppView (no auth) and emits one RepoMention per matching post.
 *
 * The constructor takes an optional `fetchImpl` for test injection.
 */
export class BlueskyAdapter implements SocialAdapter {
  public readonly id = "bluesky-public-search";
  // "bluesky" isn't in the SocialPlatform union yet (another agent owns
  // that edit). Cast is transitional and explicit — the wire value is a
  // real string literal that MentionStore + UI key off.
  public readonly platform: SocialPlatform = "bluesky";

  private readonly fetchImpl: FetchLike | null;

  constructor(fetchImpl?: FetchLike) {
    this.fetchImpl = fetchImpl ?? null;
  }

  async fetchMentionsForRepo(
    fullName: string,
    since?: string,
  ): Promise<RepoMention[]> {
    if (!fullName.includes("/")) return [];
    if (sourceHealthTracker.isOpen("bluesky")) {
      return [];
    }
    const repoId = slugToId(fullName);

    const params = new URLSearchParams({
      q: fullName,
      limit: String(SEARCH_LIMIT),
      sort: "latest",
    });
    const url = `${SEARCH_ENDPOINT}?${params.toString()}`;

    const { signal, clear } = timeoutSignal(FETCH_TIMEOUT_MS);
    const doFetch: FetchLike = this.fetchImpl ?? fetch;
    try {
      const res = await doFetch(url, {
        signal,
        headers: {
          Accept: "application/json",
          "User-Agent": USER_AGENT,
        },
      });
      if (!res.ok) {
        console.error(`[social:bluesky] HTTP ${res.status} for ${fullName}`);
        sourceHealthTracker.recordFailure("bluesky", `HTTP ${res.status}`);
        return [];
      }
      const body: unknown = await res.json();
      const posts = extractPosts(body);
      const sinceMs = since ? new Date(since).getTime() : null;
      const now = new Date().toISOString();
      const fullLower = fullName.toLowerCase();
      const ownerLower = fullLower.slice(0, fullLower.indexOf("/"));
      const nameLower = fullLower.slice(fullLower.indexOf("/") + 1);
      const out: RepoMention[] = [];
      for (const post of posts) {
        const mention = this.postToMention(
          post,
          repoId,
          fullLower,
          ownerLower,
          nameLower,
          now,
        );
        if (!mention) continue;
        if (sinceMs !== null) {
          const postedMs = new Date(mention.postedAt).getTime();
          if (!Number.isFinite(postedMs) || postedMs < sinceMs) continue;
        }
        out.push(mention);
      }
      sourceHealthTracker.recordSuccess("bluesky");
      return out;
    } catch (err) {
      console.error(
        `[social:bluesky] fetchMentionsForRepo ${fullName} failed`,
        err,
      );
      sourceHealthTracker.recordFailure("bluesky", err);
      return [];
    } finally {
      clear();
    }
  }

  private postToMention(
    post: BskyPostRaw,
    repoId: string,
    fullLower: string,
    ownerLower: string,
    nameLower: string,
    now: string,
  ): RepoMention | null {
    const uri = str(post.uri);
    const record = post.record;
    if (!uri || !record || typeof record !== "object") return null;
    const text = str(record.text);
    if (!text) return null;

    // Bluesky search is fuzzy. Confirm the post text actually references
    // the target repo so unrelated threads don't bubble up. Accept either
    //   - full "owner/name"
    //   - the unambiguous github.com/owner/name URL
    //   - the bare repo name (if ≥3 chars, to avoid short-token spam)
    // We deliberately DON'T accept owner-only matches — big orgs like
    // "facebook" surface thousands of unrelated posts that happen to use
    // the word.
    void ownerLower;
    const textLower = text.toLowerCase();
    const ghNeedle = `github.com/${fullLower}`;
    const matchesFull = textLower.includes(fullLower);
    const matchesUrl = textLower.includes(ghNeedle);
    const matchesName =
      nameLower.length >= 3 && textLower.includes(nameLower);
    if (!matchesFull && !matchesUrl && !matchesName) {
      return null;
    }

    const handle = str(post.author?.handle);
    if (!handle) return null;

    const createdAt = str(record.createdAt) ?? str(post.indexedAt);
    if (!createdAt) return null;
    const postedMs = new Date(createdAt).getTime();
    if (!Number.isFinite(postedMs) || postedMs <= 0) return null;

    const likes = num(post.likeCount) ?? 0;
    const reposts = num(post.repostCount) ?? 0;
    const replies = num(post.replyCount) ?? 0;
    const quotes = num(post.quoteCount) ?? 0;
    const engagement = likes + reposts * REPOST_WEIGHT + replies + quotes;

    const content = truncate(normaliseText(text), CONTENT_MAX_CHARS);
    const sentiment: Sentiment = inferSentiment(content);

    // Use the AT URI rkey as the mention id — stable + unique per post.
    const rkey = uri.split("/").pop() ?? "";
    const mentionId = `bsky-${handle.toLowerCase()}-${rkey}`;

    return {
      id: mentionId,
      repoId,
      platform: "bluesky",
      author: `@${handle}`,
      authorFollowers: null,
      content,
      url: bskyPostHref(uri, handle),
      sentiment,
      engagement,
      reach: engagement * REACH_MULTIPLIER,
      postedAt: new Date(postedMs).toISOString(),
      discoveredAt: now,
      isInfluencer: engagement >= INFLUENCER_ENGAGEMENT_THRESHOLD,
    };
  }
}
