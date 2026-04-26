// StarScreener — Dev.to live social adapter.
//
// Companion to HackerNewsAdapter / RedditAdapter in social-adapters.ts. The
// static JSON at data/devto-mentions.json is refreshed hourly by
// scripts/scrape-devto.mjs but never hits MentionStore. This adapter lets the
// ingest pipeline pull live Dev.to article references for a specific repo so
// dedup / URL normalisation / .data/mentions.jsonl all work uniformly.
//
// Endpoint: https://dev.to/api/articles (public, no auth required; optional
// DEVTO_API_KEY raises the rate-limit ceiling). Dev.to's search API
// (`/api/search/feed_content`) is flaky and frequently 500s on unauthenticated
// callers, so we mirror the scraper's strategy: pull the freshest popular
// slice and client-side filter by URL/title/description/tag referencing
// `owner/name`.
//
// Contract: never throws. Logs `[social:devto] …` on error and returns [].

import type { Sentiment, SocialPlatform } from "@/lib/types";
import { slugToId } from "@/lib/utils";
import { sourceHealthTracker } from "@/lib/source-health-tracker";
import type { RepoMention, SocialAdapter } from "../types";
import { inferSentiment } from "./social-adapters";

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------

const USER_AGENT = "TrendingRepo/1.0 (+https://trendingrepo.com)";
const FETCH_TIMEOUT_MS = 5000;

/** Cap results per fetch — 100 is the Dev.to per_page max. */
const PER_PAGE = 100;

/** Engagement → estimated reach multiplier. Dev.to isn't broadcast-heavy. */
const REACH_MULTIPLIER = 10;

/** Threshold at which we mark an author as influencer for the badge UI. */
const INFLUENCER_REACTION_THRESHOLD = 100;

/** Mention-content truncation cap (keep store payload tight). */
const CONTENT_MAX_CHARS = 220;

// ---------------------------------------------------------------------------
// API response shape — Dev.to /api/articles
// ---------------------------------------------------------------------------

interface DevtoApiUser {
  username?: unknown;
  name?: unknown;
}

