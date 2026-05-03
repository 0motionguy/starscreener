// X (Twitter) funding-hashtag fetcher.
//
// Runs Apify's `apidojo~tweet-scraper` actor against a small set of
// funding-specific search queries and emits a FundingSignal payload that's
// shape-compatible with `funding-news/index.ts` so the consumer can merge
// the three slugs (funding-news / funding-news-crunchbase / funding-news-x)
// trivially.
//
// Slug: `funding-news-x`. Cadence: twice daily at 00:30 and 12:30 UTC. The
// :30 offset keeps us off the same minute as the main funding-news fetcher
// (`0 */6 * * *`) and the crunchbase fetcher (`0 */6 * * *`).
//
// Reliability:
//   - APIFY_API_TOKEN gates the whole fetcher. With it unset we publish an
//     empty payload (so the slug exists in Redis and the consumer doesn't
//     fall back to "missing") and log a clear skip reason. This matches
//     funding-news's "graceful degradation" stance — we never blank the slug.
//   - Per-actor-run timeout = 5 min. The actor has its own internal max
//     items cap; we only need ~7 days of activity per run.
//   - Network errors during the actor run propagate up — the worker scheduler
//     marks the fetcher failed and re-tries on next tick.
//
// The Apify REST flow used here:
//   1. POST /v2/acts/<actor>/run-sync-get-dataset-items?token=<token>
//      with the run-input as JSON body. This blocks until the actor finishes
//      (or times out at 5min) and returns the dataset rows directly.
//   2. We parse each row, extract the tweet text, run extractFunding(), and
//      keep rows where the regex pulled SOMETHING (companyName, amount, or
//      roundType). Rows with no funding signal are dropped.
//
// We intentionally do NOT pull `apify-client` from npm — the REST interface
// is two endpoints + JSON; the dep would add 1.5MB of unrelated tooling.

import type { Fetcher, FetcherContext, RunResult } from '../../lib/types.js';
import { writeDataStore } from '../../lib/redis.js';
import { fetchWithTimeout } from '../../lib/util/http-helpers.js';
import {
  extractFunding,
  extractTags,
  type FundingExtraction,
} from '../../lib/sources/funding-extract.js';
import { X_FUNDING_QUERIES } from './queries.js';

const WINDOW_DAYS = 7;
const MAX_AGE_MS = WINDOW_DAYS * 24 * 60 * 60 * 1000;
const ACTOR_ID = 'apidojo~tweet-scraper';
const ACTOR_RUN_TIMEOUT_MS = 5 * 60 * 1000; // 5 min Apify-side cap.
const HTTP_TIMEOUT_MS = 6 * 60 * 1000; // 6 min — leave headroom past actor cap.
const MAX_TWEETS_PER_QUERY = 100;
const NITTER_INSTANCES = [
  'https://nitter.net',
  'https://nitter.privacydev.net',
  'https://nitter.poast.org',
  'https://nitter.cz',
  'https://nitter.unixfox.eu',
];

interface FundingSignal {
  id: string;
  headline: string;
  description: string;
  sourceUrl: string;
  sourcePlatform: string;
  publishedAt: string;
  discoveredAt: string;
  extracted: FundingExtraction | null;
  tags: string[];
}

export interface FundingNewsXPayload {
  fetchedAt: string;
  source: 'x-funding-hashtags';
  windowDays: number;
  signals: FundingSignal[];
  /** True when APIFY_API_TOKEN is missing — payload will be empty. */
  requiresApifyToken: boolean;
}

/**
 * Stable id for an x-funding signal. Mirrors the
 * `<domain>-<headline-hash>` shape used by funding-news/index.ts so the
 * consumer's dedupe set works across all three slugs without a special case.
 * For X we use `twitter.com` as the synthetic domain.
 */
