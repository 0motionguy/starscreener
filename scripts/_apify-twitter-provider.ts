// Apify Twitter provider — runs apidojo/tweet-scraper (or an operator-
// configured actor) and maps the structured result to our TwitterWebPost
// shape so it drops into the same collector pipeline the web + nitter
// providers already feed.
//
// Why: Twitter's 2026 anti-bot returns HTTP 200 + empty body to our
// direct GraphQL calls (missing x-client-transaction-id, likely TLS
// fingerprinting too). Apify runs a managed scraper on residential IPs
// and returns clean JSON — we skip the anti-bot arms race entirely.
//
// Usage:
//   TWITTER_COLLECTOR_PROVIDER=apify
//   APIFY_API_TOKEN=<token>              // required
//   APIFY_TWITTER_ACTOR=apidojo~tweet-scraper   // optional override
//
// Budget: each search call = one actor run = one billable event. Default
// actor "apidojo/tweet-scraper" is pay-per-result. Keep queriesPerRepo
// low (default 1 search per repo via repo_slug) to control cost.

import type { TwitterWebPost } from "./_twitter-web-provider";

const DEFAULT_ACTOR = "apidojo~tweet-scraper";
const API_BASE = "https://api.apify.com/v2";

export interface ApifySearchOptions {
  query: string;
  limit?: number;
  sinceISO?: string;
}

export interface ApifyProviderStats {
  requests: number;
  errors: number;
  lastError: string | null;
}

export class ApifyTwitterProvider {
  private readonly token: string;
  private readonly actor: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly stats: ApifyProviderStats = {
    requests: 0,
    errors: 0,
    lastError: null,
  };

  constructor(opts?: {
    token?: string;
    actor?: string;
    timeoutMs?: number;
    fetchImpl?: typeof fetch;
  }) {
    // GitHub Actions `${{ vars.FOO }}` substitutes an empty string when the
    // var is unset, not undefined — so `??` falls through incorrectly. Treat
    // empty/whitespace as missing for both token and actor.
    const rawToken = opts?.token ?? process.env.APIFY_API_TOKEN ?? "";
    const token = rawToken.trim();
    if (!token) {
      throw new Error(
        "APIFY_API_TOKEN unset — set it as a repo secret to enable the Apify Twitter provider",
      );
    }
    this.token = token;
    const rawActor = opts?.actor ?? process.env.APIFY_TWITTER_ACTOR ?? "";
    const actor = rawActor.trim();
    this.actor = actor || DEFAULT_ACTOR;
    this.timeoutMs = opts?.timeoutMs ?? 120_000;
    this.fetchImpl = opts?.fetchImpl ?? fetch;
  }

  getStats(): ApifyProviderStats {
    return { ...this.stats };
  }

  getActor(): string {
    return this.actor;
  }

