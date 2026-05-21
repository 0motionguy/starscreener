// Reddit fetcher (simplified port of scripts/scrape-reddit.mjs).
//
// Cron: 30 * * * * (one slot off the cluster to spread Redis+TCP load).
//
// AUTH MODEL (post-2026-05-21 A3 rebuild):
//   - This fetcher requires the OAuth client-credentials grant.
//     REDDIT_CLIENT_ID + REDDIT_CLIENT_SECRET must be set on the worker
//     (script-type app at https://www.reddit.com/prefs/apps).
//   - If either env var is missing, we WARN and return an empty payload
//     without writing to the data-store. We do NOT fall back to the
//     public r/.../new.json endpoint — the public endpoint is heavily
//     rate-limited and was the root cause of the 0-row trending.reddit
//     ledger in May 2026.
//   - The OAuth bearer is cached in-process for the lifetime of the
//     returned token minus a 10-minute safety margin.
//
// Scope notes vs the script port (unchanged from prior version):
//   - Alias matchers (repo_name / project_name / package_name /
//     homepage_domain / owner_context) require repo-metadata + npm-packages
//     snapshots that the worker doesn't load yet. We keep ONLY the
//     github.com/<owner>/<repo> URL extraction path. Coverage stays
//     correct for any post that pasted the link; the alias-matcher tier
//     rejoins once those slugs are loadable.
//   - Baseline ratios depend on reddit-baselines.json (currently a
//     separate baselines workflow). We omit baseline fields here;
//     consumers fall back to no-baseline tier (UI marks "niche sub").
//   - The all-posts merge mode + merge slug stay in scrape-reddit.mjs for
//     now; the worker only publishes the primary mentions slug.
//
// Output:
//   - ss:data:v1:reddit-mentions  (per-repo mention buckets, 7d window)
//   - ss:data:v1:reddit-all-posts (7d rolling window of normalized posts)

import { fetch as undiciFetch } from 'undici';

import type { Fetcher, FetcherContext, RunResult } from '../../lib/types.js';
import { readDataStore, writeDataStore } from '../../lib/redis.js';
import { classifyPost } from '../../lib/util/classify-post.js';
import { extractAllRepoMentions } from '../../lib/util/github-repo-links.js';
import { loadTrackedRepos } from '../../lib/util/tracked-repos.js';
import { SUBREDDITS } from '../../lib/util/source-watchers.js';

const POSTS_PER_SUB = 100;
const WINDOW_DAYS = 7;
const WINDOW_SECONDS = WINDOW_DAYS * 24 * 60 * 60;
const RATE_LIMIT_BACKOFF_MS = 65_000;
const REQUEST_PAUSE_MS = 5_000;
const REQUEST_TIMEOUT_MS = 15_000;
const TOKEN_SAFETY_MARGIN_SEC = 600; // refresh ≥10 min before expiry
const DEFAULT_USER_AGENT = 'trendingrepo-worker/0.1';

const TOKEN_URL = 'https://www.reddit.com/api/v1/access_token';
const OAUTH_ORIGIN = 'https://oauth.reddit.com';

interface RedditPostData {
  id: string;
  title?: unknown;
  author?: unknown;
  subreddit?: unknown;
  url?: unknown;
  permalink?: unknown;
  selftext?: unknown;
  created_utc?: unknown;
  score?: unknown;
  num_comments?: unknown;
  link_flair_text?: unknown;
}

interface RedditListingResponse {
  data?: { children?: Array<{ data?: RedditPostData }> };
}

interface NormalizedPost {
  id: string;
  subreddit: string;
  title: string;
  url: string;
  permalink: string;
  score: number;
  numComments: number;
  createdUtc: number;
  author: string;
  repoFullName: string | null;
  ageHours: number;
  velocity: number;
  trendingScore: number;
  content_tags: string[];
  value_score: number;
}

interface TokenCache {
  cacheKey: string;
  accessToken: string;
  expiresAtMs: number;
}

let tokenCache: TokenCache | null = null;

// Exposed for unit tests — module state survives across test cases otherwise.
export function __resetRedditOAuthCache(): void {
  tokenCache = null;
}

function getRedditUserAgent(): string {
  const raw = process.env.REDDIT_USER_AGENT;
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  return trimmed.length > 0 ? trimmed : DEFAULT_USER_AGENT;
}

