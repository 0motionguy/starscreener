// StarScreener — Social signal adapters.
//
// Per-platform mention feeds, live only. HackerNews (Algolia), Reddit (public
// JSON), GitHub issue search. Twitter/X is handled separately via the Nitter
// adapter when a mirror is available.
//
// Contract: every adapter implements SocialAdapter and must NEVER throw from
// fetchMentionsForRepo. On any network, parsing, or validation error we log
// with a `[social:<platform>]` prefix and return an empty array. No mock
// fallback — incomplete data is preferable to fabricated data.

import type { Sentiment, SocialPlatform } from "@/lib/types";
import * as Sentry from "@sentry/nextjs";
import { slugToId } from "@/lib/utils";
import {
  GitHubTokenPoolEmptyError,
  GitHubTokenPoolExhaustedError,
  getGitHubTokenPool,
  parseRateLimitHeaders,
} from "@/lib/github-token-pool";
import {
  RedditPoolExhaustedError,
  RedditRecoverableError,
} from "@/lib/errors";
import {
  githubKeyFingerprint,
  recordGithubCall,
} from "@/lib/pool/github-telemetry";
import { recordRedditCall } from "@/lib/pool/reddit-telemetry";
import {
  redditUserAgentFingerprint,
  selectUserAgent,
} from "@/lib/pool/reddit-ua-pool";
// Phase 2C: per-source circuit breaker. Each adapter checks isOpen()
// at the top of fetch and records success/failure on every response so
// 5 consecutive failures auto-disable the source until the cooldown.
import { sourceHealthTracker } from "@/lib/source-health-tracker";
import type { RepoMention, SocialAdapter } from "../types";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const USER_AGENT = "TrendingRepo/1.0 (+https://trendingrepo.com)";
const FETCH_TIMEOUT_MS = 5000;

/**
 * Construct an AbortSignal that aborts after `ms` milliseconds. Uses the
 * native `AbortSignal.timeout` where available (Node 17.3+/modern browsers)
 * and falls back to a manual AbortController. The returned object exposes
 * both the signal and a cleanup hook (no-op on the native path) so callers
 * can clear the timer once the fetch settles.
 */
function timeoutSignal(ms: number): { signal: AbortSignal; clear: () => void } {
  type TimeoutFn = (ms: number) => AbortSignal;
  const native = (AbortSignal as unknown as { timeout?: TimeoutFn }).timeout;
  if (typeof native === "function") {
    return { signal: native.call(AbortSignal, ms), clear: () => {} };
  }
  const controller = new AbortController();
  const handle = setTimeout(() => controller.abort(), ms);
  return {
    signal: controller.signal,
    clear: () => clearTimeout(handle),
  };
}

const POSITIVE_KEYWORDS = [
  "love",
  "amazing",
  "awesome",
  "great",
  "best",
  "incredible",
  "finally",
  "game changer",
  "blown away",
  "impressive",
  "excellent",
  "fantastic",
];

const NEGATIVE_KEYWORDS = [
  "broken",
  "bad",
  "terrible",
  "worst",
  "hate",
  "disappointing",
  "buggy",
  "crashes",
  "avoid",
  "stay away",
  "deprecated",
  "abandoned",
];

/**
 * Lightweight sentiment inference over a short text fragment. Counts matches
 * of positive and negative keyword lists; returns the category with more
 * hits, or "neutral" on tie / no matches. Case-insensitive, substring match
 * (so "awesome!" and "love this" both count).
 */
export function inferSentiment(text: string): Sentiment {
  if (!text) return "neutral";
  const lower = text.toLowerCase();
  let pos = 0;
  let neg = 0;
  for (const k of POSITIVE_KEYWORDS) if (lower.includes(k)) pos++;
  for (const k of NEGATIVE_KEYWORDS) if (lower.includes(k)) neg++;
  if (pos > neg) return "positive";
  if (neg > pos) return "negative";
  return "neutral";
}