  async search(opts: ApifySearchOptions): Promise<TwitterWebPost[]> {
    const limit = Math.min(Math.max(1, opts.limit ?? 25), 100);
    const since = opts.sinceISO ? sinceDateString(opts.sinceISO) : undefined;

    // apidojo/tweet-scraper input — these field names are stable across
    // the actor's public versions. If the operator points at a different
    // actor via APIFY_TWITTER_ACTOR, they're responsible for an input
    // shape compatible with this.
    // Twitter search operator `since:YYYY-MM-DD` narrows to the freshness
    // window. `tweetLanguage` is an ISO-2 enum in apidojo/tweet-scraper — we
    // omit it so the actor returns tweets in any language.
    const searchTerm = since ? `${opts.query} since:${since}` : opts.query;
    const input: Record<string, unknown> = {
      searchTerms: [searchTerm],
      maxItems: limit,
      sort: "Latest",
    };

    const url = `${API_BASE}/acts/${encodeURIComponent(this.actor)}/run-sync-get-dataset-items?token=${encodeURIComponent(this.token)}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    this.stats.requests += 1;
    try {
      const res = await this.fetchImpl(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
        signal: controller.signal,
      });
      if (!res.ok) {
        this.stats.errors += 1;
        const text = await res.text().catch(() => "");
        const msg = `apify actor ${this.actor} HTTP ${res.status}: ${text.slice(0, 200)}`;
        this.stats.lastError = msg;
        throw new Error(msg);
      }
      const body = (await res.json().catch(() => [])) as unknown;
      if (!Array.isArray(body)) return [];
      const out: TwitterWebPost[] = [];
      for (const raw of body) {
        const post = mapApifyTweetToWebPost(raw, opts.query);
        if (post) out.push(post);
      }
      return out;
    } catch (err) {
      this.stats.errors += 1;
      this.stats.lastError = err instanceof Error ? err.message : String(err);
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}

function sinceDateString(iso: string): string | undefined {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return undefined;
  return d.toISOString().slice(0, 10);
}

function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function mapApifyTweetToWebPost(
  raw: unknown,
  matchedQuery: string,
): TwitterWebPost | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  // apidojo/tweet-scraper top-level fields (stable in 2025-2026):
  //   id, url, text, createdAt, likeCount, retweetCount, replyCount,
  //   quoteCount, viewCount, author: { userName, name, id, ... }
  //
  // Some variants use snake_case (retweet_count) or nest under `user`
  // instead of `author`. Read both where possible.
  const id =
    str(r.id) ??
    str(r.tweet_id) ??
    str((r.legacy as Record<string, unknown> | undefined)?.id_str);
  if (!id) return null;

  const text =
    str(r.text) ??
    str(r.full_text) ??
    str((r.legacy as Record<string, unknown> | undefined)?.full_text) ??
    "";

  const urlValue =
    str(r.url) ??
    str(r.tweetUrl) ??
    str(r.twitterUrl);

  const authorObj =
    (r.author as Record<string, unknown> | undefined) ??
    (r.user as Record<string, unknown> | undefined) ??
    {};

  const handle =
    str(authorObj.userName) ??
    str(authorObj.screen_name) ??
    str(authorObj.handle);

  const name = str(authorObj.name) ?? str(authorObj.displayName);

  const createdAtRaw =
    str(r.createdAt) ??
    str(r.created_at) ??
    str((r.legacy as Record<string, unknown> | undefined)?.created_at);
  const createdAt = createdAtRaw ? normalizeIsoDate(createdAtRaw) : null;
  if (!handle || !createdAt) return null;

  const likeCount =
    num(r.likeCount) ?? num(r.favorite_count) ?? num(r.likes) ?? 0;
  const repostCount =
    num(r.retweetCount) ?? num(r.retweet_count) ?? num(r.reposts) ?? 0;
  const replyCount =
    num(r.replyCount) ?? num(r.reply_count) ?? num(r.replies) ?? 0;
  const quoteCount =
    num(r.quoteCount) ?? num(r.quote_count) ?? num(r.quotes) ?? 0;
  const viewCount =
    num(r.viewCount) ?? num(r.views) ?? num(r.impression_count);

  const resolvedUrl =
    urlValue ?? `https://x.com/${handle}/status/${id}`;

  return {
    id,
    url: resolvedUrl,
    authorHandle: handle,
    authorName: name,
    content: text,
    postedAt: createdAt,
    likeCount,
    repostCount,
    replyCount,
    quoteCount,
    viewCount,
    matchedQuery,
  };
}

/**
 * Normalise various Twitter date formats to ISO 8601.
 * Accepts:
 *   - "Wed Oct 10 12:34:56 +0000 2024"  (classic v1.1)
 *   - "2024-10-10T12:34:56.000Z"        (modern / already ISO)
 *   - Date-parseable strings in general
 */
function normalizeIsoDate(raw: string): string | null {
  const d = new Date(raw);
  if (Number.isFinite(d.getTime())) return d.toISOString();
  return null;
}
