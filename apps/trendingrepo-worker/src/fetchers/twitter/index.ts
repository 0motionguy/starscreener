// Twitter (X) mentions fetcher via Nitter.
//
// Cron: 19 * * * * (off-peak — keeps the slot away from reddit at :30).
//
// Why Nitter (and why not Apify here)?
//   - The existing Apify-backed twitter ingest lives in
//     scripts/collect-twitter-signals.ts and is gated by APIFY_API_TOKEN with
//     a per-tweet cost. This worker fetcher exists as a free, best-effort
//     secondary path that scrapes a public Nitter instance.
//   - Cookie-based scrapers (sntwitter, snscrape) are dead post-2026. Nitter
//     HTML scrape over plain `fetch` + cheerio is the only zero-cost path
//     that still works without paid infra.
//
// Resilience:
//   - Instance configurable via TWITTER_NITTER_INSTANCE env (defaults to
//     nt.vern.cc, the operator-vetted current instance). Operator can swap
//     without redeploy.
//   - Per-repo failures isolated via Promise.allSettled.
//   - Rate-limit / 5xx / down instance: log warn, write empty payload,
//     return successfully so the worker scheduler doesn't mark the tick
//     failed. Caller can compare counts vs prior run to see degradation.
//   - Stable id = numeric tweet id string (Nitter exposes it in the
//     /<user>/status/<id> link). De-dupe across templates within the run.
//
// Output:
//   - Slug `twitter-repo-signals` — flat `posts: [{ id, repoFullName, ... }]`
//     mirrors reddit-all-posts so downstream consumers can union freely.

import * as cheerio from 'cheerio';

import type { Fetcher, FetcherContext, RunResult } from '../../lib/types.js';
import { writeDataStore } from '../../lib/redis.js';
import { loadTrackedRepos } from '../../lib/util/tracked-repos.js';

const DEFAULT_NITTER_INSTANCE = 'https://nt.vern.cc';
const REQUEST_TIMEOUT_MS = 10_000;
const REQUEST_PAUSE_MS = 750;
const MAX_REPOS_PER_RUN = 50;
const MAX_TWEETS_PER_REPO = 20;
const USER_AGENT =
  'Mozilla/5.0 (compatible; trendingrepo-bot/1.0; +https://trendingrepo.com)';

export interface TwitterRepoSignalPost {
  id: string;
  repoFullName: string;
  author: string;
  authorUrl: string;
  text: string;
  tweetUrl: string;
  publishedAt: string | null;
  fetchedAt: string;
  query: string;
}