/**
 * Extract the repo-name portion from a fullName. "vercel/next.js" -> "next.js".
 * Returns the input unchanged if it doesn't contain a slash.
 */
function repoNameOf(fullName: string): string {
  const idx = fullName.indexOf("/");
  return idx === -1 ? fullName : fullName.slice(idx + 1);
}

/**
 * Extract the owner portion from a fullName. "vercel/next.js" -> "vercel".
 * Returns the input unchanged if it doesn't contain a slash.
 */
function repoOwnerOf(fullName: string): string {
  const idx = fullName.indexOf("/");
  return idx === -1 ? fullName : fullName.slice(0, idx);
}

/**
 * Safe string accessor for untyped JSON blobs — returns the string value iff
 * the field exists and is a string, else null.
 */
function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

/**
 * Safe number accessor for untyped JSON blobs. Returns the numeric value iff
 * the field is a finite number, else null.
 */
function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * Truncate a text fragment to `max` chars, preserving whole words where
 * possible. Used to keep RepoMention.content from ballooning with full HN
 * story text or Reddit selftext.
 */
function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const slice = text.slice(0, max);
  const lastSpace = slice.lastIndexOf(" ");
  return (lastSpace > max - 30 ? slice.slice(0, lastSpace) : slice).trimEnd();
}

function parseRetryAfterMs(headerValue: string | null): number | null {
  if (!headerValue) return null;
  const seconds = Number.parseFloat(headerValue);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.ceil(seconds * 1000);
  }
  const dateMs = Date.parse(headerValue);
  if (!Number.isFinite(dateMs)) return null;
  return Math.max(0, dateMs - Date.now());
}

// ---------------------------------------------------------------------------
// 1. HackerNewsAdapter — REAL (HN Algolia Search, no auth)
// ---------------------------------------------------------------------------

interface HNHit {
  objectID?: unknown;
  author?: unknown;
  title?: unknown;
  story_text?: unknown;
  url?: unknown;
  points?: unknown;
  num_comments?: unknown;
  created_at?: unknown;
  created_at_i?: unknown;
}

/**
 * Live HackerNews adapter backed by the public Algolia search index
 * (https://hn.algolia.com/api). No auth required, no rate limits for
 * reasonable use. Search is keyed on the repo's fullName so results capture
 * "Show HN: vercel/next.js 15" style posts and story comments.
 */
export class HackerNewsAdapter implements SocialAdapter {
  public readonly id = "hackernews-algolia";
  public readonly platform: SocialPlatform = "hackernews";

