/**
 * Twitter web-session cookie provider.
 *
 * @deprecated SCR-13 — replaced by `ApifyTwitterProvider` since the 2026
 * anti-bot wave killed cookie-based access. CLAUDE.md explicitly lists
 * cookie-based scrapers as dead. The collector defaults to `apify` since
 * c8c2ae5; this file is kept only for offline replay against archived
 * fixtures and will be deleted after one stable Apify-only cycle (target
 * removal: 2026-Q3 if no operator surfaces a regression).
 *
 * If you're reading this because of a fresh failure: switch the collector
 * to `--provider apify` (already the default) and ensure
 * APIFY_API_TOKEN is set. Do NOT attempt to revive cookie-based access.
 *
 * Hits Twitter's internal GraphQL SearchTimeline endpoint using rotated
 * web-session cookies (auth_token + ct0). Uses the public web-client bearer
 * token. No OAuth, no scraping, no browser automation.
 *
 * Returns `TwitterWebPost[]` (neutral shape the collector can map to its
 * internal Nitter-style format).
 *
 * Never logs token values. Account identifiers are always `account #N`.
 */

export interface TwitterWebAccount {
  authToken: string;
  ct0: string;
}

export interface TwitterWebProviderConfig {
  accounts: TwitterWebAccount[];
  /** Per-request timeout. Default 12_000 ms. */
  timeoutMs?: number;
  /** GraphQL queryId for SearchTimeline. Env `TWITTER_GRAPHQL_SEARCH_QUERY_ID` or fallback. */
  queryId?: string;
  /**
   * Injectable fetch for tests. Defaults to global `fetch`.
   * Signature matches WHATWG fetch.
   */
  fetchImpl?: typeof fetch;
  /**
   * Clock injection for tests. Defaults to `Date.now`.
   */
  now?: () => number;
  /**
   * Logger injection. Defaults to console.
   */
  logger?: {
    info: (msg: string) => void;
    warn: (msg: string) => void;
    error: (msg: string) => void;
  };
}

export interface TwitterWebPost {
  /** Tweet id (string; snowflake) */
  id: string;
  url: string;
  authorHandle: string;
  authorName: string | null;
  content: string;
  postedAt: string;
  likeCount: number;
  repostCount: number;
  replyCount: number;
  quoteCount: number;
  viewCount: number | null;
  matchedQuery: string;
  /**
   * Resolved URLs from `entities.urls[].expanded_url` when the upstream
   * provider exposes them (Apify's apidojo/tweet-scraper does). Tweet text
   * shows the t.co shortened form; without these, github.com URLs hidden
   * behind t.co are invisible to mention extractors.
   */
  expandedUrls?: string[];
}

export interface SearchOptions {
  query: string;
  sinceISO?: string;
  limit?: number;
}

export interface TwitterWebProviderStats {
  requests: number;
  errors: number;
  accountsHealthy: number;
  accountsRateLimited: number;
}

const PUBLIC_WEB_BEARER =
  "Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";

const DEFAULT_QUERY_ID = "AIdc203rPpK_k_2KWSdJrw";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const GRAPHQL_FEATURES: Record<string, boolean> = {
  rweb_video_screen_enabled: false,
  payments_enabled: false,
  profile_label_improvements_pcf_label_in_post_enabled: true,
  rweb_tipjar_consumption_enabled: true,
  verified_phone_label_enabled: false,
  creator_subscriptions_tweet_preview_api_enabled: true,
  responsive_web_graphql_timeline_navigation_enabled: true,
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
  premium_content_api_read_enabled: false,
  communities_web_enable_tweet_community_results_fetch: true,
  c9s_tweet_anatomy_moderator_badge_enabled: true,
  responsive_web_grok_analyze_button_fetch_trends_enabled: false,
  responsive_web_grok_analyze_post_followups_enabled: true,
  responsive_web_jetfuel_frame: true,
  responsive_web_grok_share_attachment_enabled: true,
  articles_preview_enabled: true,
  responsive_web_edit_tweet_api_enabled: true,
  graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
  view_counts_everywhere_api_enabled: true,
  longform_notetweets_consumption_enabled: true,
  responsive_web_twitter_article_tweet_consumption_enabled: true,
  tweet_awards_web_tipping_enabled: false,
  responsive_web_grok_show_grok_translated_post: false,
  responsive_web_grok_analysis_button_from_backend: true,
  creator_subscriptions_quote_tweet_preview_enabled: false,
  freedom_of_speech_not_reach_fetch_enabled: true,
  standardized_nudges_misinfo: true,
  tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
  longform_notetweets_rich_text_read_enabled: true,
  longform_notetweets_inline_media_enabled: true,
  responsive_web_grok_image_annotation_enabled: true,
  responsive_web_grok_community_note_auto_translation_is_enabled: false,
  responsive_web_enhance_cards_enabled: false,
};