interface DevtoApiArticle {
  id?: unknown;
  title?: unknown;
  description?: unknown;
  body_markdown?: unknown;
  url?: unknown;
  canonical_url?: unknown;
  tag_list?: unknown;
  tags?: unknown;
  published_at?: unknown;
  public_reactions_count?: unknown;
  positive_reactions_count?: unknown;
  comments_count?: unknown;
  user?: DevtoApiUser;
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

function repoOwnerOf(fullName: string): string {
  const idx = fullName.indexOf("/");
  return idx === -1 ? fullName : fullName.slice(0, idx);
}

function repoNameOf(fullName: string): string {
  const idx = fullName.indexOf("/");
  return idx === -1 ? fullName : fullName.slice(idx + 1);
}

function extractArticles(body: unknown): DevtoApiArticle[] {
  if (!Array.isArray(body)) return [];
  return body as DevtoApiArticle[];
}

function extractTagList(article: DevtoApiArticle): string[] {
  const list = article.tag_list;
  if (Array.isArray(list)) {
    return list.filter((t): t is string => typeof t === "string");
  }
  if (typeof list === "string") {
    return list.split(/[,\s]+/).filter((t) => t.length > 0);
  }
  const tags = article.tags;
  if (Array.isArray(tags)) {
    return tags.filter((t): t is string => typeof t === "string");
  }
  return [];
}

/**
 * Decide whether an article actually references the target repo. A direct
 * github.com/<owner>/<name> hit is high confidence; a title/description/tag
 * substring match is lower confidence but still a signal.
 *
 * Returns the confidence tier and the first source that matched, or null
 * if nothing matched.
 */
interface MatchResult {
  confidence: "high" | "low";
  source: "url" | "title" | "description" | "tag";
}

function matchArticleToRepo(
  article: DevtoApiArticle,
  owner: string,
  name: string,
): MatchResult | null {
  const fullLower = `${owner}/${name}`.toLowerCase();
  const nameLower = name.toLowerCase();

  const url = str(article.url);
  const canonical = str(article.canonical_url);
  const ghNeedle = `github.com/${fullLower}`;
  for (const candidate of [url, canonical]) {
    if (!candidate) continue;
    if (candidate.toLowerCase().includes(ghNeedle)) {
      return { confidence: "high", source: "url" };
    }
  }

  const title = str(article.title);
  if (title && title.toLowerCase().includes(fullLower)) {
    return { confidence: "low", source: "title" };
  }

  const description = str(article.description);
  if (description && description.toLowerCase().includes(fullLower)) {
    return { confidence: "low", source: "description" };
  }

  // Tag match is weak on its own — repo name must be ≥3 chars to avoid
  // spurious matches like `tag: "ai"` claiming ownership of every ai-named
  // repo.
  if (nameLower.length >= 3) {
    const tags = extractTagList(article);
    for (const tag of tags) {
      if (tag.toLowerCase() === nameLower) {
        return { confidence: "low", source: "tag" };
      }
    }
  }

  // Body markdown occasionally comes down with the list payload, but isn't
  // guaranteed. When present and we haven't matched yet, try it last.
  const body = str(article.body_markdown);
  if (body && body.toLowerCase().includes(ghNeedle)) {
    return { confidence: "high", source: "url" };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

/**
 * Live Dev.to adapter. Pulls the top `per_page` articles, filters to those
 * that reference `owner/name`, and emits one RepoMention per article.
 *
 * The constructor takes an optional `fetchImpl` for test injection — when
 * omitted, the global `fetch` is used at call time (not captured at
 * construction time, so test harnesses that monkey-patch global fetch still
 * see the patched version).
 */
export class DevtoAdapter implements SocialAdapter {
  public readonly id = "devto-articles";
  public readonly platform: SocialPlatform = "devto";

  private readonly fetchImpl: FetchLike | null;

  constructor(fetchImpl?: FetchLike) {
    this.fetchImpl = fetchImpl ?? null;
  }

  async fetchMentionsForRepo(
    fullName: string,
    since?: string,
  ): Promise<RepoMention[]> {
    const repoId = slugToId(fullName);
    const owner = repoOwnerOf(fullName);
    const name = repoNameOf(fullName);
    if (!owner || !name) return [];
    if (sourceHealthTracker.isOpen("devto")) {
      return [];
    }

    // top=7 biases toward high-engagement articles from the last week, which
    // matches the mention-store freshness window. per_page=100 gives us a
    // decent funnel before client-side filtering.
    const url =
      `https://dev.to/api/articles?per_page=${PER_PAGE}` +
      `&page=1&top=7`;

    const headers: Record<string, string> = {
      Accept: "application/json",
      "User-Agent": USER_AGENT,
    };
    const apiKey = process.env.DEVTO_API_KEY;
    if (apiKey) headers["api-key"] = apiKey;

    const { signal, clear } = timeoutSignal(FETCH_TIMEOUT_MS);
    const doFetch: FetchLike = this.fetchImpl ?? fetch;
    try {
      const res = await doFetch(url, { signal, headers });
      if (!res.ok) {
        console.error(`[social:devto] HTTP ${res.status} for ${fullName}`);
        sourceHealthTracker.recordFailure("devto", `HTTP ${res.status}`);
        return [];
      }
      const body: unknown = await res.json();
      const articles = extractArticles(body);
      const sinceMs = since ? new Date(since).getTime() : null;
      const now = new Date().toISOString();
      const out: RepoMention[] = [];
      for (const article of articles) {
        const mention = this.articleToMention(article, owner, name, repoId, now);
        if (!mention) continue;
        if (sinceMs !== null) {
          const postedMs = new Date(mention.postedAt).getTime();
          if (!Number.isFinite(postedMs) || postedMs < sinceMs) continue;
        }
        out.push(mention);
      }
      sourceHealthTracker.recordSuccess("devto");
      return out;
    } catch (err) {
      console.error(
        `[social:devto] fetchMentionsForRepo ${fullName} failed`,
        err,
      );
      sourceHealthTracker.recordFailure("devto", err);
      return [];
    } finally {
      clear();
    }
  }

  private articleToMention(
    article: DevtoApiArticle,
    owner: string,
    name: string,
    repoId: string,
    now: string,
  ): RepoMention | null {
    const rawId = num(article.id);
    const title = str(article.title);
    const url = str(article.url);
    const publishedAt = str(article.published_at);
    if (rawId === null || !title || !url || !publishedAt) return null;

    const match = matchArticleToRepo(article, owner, name);
    if (!match) return null;

    const postedMs = new Date(publishedAt).getTime();
    if (!Number.isFinite(postedMs) || postedMs <= 0) return null;

    const username = str(article.user?.username) ?? "anonymous";
    const displayAuthor = `@${username}`;

    // Dev.to exposes both public_reactions_count and
    // positive_reactions_count; the latter excludes negative emojis but is
    // occasionally missing. Prefer public, fall back to positive.
    const reactions =
      num(article.public_reactions_count) ??
      num(article.positive_reactions_count) ??
      0;
    const comments = num(article.comments_count) ?? 0;
    const engagement = reactions + comments;

    const description = str(article.description);
    const rawContent = description
      ? `${title} — ${description.replace(/\s+/g, " ").trim()}`
      : title;
    const content = truncate(rawContent, CONTENT_MAX_CHARS);

    const sentiment: Sentiment = inferSentiment(content);

    return {
      id: `devto-${rawId}`,
      repoId,
      platform: "devto",
      author: displayAuthor,
      authorFollowers: null,
      content,
      url,
      sentiment,
      engagement,
      reach: engagement * REACH_MULTIPLIER,
      postedAt: new Date(postedMs).toISOString(),
      discoveredAt: now,
      isInfluencer: reactions >= INFLUENCER_REACTION_THRESHOLD,
    };
  }
}