  async fetchMentionsForRepo(
    fullName: string,
    since?: string,
  ): Promise<RepoMention[]> {
    if (sourceHealthTracker.isOpen("hackernews")) {
      return [];
    }
    const repoId = slugToId(fullName);
    const query = encodeURIComponent(fullName);
    const params = new URLSearchParams({ query: fullName, tags: "story" });
    if (since) {
      const sec = Math.floor(new Date(since).getTime() / 1000);
      if (Number.isFinite(sec) && sec > 0) {
        params.set("numericFilters", `created_at_i>${sec}`);
      }
    }
    // URLSearchParams re-encodes the query; override with a cleaner version
    // to keep the URL readable in logs.
    params.set("query", decodeURIComponent(query));

    const url = `https://hn.algolia.com/api/v1/search?${params.toString()}`;
    const { signal, clear } = timeoutSignal(FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        signal,
        headers: {
          Accept: "application/json",
          "User-Agent": USER_AGENT,
        },
      });
      if (!res.ok) {
        console.error(
          `[social:hackernews] HTTP ${res.status} for ${fullName}`,
        );
        sourceHealthTracker.recordFailure("hackernews", `HTTP ${res.status}`);
        return [];
      }
      const body: unknown = await res.json();
      const hits = this.extractHits(body);
      const out: RepoMention[] = [];
      const now = new Date().toISOString();
      for (const hit of hits) {
        const mention = this.hitToMention(hit, repoId, now);
        if (mention) out.push(mention);
      }
      sourceHealthTracker.recordSuccess("hackernews");
      return out;
    } catch (err) {
      console.error(
        `[social:hackernews] fetchMentionsForRepo ${fullName} failed`,
        err,
      );
      sourceHealthTracker.recordFailure(
        "hackernews",
        err instanceof Error ? err.message : String(err),
      );
      return [];
    } finally {
      clear();
    }
  }

  private extractHits(body: unknown): HNHit[] {
    if (!body || typeof body !== "object") return [];
    const hits = (body as { hits?: unknown }).hits;
    if (!Array.isArray(hits)) return [];
    return hits as HNHit[];
  }

  private hitToMention(
    hit: HNHit,
    repoId: string,
    now: string,
  ): RepoMention | null {
    const objectID = str(hit.objectID);
    const title = str(hit.title);
    if (!objectID || !title) return null;
    const author = str(hit.author) ?? "anonymous";
    const points = num(hit.points) ?? 0;
    const numComments = num(hit.num_comments) ?? 0;
    const storyText = str(hit.story_text);
    const content = storyText
      ? `${title} — ${truncate(storyText.replace(/\s+/g, " ").trim(), 200)}`
      : title;

    // Prefer created_at_i (epoch seconds) when available — cheaper and exact.
    const createdI = num(hit.created_at_i);
    let postedAt: string | null = null;
    if (createdI !== null) {
      const ms = createdI * 1000;
      if (Number.isFinite(ms) && ms > 0) postedAt = new Date(ms).toISOString();
    }
    if (!postedAt) {
      const createdAt = str(hit.created_at);
      if (createdAt) {
        const ms = new Date(createdAt).getTime();
        if (Number.isFinite(ms) && ms > 0) postedAt = new Date(ms).toISOString();
      }
    }
    if (!postedAt) return null;

    return {
      id: `hn-${objectID}`,
      repoId,
      platform: "hackernews",
      author,
      authorFollowers: null,
      content,
      url: `https://news.ycombinator.com/item?id=${objectID}`,
      sentiment: inferSentiment(content),
      engagement: points + numComments,
      // HN front page sees hundreds of thousands of impressions; 150x points
      // is a rough but defensible estimator.
      reach: points * 150,
      postedAt,
      discoveredAt: now,
      isInfluencer: points > 100,
    };
  }
}

// ---------------------------------------------------------------------------
// 2. RedditAdapter — REAL (public JSON endpoints, no auth)
// ---------------------------------------------------------------------------

interface RedditPost {
  id?: unknown;
  author?: unknown;
  title?: unknown;
  selftext?: unknown;
  permalink?: unknown;
  ups?: unknown;
  num_comments?: unknown;
  created_utc?: unknown;
  subreddit?: unknown;
}

interface RedditChild {
  data?: RedditPost;
}

/**
 * Live Reddit adapter using the public unauthenticated `search.json`
 * endpoint. Reddit rejects requests with the default fetch User-Agent
 * (typically `node-fetch`/`undici`) with a 429 or 403 — we must send a
 * descriptive UA per their rules.
 */
export class RedditAdapter implements SocialAdapter {
  public readonly id = "reddit-public-json";
  public readonly platform: SocialPlatform = "reddit";