async function getRedditAccessToken(
  clientId: string,
  clientSecret: string,
): Promise<string> {
  const cacheKey = `${clientId}:${clientSecret}`;
  const now = Date.now();
  if (
    tokenCache &&
    tokenCache.cacheKey === cacheKey &&
    tokenCache.expiresAtMs > now
  ) {
    return tokenCache.accessToken;
  }

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`, 'utf8').toString('base64');
  const body = new URLSearchParams({ grant_type: 'client_credentials' }).toString();

  const res = await undiciFetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      authorization: `Basic ${basicAuth}`,
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json',
      'user-agent': getRedditUserAgent(),
    },
    body,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(
      `reddit oauth token request failed: ${res.status} ${res.statusText} ${text.slice(0, 200)}`,
    );
  }

  const json = (await res.json()) as { access_token?: unknown; expires_in?: unknown };
  if (typeof json.access_token !== 'string' || json.access_token.length === 0) {
    throw new Error('reddit oauth token response missing access_token');
  }
  const expiresInSec =
    typeof json.expires_in === 'number' && json.expires_in > 0 ? json.expires_in : 3600;
  // Refresh ≥10 min before expiry; floor at 60s so a freak 0-expiry doesn't loop.
  const safeSec = Math.max(60, expiresInSec - TOKEN_SAFETY_MARGIN_SEC);
  tokenCache = {
    cacheKey,
    accessToken: json.access_token,
    expiresAtMs: now + safeSec * 1000,
  };
  return tokenCache.accessToken;
}

async function fetchSubredditNew(
  sub: string,
  accessToken: string,
  log: FetcherContext['log'],
): Promise<RedditPostData[]> {
  const url = `${OAUTH_ORIGIN}/r/${sub}/new?limit=${POSTS_PER_SUB}`;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const res = await undiciFetch(url, {
      method: 'GET',
      headers: {
        authorization: `Bearer ${accessToken}`,
        accept: 'application/json',
        'user-agent': getRedditUserAgent(),
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (res.status === 429) {
      if (attempt === 1) {
        const err = new Error(`r/${sub}: 429 rate-limited after retry`);
        (err as Error & { status?: number }).status = 429;
        throw err;
      }
      log.warn({ sub, backoffMs: RATE_LIMIT_BACKOFF_MS }, 'reddit 429 - sleeping before retry');
      await sleep(RATE_LIMIT_BACKOFF_MS);
      continue;
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const err = new Error(`r/${sub}: HTTP ${res.status} ${res.statusText} ${text.slice(0, 200)}`);
      (err as Error & { status?: number }).status = res.status;
      throw err;
    }
    const body = (await res.json()) as RedditListingResponse;
    const children = body?.data?.children;
    if (!Array.isArray(children)) {
      throw new Error(`r/${sub}: malformed response (no data.children)`);
    }
    return children
      .map((c) => c?.data)
      .filter((p): p is RedditPostData => p !== undefined && typeof p === 'object' && p !== null);
  }
  return [];
}

function computeVelocityFields(score: number, createdUtc: number): {
  ageHours: number;
  velocity: number;
  logMagnitude: number;
} {
  const nowSec = Math.floor(Date.now() / 1000);
  const ageSec = Math.max(0, nowSec - createdUtc);
  const ageHours = Math.max(0.5, ageSec / 3600);
  const velocity = score / ageHours;
  const logMagnitude = Math.log10(Math.max(1, score));
  return {
    ageHours: Math.round(ageHours * 100) / 100,
    velocity: Math.round(velocity * 100) / 100,
    logMagnitude,
  };
}

function extractRepoMentions(post: RedditPostData, tracked: Map<string, string>): string[] {
  const text = `${String(post.title ?? '')}\n${String(post.url ?? '')}\n${String(post.selftext ?? '')}`;
  const lower = extractAllRepoMentions(text, tracked.size > 0 ? tracked : null);
  return Array.from(lower, (l) => tracked.get(l) ?? l);
}

const fetcher: Fetcher = {
  name: 'reddit',
  schedule: '30 * * * *',
  async run(ctx: FetcherContext): Promise<RunResult> {
    const startedAt = new Date().toISOString();
    if (ctx.dryRun) {
      ctx.log.info('reddit dry-run');
      return done(startedAt, 0, false);
    }

    const clientId = (process.env.REDDIT_CLIENT_ID ?? '').trim();
    const clientSecret = (process.env.REDDIT_CLIENT_SECRET ?? '').trim();
    if (!clientId || !clientSecret) {
      ctx.log.warn(
        { hasClientId: Boolean(clientId), hasClientSecret: Boolean(clientSecret) },
        '[reddit] OAuth env vars missing — skipping fetch. Set REDDIT_CLIENT_ID/SECRET on toolbox to enable.',
      );
      return done(startedAt, 0, false);
    }

    ctx.log.info({ authMode: 'oauth' }, 'reddit: starting');

    const tracked = await loadTrackedRepos({ log: ctx.log });
    if (tracked.size === 0) {
      ctx.log.warn('reddit: tracked repos map empty - mentions buckets will be empty');
    }

    let accessToken: string;
    try {
      accessToken = await getRedditAccessToken(clientId, clientSecret);
    } catch (err) {
      ctx.log.error(
        { err: (err as Error).message },
        '[reddit] failed to mint OAuth token — aborting run (no public fallback)',
      );
      return done(startedAt, 0, false);
    }

    const now = Math.floor(Date.now() / 1000);
    const cutoff = now - WINDOW_SECONDS;
    const fetchedAt = new Date().toISOString();

    interface RepoBucket {
      posts: Map<string, NormalizedPost>;
    }
    const mentions = new Map<string, RepoBucket>();
    const allPosts: NormalizedPost[] = [];
    let scannedTotal = 0;
    let errors = 0;

    for (const sub of SUBREDDITS) {
      try {
        const posts = await fetchSubredditNew(sub, accessToken, ctx.log);
        scannedTotal += posts.length;
        let hitsInSub = 0;

        for (const p of posts) {
          if (typeof p.created_utc !== 'number') continue;
          if (p.created_utc < cutoff) continue;
          const rawTitle = String(p.title ?? '');
          const rawSelftext = String(p.selftext ?? '');
          const rawUrl = String(p.url ?? '');

          const canonicalHits = extractRepoMentions(p, tracked);
          const primaryRepo = canonicalHits[0] ?? null;
          const subName = String(p.subreddit ?? sub);
          const score = Number.isFinite(p.score as number) ? Number(p.score) : 0;
          const { ageHours, velocity, logMagnitude } = computeVelocityFields(score, p.created_utc);
          const trendingScore = Math.round(velocity * logMagnitude * 100) / 100;

          const classification = classifyPost({
            title: rawTitle,
            selftext: rawSelftext,
            url: rawUrl,
            linkFlairText: (p.link_flair_text as string | null | undefined) ?? null,
          });

          const normalized: NormalizedPost = {
            id: String(p.id),
            subreddit: subName,
            title: rawTitle.slice(0, 300),
            url: rawUrl,
            permalink: p.permalink ? `https://www.reddit.com${String(p.permalink)}` : '',
            score,
            numComments: Number.isFinite(p.num_comments as number) ? Number(p.num_comments) : 0,
            createdUtc: p.created_utc,
            author: String(p.author ?? ''),
            repoFullName: primaryRepo,
            ageHours,
            velocity,
            trendingScore,
            content_tags: classification.content_tags,
            value_score: classification.value_score,
          };

          if (canonicalHits.length === 0) {
            allPosts.push(normalized);
            continue;
          }
          for (const canonical of canonicalHits) {
            let bucket = mentions.get(canonical);
            if (!bucket) {
              bucket = { posts: new Map() };
              mentions.set(canonical, bucket);
            }
            const existing = bucket.posts.get(normalized.id);
            if (!existing || normalized.score > existing.score) {
              bucket.posts.set(normalized.id, { ...normalized, repoFullName: canonical });
            }
            hitsInSub += 1;
          }
          allPosts.push(normalized);
        }
        ctx.log.debug({ sub, posts: posts.length, hits: hitsInSub }, 'reddit sub done');
      } catch (err) {
        errors += 1;
        ctx.log.warn({ sub, err: (err as Error).message }, 'reddit sub failed');
      }
      await sleep(REQUEST_PAUSE_MS);
    }

    const mentionsOut: Record<
      string,
      { count7d: number; upvotes7d: number; posts: NormalizedPost[] }
    > = {};
    for (const [fullName, bucket] of mentions) {
      const posts = Array.from(bucket.posts.values()).sort((a, b) => b.score - a.score);
      const upvotes7d = posts.reduce((sum, p) => sum + p.score, 0);
      mentionsOut[fullName] = {
        count7d: posts.length,
        upvotes7d,
        posts,
      };
    }

    const leaderboard = Array.from(
      allPosts.reduce((map, post) => {
        if (!post.repoFullName) return map;
        const row = map.get(post.repoFullName) ?? {
          fullName: post.repoFullName,
          count7d: 0,
          upvotes7d: 0,
        };
        row.count7d += 1;
        row.upvotes7d += post.score;
        map.set(post.repoFullName, row);
        return map;
      }, new Map<string, { fullName: string; count7d: number; upvotes7d: number }>()),
    )
      .map(([, row]) => row)
      .sort((a, b) => {
        if (b.upvotes7d !== a.upvotes7d) return b.upvotes7d - a.upvotes7d;
        if (b.count7d !== a.count7d) return b.count7d - a.count7d;
        return a.fullName.localeCompare(b.fullName);
      });

    const allPostsOut = allPosts
      .slice()
      .sort((a, b) => {
        if (b.createdUtc !== a.createdUtc) return b.createdUtc - a.createdUtc;
        return b.score - a.score;
      });
    const topPosts = allPosts
      .slice()
      .sort((a, b) => b.trendingScore - a.trendingScore)
      .slice(0, 100);

    const payload = {
      fetchedAt,
      cold: mentions.size === 0,
      authMode: 'oauth' as const,
      successfulSubreddits: SUBREDDITS.length - errors,
      failedSubreddits: errors,
      scannedSubreddits: SUBREDDITS,
      scannedPostsTotal: scannedTotal,
      mentions: mentionsOut,
      allPosts: allPostsOut,
      topPosts,
      leaderboard,
    };

    const result = await writeDataStore('reddit-mentions', payload);

    // Also publish the all-posts slug consumed by /reddit/trending. The
    // legacy script merges this run's posts with the prior payload and
    // prunes anything older than the 7d cutoff, so the slug carries
    // historical depth across runs (some subs flake on individual ticks).
    const previousAllPosts = await readDataStore<RedditAllPostsPayload>('reddit-all-posts');
    const mergedAllPosts = mergeAllPostsPayload(previousAllPosts?.posts ?? [], allPostsOut, cutoff);
    const allPostsPayload: RedditAllPostsPayload = {
      lastFetchedAt: fetchedAt,
      scannedSubreddits: SUBREDDITS,
      windowDays: WINDOW_DAYS,
      totalPosts: mergedAllPosts.length,
      prunedOldPosts: Math.max(
        0,
        (previousAllPosts?.posts.length ?? 0) - mergedAllPosts.length + allPostsOut.length,
      ),
      prunedOverflowPosts: 0,
      posts: mergedAllPosts,
    };
    const allPostsResult = await writeDataStore('reddit-all-posts', allPostsPayload);

    ctx.log.info(
      {
        mentions: mentions.size,
        scanned: scannedTotal,
        errors,
        redis: result.source,
        allPostsRedis: allPostsResult.source,
        allPostsTotal: allPostsPayload.totalPosts,
      },
      'reddit published',
    );
    return done(startedAt, scannedTotal, result.source === 'redis');
  },
};