interface AccountState {
  account: TwitterWebAccount;
  /** epoch ms. 0 = not rate-limited. */
  rateLimitedUntil: number;
  /** Monotonic failure counter. 999 = dead (token invalid). */
  consecutiveFailures: number;
  /** Debug id surfaced in logs. */
  id: number;
}

export function loadAccountsFromEnv(
  envVar: string = "TWITTER_WEB_ACCOUNTS_JSON",
  env: Record<string, string | undefined> = process.env,
): TwitterWebAccount[] {
  const raw = env[envVar];
  if (!raw || raw.trim() === "") {
    throw new Error(
      `${envVar} is unset. Set it to a JSON array of { authToken, ct0 } objects.`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${envVar} is not valid JSON: ${message}`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error(`${envVar} must be a JSON array, got ${typeof parsed}`);
  }
  if (parsed.length === 0) {
    throw new Error(`${envVar} is an empty array; need at least one account.`);
  }

  const accounts: TwitterWebAccount[] = [];
  parsed.forEach((entry, index) => {
    if (!entry || typeof entry !== "object") {
      throw new Error(
        `${envVar}[${index}] must be an object with { authToken, ct0 }, got ${typeof entry}`,
      );
    }
    const obj = entry as Record<string, unknown>;
    const authToken = obj.authToken;
    const ct0 = obj.ct0;
    if (typeof authToken !== "string" || authToken.trim() === "") {
      throw new Error(`${envVar}[${index}].authToken must be a non-empty string`);
    }
    if (typeof ct0 !== "string" || ct0.trim() === "") {
      throw new Error(`${envVar}[${index}].ct0 must be a non-empty string`);
    }
    accounts.push({ authToken: authToken.trim(), ct0: ct0.trim() });
  });

  return accounts;
}

export interface SearchTimelineTweetEntry {
  tweet: TwitterWebPost;
}

/**
 * Parse a GraphQL SearchTimeline response body into neutral posts.
 * Pure: no HTTP, no state. Safe to hit with fixtures.
 */
export function parseSearchTimelineResponse(
  body: unknown,
  matchedQuery: string = "",
): TwitterWebPost[] {
  const instructions = readPath<unknown[]>(body, [
    "data",
    "search_by_raw_query",
    "search_timeline",
    "timeline",
    "instructions",
  ]);
  if (!Array.isArray(instructions)) return [];

  const out: TwitterWebPost[] = [];
  for (const instruction of instructions) {
    const entries = readPath<unknown[]>(instruction, ["entries"]);
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      const post = parseEntry(entry, matchedQuery);
      if (post) out.push(post);
    }
  }
  return out;
}

function parseEntry(entry: unknown, matchedQuery: string): TwitterWebPost | null {
  if (!entry || typeof entry !== "object") return null;
  const content = readPath<unknown>(entry, ["content"]);
  if (!content || typeof content !== "object") return null;

  const entryType = readString(content, ["entryType"]) ?? readString(content, ["__typename"]);
  if (entryType !== "TimelineTimelineItem") return null;

  const itemContent = readPath<unknown>(content, ["itemContent"]);
  if (!itemContent || typeof itemContent !== "object") return null;

  const tweetDisplayType = readString(itemContent, ["tweetDisplayType"]);
  if (tweetDisplayType !== "Tweet") return null;

  const tweetResult = readPath<unknown>(itemContent, ["tweet_results", "result"]);
  if (!tweetResult || typeof tweetResult !== "object") return null;

  // Twitter sometimes wraps the real tweet in `{ __typename: "TweetWithVisibilityResults", tweet: {...} }`
  const innerTweet = readPath<unknown>(tweetResult, ["tweet"]);
  const tweet = innerTweet && typeof innerTweet === "object" ? innerTweet : tweetResult;

  const restId = readString(tweet, ["rest_id"]);
  if (!restId) return null;

  const legacy = readPath<unknown>(tweet, ["legacy"]);
  if (!legacy || typeof legacy !== "object") return null;

  const fullText = readString(legacy, ["full_text"]) ?? readString(legacy, ["text"]) ?? "";
  const createdAt = readString(legacy, ["created_at"]);
  const postedAtIso = createdAt ? twitterDateToIso(createdAt) : new Date().toISOString();

  const likeCount = readNumber(legacy, ["favorite_count"]) ?? 0;
  const repostCount = readNumber(legacy, ["retweet_count"]) ?? 0;
  const replyCount = readNumber(legacy, ["reply_count"]) ?? 0;
  const quoteCount = readNumber(legacy, ["quote_count"]) ?? 0;

  const viewCountRaw = readString(tweet, ["views", "count"]);
  const viewCount = viewCountRaw != null ? Number.parseInt(viewCountRaw, 10) : null;

  const userLegacy = readPath<unknown>(tweet, ["core", "user_results", "result", "legacy"]);
  let authorHandle = "";
  let authorName: string | null = null;
  if (userLegacy && typeof userLegacy === "object") {
    authorHandle = readString(userLegacy, ["screen_name"]) ?? "";
    authorName = readString(userLegacy, ["name"]) ?? null;
  }
  // Fallback to core.user_results.result.core (newer response shape)
  if (!authorHandle) {
    const userCore = readPath<unknown>(tweet, ["core", "user_results", "result", "core"]);
    if (userCore && typeof userCore === "object") {
      authorHandle = readString(userCore, ["screen_name"]) ?? "";
      authorName = authorName ?? readString(userCore, ["name"]) ?? null;
    }
  }

  if (!authorHandle) return null;

  return {
    id: restId,
    url: `https://x.com/${authorHandle}/status/${restId}`,
    authorHandle,
    authorName,
    content: fullText,
    postedAt: postedAtIso,
    likeCount: Math.max(0, Math.floor(likeCount)),
    repostCount: Math.max(0, Math.floor(repostCount)),
    replyCount: Math.max(0, Math.floor(replyCount)),
    quoteCount: Math.max(0, Math.floor(quoteCount)),
    viewCount: viewCount != null && Number.isFinite(viewCount) ? viewCount : null,
    matchedQuery,
  };
}

function readPath<T>(obj: unknown, path: (string | number)[]): T | undefined {
  let cursor: unknown = obj;
  for (const key of path) {
    if (cursor == null) return undefined;
    if (typeof cursor !== "object") return undefined;
    cursor = (cursor as Record<string | number, unknown>)[key];
  }
  return cursor as T | undefined;
}

function readString(obj: unknown, path: (string | number)[]): string | undefined {
  const value = readPath<unknown>(obj, path);
  return typeof value === "string" ? value : undefined;
}

function readNumber(obj: unknown, path: (string | number)[]): number | undefined {
  const value = readPath<unknown>(obj, path);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function twitterDateToIso(createdAt: string): string {
  // Twitter returns e.g. "Wed Oct 10 20:19:24 +0000 2025"
  const parsed = Date.parse(createdAt);
  if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  return new Date().toISOString();
}

function sinceStringFromISO(iso: string): string {
  // YYYY-MM-DD in UTC.
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

export class TwitterWebProvider {
  private readonly states: AccountState[];
  private readonly timeoutMs: number;
  private readonly queryId: string;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly logger: NonNullable<TwitterWebProviderConfig["logger"]>;
  private stats: TwitterWebProviderStats = {
    requests: 0,
    errors: 0,
    accountsHealthy: 0,
    accountsRateLimited: 0,
  };
  private cursor = 0;

  constructor(config: TwitterWebProviderConfig) {
    if (!config.accounts || config.accounts.length === 0) {
      throw new Error("TwitterWebProvider requires at least one account");
    }
    this.states = config.accounts.map((account, index) => ({
      account,
      rateLimitedUntil: 0,
      consecutiveFailures: 0,
      id: index + 1,
    }));
    this.timeoutMs = config.timeoutMs ?? 12_000;
    this.queryId =
      config.queryId ??
      process.env.TWITTER_GRAPHQL_SEARCH_QUERY_ID ??
      DEFAULT_QUERY_ID;
    this.fetchImpl = config.fetchImpl ?? (fetch as typeof fetch);
    this.now = config.now ?? Date.now;
    this.logger = config.logger ?? {
      info: (msg) => console.log(`[twitter-web] ${msg}`),
      warn: (msg) => console.warn(`[twitter-web] ${msg}`),
      error: (msg) => console.error(`[twitter-web] ${msg}`),
    };
    this.logger.info(`initialized with ${this.states.length} account(s)`);
  }

  getStats(): TwitterWebProviderStats {
    const nowMs = this.now();
    let healthy = 0;
    let rateLimited = 0;
    for (const state of this.states) {
      if (state.consecutiveFailures >= 3) continue;
      if (state.rateLimitedUntil > nowMs) {
        rateLimited += 1;
      } else {
        healthy += 1;
      }
    }
    return {
      requests: this.stats.requests,
      errors: this.stats.errors,
      accountsHealthy: healthy,
      accountsRateLimited: rateLimited,
    };
  }

  async search(opts: SearchOptions): Promise<TwitterWebPost[]> {
    const limit = Math.min(Math.max(1, opts.limit ?? 25), 100);
    const rawQueryParts = [opts.query];
    if (opts.sinceISO) {
      const since = sinceStringFromISO(opts.sinceISO);
      if (since) rawQueryParts.push(`since:${since}`);
    }
    rawQueryParts.push("-filter:replies");
    const rawQuery = rawQueryParts.join(" ").trim();

    const variables = {
      rawQuery,
      count: limit,
      querySource: "typed_query",
      product: "Latest",
    };

    const url =
      `https://x.com/i/api/graphql/${encodeURIComponent(this.queryId)}/SearchTimeline` +
      `?variables=${encodeURIComponent(JSON.stringify(variables))}` +
      `&features=${encodeURIComponent(JSON.stringify(GRAPHQL_FEATURES))}`;

    const attempted = new Set<number>();
    const totalAccounts = this.states.length;
    let lastError: string | null = null;

    while (attempted.size < totalAccounts) {
      const state = this.pickAccount(attempted);
      if (!state) break;
      attempted.add(state.id);

      const result = await this.callOnce(url, state, opts.query);
      if (result.kind === "ok") {
        state.consecutiveFailures = 0;
        return result.posts;
      }

      lastError = result.error;
      if (result.kind === "rate-limited") {
        state.rateLimitedUntil = result.resetEpochMs;
        this.logger.warn(
          `account #${state.id} rate-limited until ${new Date(result.resetEpochMs).toISOString()}`,
        );
        continue;
      }
      if (result.kind === "unauthorized") {
        state.consecutiveFailures = 999;
        this.logger.warn(`account #${state.id} unauthorized (token invalidated)`);
        continue;
      }
      if (result.kind === "server-error") {
        state.consecutiveFailures += 1;
        this.logger.warn(
          `account #${state.id} server-error: ${result.error} (fail ${state.consecutiveFailures})`,
        );
        continue;
      }
      if (result.kind === "query-not-found") {
        this.logger.error(
          `GraphQL queryId ${this.queryId} returned 404 — operator must rotate TWITTER_GRAPHQL_SEARCH_QUERY_ID`,
        );
        state.consecutiveFailures += 1;
        continue;
      }
      // generic
      state.consecutiveFailures += 1;
      this.logger.warn(
        `account #${state.id} error: ${result.error} (fail ${state.consecutiveFailures})`,
      );
    }

    const stats = this.getStats();
    if (stats.accountsHealthy === 0 && stats.accountsRateLimited === 0) {
      throw new Error(
        `All Twitter web accounts exhausted; last error: ${lastError ?? "unknown"}`,
      );
    }
    this.logger.warn(
      `search returned no results — all attempted accounts failed this round; last error: ${lastError ?? "unknown"}`,
    );
    return [];
  }

  private pickAccount(attempted: Set<number>): AccountState | null {
    const nowMs = this.now();
    // First pass: round-robin through healthy, non-rate-limited accounts.
    for (let i = 0; i < this.states.length; i += 1) {
      const idx = (this.cursor + i) % this.states.length;
      const state = this.states[idx];
      if (attempted.has(state.id)) continue;
      if (state.consecutiveFailures >= 3) continue;
      if (state.rateLimitedUntil > nowMs) continue;
      this.cursor = (idx + 1) % this.states.length;
      return state;
    }
    // Second pass: accept rate-limited if reset in the past (fell off).
    for (const state of this.states) {
      if (attempted.has(state.id)) continue;
      if (state.consecutiveFailures >= 3) continue;
      return state;
    }
    return null;
  }

  private async callOnce(
    url: string,
    state: AccountState,
    query: string,
  ): Promise<
    | { kind: "ok"; posts: TwitterWebPost[] }
    | { kind: "rate-limited"; resetEpochMs: number; error: string }
    | { kind: "unauthorized"; error: string }
    | { kind: "server-error"; error: string }
    | { kind: "query-not-found"; error: string }
    | { kind: "error"; error: string }
  > {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    this.stats.requests += 1;
    try {
      const res = await this.fetchImpl(url, {
        method: "GET",
        signal: controller.signal,
        headers: {
          authorization: PUBLIC_WEB_BEARER,
          "x-csrf-token": state.account.ct0,
          cookie: `auth_token=${state.account.authToken}; ct0=${state.account.ct0}`,
          "user-agent": USER_AGENT,
          accept: "*/*",
          "accept-language": "en-US,en;q=0.9",
          "accept-encoding": "gzip, deflate, br, zstd",
          referer: "https://x.com/",
          origin: "https://x.com",
          "x-twitter-active-user": "yes",
          "x-twitter-client-language": "en",
          "x-twitter-auth-type": "OAuth2Session",
          // Browser hints — Twitter's anti-bot checks these in 2026.
          "sec-ch-ua": '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
          "sec-ch-ua-mobile": "?0",
          "sec-ch-ua-platform": '"Windows"',
          "sec-fetch-dest": "empty",
          "sec-fetch-mode": "cors",
          "sec-fetch-site": "same-origin",
        },
      });

      if (res.status === 429) {
        this.stats.errors += 1;
        const resetHeader = res.headers.get("x-rate-limit-reset");
        const resetEpochSec = resetHeader ? Number.parseInt(resetHeader, 10) : NaN;
        const resetEpochMs = Number.isFinite(resetEpochSec)
          ? resetEpochSec * 1000
          : this.now() + 15 * 60 * 1000;
        return { kind: "rate-limited", resetEpochMs, error: `HTTP 429` };
      }

      if (res.status === 401 || res.status === 403) {
        this.stats.errors += 1;
        return { kind: "unauthorized", error: `HTTP ${res.status}` };
      }

      if (res.status === 404) {
        this.stats.errors += 1;
        return { kind: "query-not-found", error: `HTTP 404 — queryId rotated` };
      }

      if (res.status >= 500) {
        this.stats.errors += 1;
        // single retry after 1s backoff
        await sleep(1000);
        try {
          const retry = await this.fetchImpl(url, {
            method: "GET",
            headers: {
              authorization: PUBLIC_WEB_BEARER,
              "x-csrf-token": state.account.ct0,
              cookie: `auth_token=${state.account.authToken}; ct0=${state.account.ct0}`,
              "user-agent": USER_AGENT,
              accept: "*/*",
              "accept-language": "en-US,en;q=0.9",
              referer: "https://x.com/",
              "x-twitter-active-user": "yes",
              "x-twitter-client-language": "en",
              "x-twitter-auth-type": "OAuth2Session",
            },
          });
          if (retry.ok) {
            const body = await retry.json().catch(() => ({}));
            const posts = parseSearchTimelineResponse(body, query);
            return { kind: "ok", posts };
          }
          return {
            kind: "server-error",
            error: `HTTP ${res.status} (retry: HTTP ${retry.status})`,
          };
        } catch (err) {
          const m = err instanceof Error ? err.message : String(err);
          return { kind: "server-error", error: `HTTP ${res.status} (retry failed: ${m})` };
        }
      }

      if (!res.ok) {
        this.stats.errors += 1;
        const text = await res.text().catch(() => "");
        return {
          kind: "error",
          error: `HTTP ${res.status}: ${text.slice(0, 200)}`,
        };
      }

      const rawText = await res.text();

      // Silent-reject detection. x.com's anti-bot returns 200 OK with an
      // empty body and no content-type when the underlying account session
      // is locked / suspended / expired (cookies still TLS-valid, account
      // disabled at the platform level). Without this branch we'd treat it
      // as "ok with 0 posts" forever and never surface the auth problem.
      const ct = res.headers.get("content-type") ?? "";
      if (rawText.length === 0 || (rawText.length < 16 && !ct.includes("json"))) {
        this.stats.errors += 1;
        if (process.env.TWITTER_WEB_DEBUG === "1") {
          console.log(
            `[twitter-web:debug] silent-reject · status=${res.status} ct=${ct || "-"} bytes=${rawText.length}`,
          );
        }
        return {
          kind: "unauthorized",
          error: `silent-reject (status ${res.status}, ${rawText.length}B body, ct="${ct || "-"}") — account session likely dead, refresh TWITTER_WEB_ACCOUNTS_JSON cookies`,
        };
      }

      let body: unknown;
      try {
        body = JSON.parse(rawText);
      } catch {
        if (process.env.TWITTER_WEB_DEBUG === "1") {
          console.log(
            `[twitter-web:debug] non-JSON response · status=${res.status} ct=${ct || "-"} · first 300: ${rawText.slice(0, 300).replace(/\s+/g, " ")}`,
          );
        }
        // Non-JSON, non-empty response — also treat as unauthorized so the
        // account gets demoted instead of silently producing 0 posts.
        this.stats.errors += 1;
        return {
          kind: "unauthorized",
          error: `non-JSON response (status ${res.status}, ${rawText.length}B body)`,
        };
      }

      // Twitter sometimes returns 200 with a GraphQL `errors` array.
      const errors = readPath<unknown[]>(body, ["errors"]);
      if (Array.isArray(errors) && errors.length > 0) {
        const first = errors[0] as { code?: number; message?: string } | undefined;
        const code = first?.code;
        const message = first?.message ?? "graphql error";
        this.stats.errors += 1;
        // 88 = Rate limit exceeded (per Twitter's docs).
        if (code === 88) {
          return {
            kind: "rate-limited",
            resetEpochMs: this.now() + 15 * 60 * 1000,
            error: `graphql 88: ${message}`,
          };
        }
        // 32/89 = Could not authenticate / invalid token.
        if (code === 32 || code === 89) {
          return { kind: "unauthorized", error: `graphql ${code}: ${message}` };
        }
        return { kind: "error", error: `graphql ${code ?? "?"}: ${message}` };
      }

      const posts = parseSearchTimelineResponse(body, query);
      // Diagnostic: when DEBUG is set AND parser returned 0 posts despite a
      // 200 response, log a sample of the raw body so we can tell what
      // Twitter is actually returning (empty data? errors array? different
      // shape? missing feature flag triggering a non-error empty response?).
      if (posts.length === 0 && process.env.TWITTER_WEB_DEBUG === "1") {
        const sample = JSON.stringify(body).slice(0, 500);
        console.log(
          `[twitter-web:debug] 0 posts for "${query.slice(0, 60)}" · body: ${sample}`,
        );
      }
      return { kind: "ok", posts };
    } catch (err) {
      this.stats.errors += 1;
      const message = err instanceof Error ? err.message : String(err);
      return { kind: "error", error: message };
    } finally {
      clearTimeout(timer);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}