  async fetchMentionsForRepo(
    fullName: string,
    since?: string,
  ): Promise<RepoMention[]> {
    if (sourceHealthTracker.isOpen("reddit")) {
      return [];
    }
    const repoId = slugToId(fullName);
    const repoName = repoNameOf(fullName);
    const owner = repoOwnerOf(fullName);
    const q = encodeURIComponent(`${fullName} OR ${repoName}`);
    const url =
      `https://www.reddit.com/search.json?q=${q}` +
      `&sort=relevance&t=week&limit=25`;

    let userAgent: string;
    try {
      userAgent = await selectUserAgent();
    } catch (err) {
      const wrapped =
        err instanceof RedditPoolExhaustedError
          ? err
          : new RedditPoolExhaustedError("All Reddit User-Agents quarantined", {
              originalError: err instanceof Error ? err.message : String(err),
            });
      Sentry.captureException(wrapped, {
        tags: { pool: "reddit", alert: "reddit-ua-pool-exhausted" },
      });
      sourceHealthTracker.recordFailure("reddit", wrapped.message);
      return [];
    }
    const userAgentFingerprint = redditUserAgentFingerprint(userAgent);
    const startedAt = Date.now();
    const { signal, clear } = timeoutSignal(FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        signal,
        headers: {
          Accept: "application/json",
          // Reddit blocks default UAs — this one is required.
          "User-Agent": userAgent,
        },
      });
      await recordRedditCall({
        userAgentFingerprint,
        statusCode: res.status,
        responseTimeMs: Date.now() - startedAt,
        operation: "reddit_search_mentions",
        success: res.ok,
      });
      if (!res.ok) {
        console.error(`[social:reddit] HTTP ${res.status} for ${fullName}`);
        sourceHealthTracker.recordFailure("reddit", `HTTP ${res.status}`);
        return [];
      }
      const body: unknown = await res.json();
      const children = this.extractChildren(body);
      const sinceMs = since ? new Date(since).getTime() : null;
      const out: RepoMention[] = [];
      const now = new Date().toISOString();
      const needle = fullName.toLowerCase();
      const repoNeedle = repoName.toLowerCase();
      const ownerNeedle = owner.toLowerCase();
      for (const child of children) {
        const mention = this.childToMention(child, repoId, now);
        if (!mention) continue;
        if (sinceMs !== null) {
          const postedMs = new Date(mention.postedAt).getTime();
          if (!Number.isFinite(postedMs) || postedMs < sinceMs) continue;
        }
        // Defence against false positives: title OR selftext must
        // actually mention the repo somehow. Reddit search is fuzzy and
        // unrelated threads often bubble up.
        const hay = mention.content.toLowerCase();
        const mentionsRepo =
          hay.includes(needle) ||
          hay.includes(repoNeedle) ||
          // Require at least a two-character repo name to match on the
          // name alone — avoids spurious single-letter matches.
          (repoNeedle.length >= 3 && hay.includes(repoNeedle)) ||
          (ownerNeedle.length >= 4 && hay.includes(ownerNeedle));
        if (!mentionsRepo) continue;
        out.push(mention);
      }
      sourceHealthTracker.recordSuccess("reddit");
      return out;
    } catch (err) {
      await recordRedditCall({
        userAgentFingerprint,
        statusCode: 0,
        responseTimeMs: Date.now() - startedAt,
        operation: "reddit_search_mentions",
        success: false,
      });
      Sentry.captureException(
        new RedditRecoverableError("Reddit network failure", {
          userAgentFingerprint,
          message: err instanceof Error ? err.message : String(err),
        }),
        { tags: { pool: "reddit", alert: "reddit-ua-network" } },
      );
      console.error(
        `[social:reddit] fetchMentionsForRepo ${fullName} failed`,
        err,
      );
      sourceHealthTracker.recordFailure(
        "reddit",
        err instanceof Error ? err.message : String(err),
      );
      return [];
    } finally {
      clear();
    }
  }

  private extractChildren(body: unknown): RedditChild[] {
    if (!body || typeof body !== "object") return [];
    const data = (body as { data?: unknown }).data;
    if (!data || typeof data !== "object") return [];
    const children = (data as { children?: unknown }).children;
    if (!Array.isArray(children)) return [];
    return children as RedditChild[];
  }

  private childToMention(
    child: RedditChild,
    repoId: string,
    now: string,
  ): RepoMention | null {
    const data = child.data;
    if (!data || typeof data !== "object") return null;
    const id = str(data.id);
    const title = str(data.title);
    const permalink = str(data.permalink);
    const createdUtc = num(data.created_utc);
    if (!id || !title || !permalink || createdUtc === null) return null;

    const author = str(data.author) ?? "deleted";
    const ups = num(data.ups) ?? 0;
    const comments = num(data.num_comments) ?? 0;
    const selftext = str(data.selftext);
    const content = selftext
      ? `${title} — ${truncate(selftext.replace(/\s+/g, " ").trim(), 200)}`
      : title;

    const postedMs = createdUtc * 1000;
    if (!Number.isFinite(postedMs) || postedMs <= 0) return null;

    return {
      id: `reddit-${id}`,
      repoId,
      platform: "reddit",
      author,
      authorFollowers: null,
      content,
      url: `https://reddit.com${permalink}`,
      sentiment: inferSentiment(content),
      engagement: ups + comments,
      reach: ups * 50,
      postedAt: new Date(postedMs).toISOString(),
      discoveredAt: now,
      isInfluencer: ups > 500,
    };
  }
}

