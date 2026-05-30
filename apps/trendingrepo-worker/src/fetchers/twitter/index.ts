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
import { readDataStore, writeDataStore } from '../../lib/redis.js';
import { shouldPreserveCache } from '../../lib/util/cache-merge.js';
import { loadTrackedRepos } from '../../lib/util/tracked-repos.js';

const DEFAULT_NITTER_INSTANCE = 'https://nt.vern.cc';
// When TWITTER_USE_CAMOFOX=1, default to an instance proven alive behind Anubis
// (the public direct-fetch network is dead post-2026; camofox bypasses the PoW).
const DEFAULT_NITTER_INSTANCE_CAMOFOX = 'https://nitter.privacyredirect.com';
const REQUEST_TIMEOUT_MS = 10_000;
const REQUEST_PAUSE_MS = 750;
const MAX_REPOS_PER_RUN = 50;
const MAX_TWEETS_PER_REPO = 20;
const USER_AGENT =
  'Mozilla/5.0 (compatible; trendingrepo-bot/1.0; +https://trendingrepo.com)';
// Camofox-browser (camoufox/Firefox + C++ fingerprint spoof). Default is the
// docker-network service name on TOOLBOX (toolbox_edge). Tabs are JWT-cookie
// gated, so one tab per run handles Anubis once and reuses the session for all
// search URLs.
const CAMOFOX_BASE_URL =
  process.env.CAMOFOX_URL?.trim().replace(/\/+$/, '') || 'http://camofox-browser:9377';
const CAMOFOX_TIMEOUT_MS = 45_000;
const CAMOFOX_USER_ID = 'trendingrepo-twitter';
const CAMOFOX_SESSION_KEY = 'nitter-sweep';
// Empirical (2026-05-30 on nitter.privacyredirect.com behind Anubis): 8s post-
// navigate often shows the layout shell but no .timeline-item rows; 12s lets
// Nitter's upstream scrape finish + render. The page is JS-static after that
// — no further state changes.
const CAMOFOX_NAVIGATE_WAIT_MS = 12_000;

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

// --- camofox-browser path -----------------------------------------------------
//
// Public Nitter instances are now uniformly behind Anubis (SHA-256 PoW
// anti-bot, algorithm "preact"). Hand-rolling the verify protocol is fragile
// — Anubis ties the JWT to a real browser fingerprint that's painful to spoof.
// camofox-browser (camoufox/Firefox + C++-level fingerprint spoofing, port
// 9377) handles Anubis transparently. One tab/run amortises the bypass cost
// across all search URLs (JWT cookie persists per tab).