export function createSignalId(headline: string, sourceUrl: string): string {
  const domain = sourceUrl.replace(/^https?:\/\//, '').split('/')[0] ?? 'twitter.com';
  let h = 0;
  for (let i = 0; i < headline.length; i += 1) {
    h = (h * 31 + headline.charCodeAt(i)) >>> 0;
  }
  return `${domain}-${h.toString(16).slice(0, 8)}`;
}

// ---------------------------------------------------------------------------
// Tweet -> FundingSignal extraction (pure)
// ---------------------------------------------------------------------------

interface TweetLike {
  /** Apify's `apidojo~tweet-scraper` typically returns this as `text` or `full_text`. */
  text?: string;
  full_text?: string;
  /** Tweet permalink. */
  url?: string;
  /** Some actor versions populate `twitterUrl` instead. */
  twitterUrl?: string;
  id?: string | number;
  /** ISO timestamp. Some versions emit `createdAt`, others `created_at`. */
  createdAt?: string;
  created_at?: string;
  /** Author handle, used as a fallback id input. */
  username?: string;
  user?: { screen_name?: string; userName?: string };
}

/**
 * Pull the tweet text out of the Apify row regardless of which key the
 * actor version used. Returns "" when the row has no usable text.
 */
function extractTweetText(tweet: TweetLike): string {
  return String(tweet.text ?? tweet.full_text ?? '').trim();
}

/** Permalink resolution — actor versions disagree on field names. */
function extractTweetUrl(tweet: TweetLike): string {
  if (typeof tweet.url === 'string' && tweet.url.length > 0) return tweet.url;
  if (typeof tweet.twitterUrl === 'string' && tweet.twitterUrl.length > 0) return tweet.twitterUrl;
  const handle = tweet.username ?? tweet.user?.screen_name ?? tweet.user?.userName;
  if (handle && tweet.id !== undefined) {
    return `https://twitter.com/${handle}/status/${tweet.id}`;
  }
  return 'https://twitter.com';
}

function extractTweetCreatedAt(tweet: TweetLike): string {
  const raw = tweet.createdAt ?? tweet.created_at;
  if (typeof raw !== 'string' || raw.length === 0) return new Date().toISOString();
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date().toISOString();
}

/**
 * Convert one Apify tweet row into a FundingSignal — or null when:
 *   - the tweet has no usable text
 *   - the regex extractor finds no funding signal at all (no company, no
 *     amount, no round type — pure noise like "raised an interesting point")
 *   - the tweet is older than the rolling window
 *
 * Pure function; exported for tests in tests/fetchers/x-funding/extract.test.ts.
 */
export function tweetToSignal(
  tweet: TweetLike,
  discoveredAt: string,
  now: number = Date.now(),
): FundingSignal | null {
  const text = extractTweetText(tweet);
  if (!text) return null;

  const publishedAt = extractTweetCreatedAt(tweet);
  const publishedMs = Date.parse(publishedAt);
  if (Number.isFinite(publishedMs) && now - publishedMs > MAX_AGE_MS) return null;

  // Treat the whole tweet as the headline AND description — tweets are short
  // enough that splitting wouldn't gain anything for the regex extractor.
  const extracted = extractFunding(text, text);
  if (!extracted) return null;

  // Require at least a numeric amount OR a real round type (not the
  // 'undisclosed' fallback). The extractor often guesses companyName from
  // the first capitalized word — that alone is too noisy for a tweet stream.
  // RSS headlines are pre-curated so they can pass with companyName-only;
  // tweets need stricter filtering.
  const hasAmount = typeof extracted.amount === 'number' && extracted.amount > 0;
  const hasRound = extracted.roundType !== 'undisclosed';
  if (!hasAmount && !hasRound) return null;

  const tags = extractTags(text, text);
  const sourceUrl = extractTweetUrl(tweet);
  const headline = text.length > 280 ? `${text.slice(0, 277)}...` : text;

  return {
    id: createSignalId(text, sourceUrl),
    headline,
    description: text,
    sourceUrl,
    sourcePlatform: 'twitter',
    publishedAt,
    discoveredAt,
    extracted,
    tags,
  };
}

// ---------------------------------------------------------------------------
// Apify REST client — minimal POST-and-read shim. No npm dep added.
// ---------------------------------------------------------------------------

interface ApifyActorInput {
  searchTerms: string[];
  maxItems: number;
  sort: 'Latest' | 'Top';
  tweetLanguage?: string;
}

/**
 * Run the apidojo tweet-scraper actor synchronously and return the dataset
 * rows. Uses run-sync-get-dataset-items so we don't have to poll the run
 * status endpoint — Apify holds the connection until the run finishes (or
 * the actor's internal timeout fires) and streams the rows back.
 *
 * On non-200 the function throws — caller (the fetcher) catches and logs.
 */
export async function runTweetScraper(
  token: string,
  input: ApifyActorInput,
): Promise<TweetLike[]> {
  const url = `https://api.apify.com/v2/acts/${encodeURIComponent(ACTOR_ID)}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}&timeout=${Math.floor(ACTOR_RUN_TIMEOUT_MS / 1000)}`;
  const res = await fetchWithTimeout(url, {
    timeoutMs: HTTP_TIMEOUT_MS,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`apify run-sync ${res.status}: ${body.slice(0, 300)}`);
  }
  const json: unknown = await res.json();
  if (!Array.isArray(json)) {
    throw new Error('apify run-sync returned non-array body');
  }
  return json as TweetLike[];
}

export async function scrapeTwitterFor(
  query: string,
  token: string,
): Promise<TweetLike[]> {
  try {
    return await runTweetScraper(token, {
      searchTerms: [query],
      maxItems: MAX_TWEETS_PER_QUERY,
      sort: 'Latest',
      tweetLanguage: 'en',
    });
  } catch (apifyError) {
    const nitterErrors: string[] = [];
    for (const baseUrl of NITTER_INSTANCES) {
      try {
        const rssUrl = `${baseUrl}/search/rss?q=${encodeURIComponent(query)}`;
        const response = await fetchWithTimeout(rssUrl, {
          timeoutMs: 20_000,
          headers: {
            Accept: 'application/rss+xml, application/xml, text/xml',
            'User-Agent': 'trendingrepo-x-funding-fallback/1.0 (+https://trendingrepo.com)',
          },
        });
        if (!response.ok) {
          nitterErrors.push(`${baseUrl}: HTTP ${response.status}`);
          continue;
        }
        const xml = await response.text();
        return parseNitterRssToTweets(xml);
      } catch (error) {
        nitterErrors.push(
          `${baseUrl}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    const apifyMessage =
      apifyError instanceof Error ? apifyError.message : String(apifyError);
    throw new Error(
      `twitter-all-sources-failed apify=${apifyMessage} nitter=${nitterErrors.join(' | ')}`,
    );
  }
}

function parseNitterRssToTweets(xml: string): TweetLike[] {
  const out: TweetLike[] = [];
  const items = xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? [];
  for (const item of items) {
    const title = decodeRssText(extractTag(item, 'title'));
    const link = decodeRssText(extractTag(item, 'link'));
    const pubDate = decodeRssText(extractTag(item, 'pubDate'));
    const creator = decodeRssText(extractTag(item, 'dc:creator') ?? extractTag(item, 'creator'));
    if (!title || !link || !pubDate) continue;
    const publishedMs = Date.parse(pubDate);
    if (!Number.isFinite(publishedMs)) continue;
    out.push({
      text: stripHtml(title),
      url: link,
      createdAt: new Date(publishedMs).toISOString(),
      username: creator?.replace(/^@/, '').trim() || undefined,
    });
  }
  return out;
}

function extractTag(block: string, tag: string): string | null {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, 'i');
  const match = block.match(re);
  return match ? unwrapCdata(match[1] ?? '').trim() : null;
}

function unwrapCdata(value: string): string {
  const match = value.match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
  return match ? (match[1] ?? value) : value;
}

function decodeRssText(value: string | null): string | null {
  if (value === null) return null;
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

// ---------------------------------------------------------------------------
// Fetcher
// ---------------------------------------------------------------------------

const fetcher: Fetcher = {
  name: 'x-funding',
  // Twice daily — 00:30 and 12:30 UTC. The :30 offset keeps this off the
  // same minute as funding-news / crunchbase (both `0 */6 * * *`). 12h
  // matches the original task plan for source-coverage Phase 3.4.
  schedule: '30 0,12 * * *',
  async run(ctx: FetcherContext): Promise<RunResult> {
    const startedAt = new Date().toISOString();

    if (ctx.dryRun) {
      ctx.log.info(
        { queries: X_FUNDING_QUERIES.length },
        'x-funding dry-run',
      );
      return done(startedAt, 0, false);
    }

    const discoveredAt = new Date().toISOString();
    const token = process.env.APIFY_API_TOKEN?.trim();

    if (!token) {
      // No Apify credentials → publish an empty payload so the slug exists
      // and downstream readers see a fresh `fetchedAt` without falling back
      // to the "missing" tier.
      const payload: FundingNewsXPayload = {
        fetchedAt: discoveredAt,
        source: 'x-funding-hashtags',
        windowDays: WINDOW_DAYS,
        signals: [],
        requiresApifyToken: true,
      };
      const result = await writeDataStore('funding-news-x', payload);
      ctx.log.warn(
        { redisSource: result.source },
        'x-funding skipped: APIFY_API_TOKEN unset (slug published empty)',
      );
      return done(startedAt, 0, result.source === 'redis');
    }

    const allSignals: FundingSignal[] = [];
    const seenIds = new Set<string>();
    const failedQueries: string[] = [];

    for (const query of X_FUNDING_QUERIES) {
      ctx.log.info({ query }, 'x-funding apify run');
      let tweets: TweetLike[] = [];
      try {
        tweets = await scrapeTwitterFor(query, token);
      } catch (err) {
        failedQueries.push(query);
        ctx.log.warn(
          { query, error: (err as Error).message },
          'x-funding apify query failed',
        );
        continue;
      }

      let kept = 0;
      for (const tweet of tweets) {
        const signal = tweetToSignal(tweet, discoveredAt);
        if (!signal) continue;
        if (seenIds.has(signal.id)) continue;
        seenIds.add(signal.id);
        allSignals.push(signal);
        kept += 1;
      }
      ctx.log.debug(
        { query, scanned: tweets.length, kept },
        'x-funding query done',
      );
    }

    allSignals.sort((a, b) => {
      const ta = Date.parse(a.publishedAt);
      const tb = Date.parse(b.publishedAt);
      return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
    });

    const payload: FundingNewsXPayload = {
      fetchedAt: discoveredAt,
      source: 'x-funding-hashtags',
      windowDays: WINDOW_DAYS,
      signals: allSignals,
      requiresApifyToken: false,
    };
    const result = await writeDataStore('funding-news-x', payload);
    ctx.log.info(
      {
        signals: allSignals.length,
        failedQueries: failedQueries.length,
        redisSource: result.source,
      },
      'funding-news-x published',
    );
    return done(startedAt, allSignals.length, result.source === 'redis');
  },
};

export default fetcher;

function done(startedAt: string, items: number, redisPublished: boolean): RunResult {
  return {
    fetcher: 'x-funding',
    startedAt,
    finishedAt: new Date().toISOString(),
    itemsSeen: items,
    itemsUpserted: 0,
    metricsWritten: 0,
    redisPublished,
    errors: [],
  };
}