// ---------------------------------------------------------------------------
// 3. Twitter/X — handled via separate Nitter adapter (see nitter-adapter.ts).
//    No mock class here. If no Nitter mirror is reachable, the UI hides the
//    Twitter section entirely.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 4. GitHubActivityAdapter — REAL (GitHub search API)
// ---------------------------------------------------------------------------

interface GHIssueUser {
  login?: unknown;
}

interface GHIssueReactions {
  total_count?: unknown;
}

interface GHIssueItem {
  id?: unknown;
  user?: GHIssueUser;
  title?: unknown;
  html_url?: unknown;
  comments?: unknown;
  reactions?: GHIssueReactions;
  created_at?: unknown;
}

let ghRateLimitLogged = false;

/**
 * Discovery signal: issues/PRs in OTHER repos that reference this repo by
 * full_name. A surge of cross-repo issue mentions often precedes momentum.
 *
 * Uses the GitHub search API (unauthenticated: 10 req/min; authenticated:
 * 30 req/min). Passing GITHUB_TOKEN via env unlocks the higher quota and
 * private-issue visibility if the token has access.
 */
export class GitHubActivityAdapter implements SocialAdapter {
  public readonly id = "github-search";
  public readonly platform: SocialPlatform = "github";

  async fetchMentionsForRepo(
    fullName: string,
    since?: string,
  ): Promise<RepoMention[]> {
    if (sourceHealthTracker.isOpen("github-search")) {
      return [];
    }
    const repoId = slugToId(fullName);
    const q = encodeURIComponent(`${fullName} in:body is:issue`);
    const url =
      `https://api.github.com/search/issues?q=${q}` +
      `&per_page=10&sort=updated`;

    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": USER_AGENT,
    };

    // Pull a token from the shared pool. An empty pool degrades to the
    // unauthenticated 10 req/min cap (preserves dev-machine behaviour);
    // an exhausted pool returns [] because there's no point making the
    // call until reset.
    let token: string | null = null;
    const pool = getGitHubTokenPool();
    try {
      token = pool.getNextToken();
    } catch (err) {
      if (err instanceof GitHubTokenPoolEmptyError) {
        token = null;
      } else if (err instanceof GitHubTokenPoolExhaustedError) {
        if (!ghRateLimitLogged) {
          console.error(
            `[social:github] all PATs exhausted; skipping ${fullName}. ${err.message}`,
          );
          ghRateLimitLogged = true;
        }
        return [];
      } else {
        throw err;
      }
    }
    if (token) headers.Authorization = `Bearer ${token}`;