interface RedditAllPostsPayload {
  lastFetchedAt: string;
  scannedSubreddits: readonly string[];
  windowDays: number;
  totalPosts: number;
  prunedOldPosts: number;
  prunedOverflowPosts: number;
  posts: NormalizedPost[];
}

/**
 * Merge prior all-posts with this run's, dedupe by id (newer wins), drop
 * anything older than the 7d cutoff. Mirrors the script's mergeAllPosts
 * behavior so consumers see historical depth across runs.
 */
function mergeAllPostsPayload(
  previous: NormalizedPost[],
  current: NormalizedPost[],
  cutoffSec: number,
): NormalizedPost[] {
  const byId = new Map<string, NormalizedPost>();
  for (const p of previous) {
    if (!p || typeof p.id !== 'string') continue;
    if (typeof p.createdUtc !== 'number' || p.createdUtc < cutoffSec) continue;
    byId.set(p.id, p);
  }
  for (const p of current) {
    if (!p || typeof p.id !== 'string') continue;
    if (typeof p.createdUtc !== 'number' || p.createdUtc < cutoffSec) continue;
    byId.set(p.id, p);
  }
  return Array.from(byId.values()).sort((a, b) => {
    if (b.createdUtc !== a.createdUtc) return b.createdUtc - a.createdUtc;
    return b.score - a.score;
  });
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export default fetcher;

function done(startedAt: string, items: number, redisPublished: boolean): RunResult {
  return {
    fetcher: 'reddit',
    startedAt,
    finishedAt: new Date().toISOString(),
    itemsSeen: items,
    itemsUpserted: 0,
    metricsWritten: 0,
    redisPublished,
    errors: [],
  };
}