export interface TwitterRepoSignalsPayload {
  fetchedAt: string;
  source: 'nitter';
  instance: string;
  windowDays: number;
  scannedRepos: number;
  failedRepos: number;
  totalPosts: number;
  posts: TwitterRepoSignalPost[];
  /** True when Nitter is unreachable / rate-limited — payload will be empty. */
  degraded: boolean;
  degradedReason?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Build the Nitter tweet-search URL for a repo. We use the full
 * github.com/<owner>/<repo> URL as the query so matches must reference the
 * actual repo, not just the bare name (which collides with common words).
 */
export function buildNitterSearchUrl(instance: string, repoFullName: string): string {
  const base = instance.replace(/\/+$/, '');
  const query = `github.com/${repoFullName}`;
  return `${base}/search?f=tweets&q=${encodeURIComponent(query)}`;
}

/**
 * Parse a Nitter search HTML page into post records. Pure — feed it HTML,
 * get posts. No I/O. Used by the test fixture.
 */
export function parseNitterSearchHtml(
  html: string,
  repoFullName: string,
  fetchedAt: string,
  query: string,
): TwitterRepoSignalPost[] {
  const $ = cheerio.load(html);
  const out: TwitterRepoSignalPost[] = [];
  const seen = new Set<string>();

  $('.timeline-item').each((_, el) => {
    const root = $(el);
    // The link to the tweet itself lives on `.tweet-link`, which wraps the
    // whole card on Nitter. href = /<user>/status/<id>#m
    const link = root.find('a.tweet-link').first().attr('href') ?? '';
    const idMatch = link.match(/\/status\/(\d+)/);
    const tweetId = idMatch?.[1];
    if (!tweetId || seen.has(tweetId)) return;

    const authorRaw = root.find('a.username').first().text().trim();
    const author = authorRaw.replace(/^@+/, '');
    const text = root.find('.tweet-content').first().text().trim();

    if (!author || !text) return;

    const dateAttr = root.find('.tweet-date a').first().attr('title') ?? '';
    const publishedAt = parseNitterDate(dateAttr);

    seen.add(tweetId);
    out.push({
      id: tweetId,
      repoFullName,
      author,
      authorUrl: `https://twitter.com/${author}`,
      text: text.slice(0, 500),
      tweetUrl: `https://twitter.com/${author}/status/${tweetId}`,
      publishedAt,
      fetchedAt,
      query,
    });
  });

  return out.slice(0, MAX_TWEETS_PER_REPO);
}

/**
 * Nitter exposes timestamps like "Apr 12, 2026 · 7:43 PM UTC" in the link's
 * title attribute. Best-effort: return ISO string on parse, null on failure.
 */
function parseNitterDate(raw: string): string | null {
  if (!raw) return null;
  // Strip the unicode middle-dot Nitter inserts between date + time.
  const cleaned = raw.replace(/\s*·\s*/, ' ');
  const ts = Date.parse(cleaned);
  if (!Number.isFinite(ts)) return null;
  return new Date(ts).toISOString();
}

async function fetchNitterPage(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    if (!res.ok) {
      const err = new Error(`nitter ${res.status} ${res.statusText} for ${url}`);
      (err as Error & { status?: number }).status = res.status;
      throw err;
    }
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

function done(startedAt: string, items: number, redisPublished: boolean): RunResult {
  return {
    fetcher: 'twitter',
    startedAt,
    finishedAt: new Date().toISOString(),
    itemsSeen: items,
    itemsUpserted: 0,
    metricsWritten: 0,
    redisPublished,
    errors: [],
  };
}

const fetcher: Fetcher = {
  name: 'twitter',
  schedule: '19 * * * *',
  async run(ctx: FetcherContext): Promise<RunResult> {
    const startedAt = new Date().toISOString();
    if (ctx.dryRun) {
      ctx.log.info('twitter dry-run');
      return done(startedAt, 0, false);
    }

    const instance =
      process.env.TWITTER_NITTER_INSTANCE?.trim().replace(/\/+$/, '') ||
      DEFAULT_NITTER_INSTANCE;

    const tracked = await loadTrackedRepos({ log: ctx.log });
    if (tracked.size === 0) {
      ctx.log.warn('twitter: tracked repos empty — writing empty payload');
      const payload: TwitterRepoSignalsPayload = {
        fetchedAt: startedAt,
        source: 'nitter',
        instance,
        windowDays: 7,
        scannedRepos: 0,
        failedRepos: 0,
        totalPosts: 0,
        posts: [],
        degraded: true,
        degradedReason: 'no-tracked-repos',
      };
      const result = await writeDataStore('twitter-repo-signals', payload);
      return done(startedAt, 0, result.source === 'redis');
    }

    // Cap repo set to keep one run bounded — operator can grow later.
    const repos = Array.from(tracked.values()).slice(0, MAX_REPOS_PER_RUN);
    ctx.log.info({ instance, repos: repos.length }, 'twitter: starting nitter sweep');

    const allPosts: TwitterRepoSignalPost[] = [];
    let failed = 0;
    let consecutiveFailures = 0;
    let bailedOut = false;
    let bailReason: string | undefined;
    const fetchedAt = new Date().toISOString();

    for (const repoFullName of repos) {
      const url = buildNitterSearchUrl(instance, repoFullName);
      try {
        const html = await fetchNitterPage(url);
        const posts = parseNitterSearchHtml(html, repoFullName, fetchedAt, url);
        allPosts.push(...posts);
        consecutiveFailures = 0;
        ctx.log.debug({ repoFullName, posts: posts.length }, 'twitter: repo scanned');
      } catch (err) {
        failed += 1;
        consecutiveFailures += 1;
        ctx.log.warn(
          { repoFullName, err: (err as Error).message },
          'twitter: nitter fetch failed',
        );
        // Bail early if the instance is clearly down — don't burn 50 timeouts.
        if (consecutiveFailures >= 5) {
          bailedOut = true;
          bailReason = `consecutive-failures:${consecutiveFailures}`;
          ctx.log.warn({ bailReason }, 'twitter: bailing early — instance likely down');
          break;
        }
      }
      await sleep(REQUEST_PAUSE_MS);
    }

    // De-dupe across repos: a tweet that mentions two tracked repos shows up
    // twice in `posts` but with different `repoFullName`. That's intentional —
    // consumers index by (id, repoFullName). But within a single repo bucket
    // each id is already unique (parseNitterSearchHtml dedupes).

    const degraded = bailedOut || (failed > 0 && allPosts.length === 0);
    const payload: TwitterRepoSignalsPayload = {
      fetchedAt,
      source: 'nitter',
      instance,
      windowDays: 7,
      scannedRepos: repos.length,
      failedRepos: failed,
      totalPosts: allPosts.length,
      posts: allPosts,
      degraded,
      ...(degraded && bailReason ? { degradedReason: bailReason } : {}),
    };

    const result = await writeDataStore('twitter-repo-signals', payload);
    ctx.log.info(
      {
        instance,
        scanned: repos.length,
        failed,
        posts: allPosts.length,
        degraded,
        redis: result.source,
      },
      'twitter published',
    );
    return done(startedAt, allPosts.length, result.source === 'redis');
  },
};

export default fetcher;