    const { signal, clear } = timeoutSignal(FETCH_TIMEOUT_MS);
    const startedAt = Date.now();
    const operation = "github_activity_mentions";
    try {
      const res = await fetch(url, { signal, headers });
      // Update pool quota from headers REGARDLESS of status — GitHub still
      // returns x-ratelimit-* on 403s, and not recording exhaustion would
      // leave the pool picking the dead token again.
      if (token) {
        const rl = parseRateLimitHeaders(res.headers);
        if (rl) pool.recordRateLimit(token, rl.remaining, rl.resetUnixSec);
      }
      if (!res.ok) {
        // Rate limit exhaustion is the common unauthenticated failure.
        if (res.status === 403 || res.status === 429) {
          if (!ghRateLimitLogged) {
            console.error(
              `[social:github] rate limit hit (${res.status}); ` +
                `add more PATs to GITHUB_TOKEN_POOL to raise the cap`,
            );
            ghRateLimitLogged = true;
          }
        } else {
          console.error(
            `[social:github] HTTP ${res.status} for ${fullName}`,
          );
        }
        sourceHealthTracker.recordFailure(
          "github-search",
          `HTTP ${res.status}`,
        );
        return [];
      }
      const body: unknown = await res.json();
      const items = this.extractItems(body);
      const sinceMs = since ? new Date(since).getTime() : null;
      const out: RepoMention[] = [];
      const now = new Date().toISOString();
      for (const item of items) {
        const mention = this.itemToMention(item, repoId, now);
        if (!mention) continue;
        if (sinceMs !== null) {
          const postedMs = new Date(mention.postedAt).getTime();
          if (!Number.isFinite(postedMs) || postedMs < sinceMs) continue;
        }
        out.push(mention);
      }
      sourceHealthTracker.recordSuccess("github-search");
      return out;
    } catch (err) {
      await recordGithubCall({
        keyFingerprint: githubKeyFingerprint(token),
        statusCode: 0,
        rateLimitRemaining: null,
        rateLimitReset: null,
        responseTimeMs: Date.now() - startedAt,
        operation,
        success: false,
      });
      console.error(
        `[social:github] fetchMentionsForRepo ${fullName} failed`,
        err,
      );
      sourceHealthTracker.recordFailure(
        "github-search",
        err instanceof Error ? err.message : String(err),
      );
      return [];
    } finally {
      clear();
    }
  }

  private extractItems(body: unknown): GHIssueItem[] {
    if (!body || typeof body !== "object") return [];
    const items = (body as { items?: unknown }).items;
    if (!Array.isArray(items)) return [];
    return items as GHIssueItem[];
  }

  private itemToMention(
    item: GHIssueItem,
    repoId: string,
    now: string,
  ): RepoMention | null {
    const rawId = num(item.id);
    const title = str(item.title);
    const htmlUrl = str(item.html_url);
    const createdAt = str(item.created_at);
    if (rawId === null || !title || !htmlUrl || !createdAt) return null;
    const postedMs = new Date(createdAt).getTime();
    if (!Number.isFinite(postedMs) || postedMs <= 0) return null;

    const author = str(item.user?.login) ?? "ghost";
    const comments = num(item.comments) ?? 0;
    const reactions = num(item.reactions?.total_count) ?? 0;

    return {
      id: `gh-issue-${rawId}`,
      repoId,
      platform: "github",
      author,
      authorFollowers: null,
      content: title,
      url: htmlUrl,
      sentiment: inferSentiment(title),
      engagement: comments + reactions,
      reach: comments * 20,
      postedAt: new Date(postedMs).toISOString(),
      discoveredAt: now,
      isInfluencer: false,
    };
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Default adapter set. All live — no mock fallbacks. Twitter is registered
 * separately by the Nitter adapter in nitter-adapter.ts when a mirror is
 * reachable; otherwise the Twitter section is hidden in UI.
 */
export function getDefaultSocialAdapters(): SocialAdapter[] {
  return [
    new HackerNewsAdapter(),
    new RedditAdapter(),
    new GitHubActivityAdapter(),
  ];
}