async function camofoxFetch(
  path: string,
  init: { method?: 'GET' | 'POST' | 'DELETE'; body?: unknown; needsAuth?: boolean } = {},
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CAMOFOX_TIMEOUT_MS);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  // /evaluate (and a few other "sensitive" endpoints) need Bearer auth; tab
  // create / navigate / snapshot work unauthenticated.
  const apiKey = process.env.CAMOFOX_API_KEY;
  if (init.needsAuth && apiKey) headers.Authorization = `Bearer ${apiKey}`;
  try {
    return await fetch(`${CAMOFOX_BASE_URL}${path}`, {
      method: init.method ?? 'GET',
      signal: controller.signal,
      headers,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function createCamofoxTab(initialUrl: string): Promise<string> {
  const res = await camofoxFetch('/tabs', {
    method: 'POST',
    body: { userId: CAMOFOX_USER_ID, sessionKey: CAMOFOX_SESSION_KEY, url: initialUrl },
  });
  if (!res.ok) {
    throw new Error(`camofox /tabs ${res.status} ${res.statusText}`);
  }
  const j = (await res.json()) as { tabId?: string; id?: string };
  const id = j.tabId ?? j.id;
  if (!id) throw new Error(`camofox /tabs: missing tabId in response`);
  return id;
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function fetchViaCamofox(tabId: string, url: string): Promise<string> {
  const nav = await camofoxFetch(`/tabs/${tabId}/navigate`, {
    method: 'POST',
    body: { url, userId: CAMOFOX_USER_ID, waitUntil: 'networkidle' },
  });
  if (!nav.ok) {
    throw new Error(`camofox navigate ${nav.status} ${nav.statusText} for ${url}`);
  }
  // Anubis releases the page, but Nitter still needs to fetch upstream tweets
  // and render them. networkidle isn't enough on every instance — give it a
  // fixed wall-clock wait so timeline-items have actually populated.
  await sleepMs(CAMOFOX_NAVIGATE_WAIT_MS);
  const evalRes = await camofoxFetch(`/tabs/${tabId}/evaluate`, {
    method: 'POST',
    needsAuth: true,
    body: { userId: CAMOFOX_USER_ID, expression: 'document.documentElement.outerHTML' },
  });
  if (!evalRes.ok) {
    throw new Error(`camofox evaluate ${evalRes.status} ${evalRes.statusText}`);
  }
  const j = (await evalRes.json()) as { ok?: boolean; result?: string; error?: string };
  if (j.error || typeof j.result !== 'string') {
    throw new Error(`camofox evaluate error: ${j.error ?? 'no result'}`);
  }
  return j.result;
}

export async function closeCamofoxTab(tabId: string): Promise<void> {
  try {
    await camofoxFetch(`/tabs/${tabId}?userId=${encodeURIComponent(CAMOFOX_USER_ID)}`, {
      method: 'DELETE',
    });
  } catch {
    // best-effort cleanup; pressure/cleanup will sweep stale tabs anyway
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

    const useCamofox = process.env.TWITTER_USE_CAMOFOX === '1';
    const defaultInstance = useCamofox
      ? DEFAULT_NITTER_INSTANCE_CAMOFOX
      : DEFAULT_NITTER_INSTANCE;
    const instance =
      process.env.TWITTER_NITTER_INSTANCE?.trim().replace(/\/+$/, '') ||
      defaultInstance;

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
    ctx.log.info(
      { instance, useCamofox, repos: repos.length },
      'twitter: starting nitter sweep',
    );

    // When camofox is enabled, one tab handles Anubis once for the whole run.
    // If the camofox service is unreachable, we degrade to the direct fetch
    // (which will likely also fail behind Anubis, but produces consistent
    // signals rather than crashing the fetcher).
    let camofoxTabId: string | undefined;
    if (useCamofox) {
      try {
        camofoxTabId = await createCamofoxTab(`${instance}/`);
        ctx.log.info({ tabId: camofoxTabId }, 'twitter: camofox tab created');
      } catch (err) {
        ctx.log.error(
          { err: (err as Error).message },
          'twitter: camofox tab creation failed — falling back to direct fetch',
        );
      }
    }

    const allPosts: TwitterRepoSignalPost[] = [];
    let failed = 0;
    let consecutiveFailures = 0;
    let bailedOut = false;
    let bailReason: string | undefined;
    const fetchedAt = new Date().toISOString();

    try {
      for (const repoFullName of repos) {
        const url = buildNitterSearchUrl(instance, repoFullName);
        try {
          const html = camofoxTabId
            ? await fetchViaCamofox(camofoxTabId, url)
            : await fetchNitterPage(url);
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
    } finally {
      if (camofoxTabId) await closeCamofoxTab(camofoxTabId);
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

    // Zero-write guard (keep-last-50 rule): the public Nitter instance is
    // frequently down/rate-limited, making allPosts empty. Overwriting the slug
    // with an empty payload zeroes twitter signals until the next good run —
    // the intermittent flake. Preserve the last-known-good slug instead.
    const existing = await readDataStore<{ posts?: unknown[] }>(
      'twitter-repo-signals',
    ).catch(() => null);
    let source = 'preserved';
    if (
      shouldPreserveCache<unknown>({
        fresh: allPosts,
        existing: existing?.posts ?? [],
      })
    ) {
      ctx.log.warn(
        { degraded, failed, bailReason },
        'twitter: empty scan — preserving last-known-good twitter-repo-signals',
      );
    } else {
      const result = await writeDataStore('twitter-repo-signals', payload);
      source = result.source;
    }
    ctx.log.info(
      {
        instance,
        scanned: repos.length,
        failed,
        posts: allPosts.length,
        degraded,
        redis: source,
      },
      'twitter published',
    );
    return done(startedAt, allPosts.length, source === 'redis');
  },
};

export default fetcher;
