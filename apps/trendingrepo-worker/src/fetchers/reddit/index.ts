// Reddit fetcher (simplified port of scripts/scrape-reddit.mjs).
//
// Cron: 27 * * * * (matches scripts/scrape-trending.yml which runs scrape-reddit.mjs).
//
// Scope notes vs the script port:
//   - Alias matchers (repo_name / project_name / package_name / homepage_domain
//     / owner_context) require repo-metadata + npm-packages snapshots that the
//     worker doesn't load yet. We keep ONLY the github.com/<owner>/<repo>
//     URL extraction path. Coverage stays correct for any post that pasted
//     the link; the alias-matcher tier rejoins once those slugs are loadable.
//   - Baseline ratios depend on reddit-baselines.json (currently a separate
//     baselines workflow). We omit baseline fields here; consumers fall back
//     to no-baseline tier (UI marks "niche sub").
//   - The all-posts merge mode + merge slug stay in scrape-reddit.mjs for
//     now; the worker only publishes the primary mentions slug.
//
// Output:
//   - ss:data:v1:reddit-mentions  (per-repo mention buckets, 7d window)

import type { Fetcher, FetcherContext, RunResult } from '../../lib/types.js';
import { readDataStore, writeDataStore } from '../../lib/redis.js';
import { classifyPost } from '../../lib/util/classify-post.js';
import { extractAllRepoMentions } from '../../lib/util/github-repo-links.js';
import { loadTrackedRepos } from '../../lib/util/tracked-repos.js';
import { SUBREDDITS } from '../../lib/util/source-watchers.js';
import {
  REQUEST_PAUSE_MS,
  fetchRedditJson,
  getRedditAuthMode,
  getRedditFetchRuntime,
  resetRedditFetchRuntime,
  sleep,
  type RedditPostData,
} from '../../lib/sources/reddit.js';
import { isApifyProxyEnabled } from '../../lib/util/apify-proxy.js';

// F2 dual-key transition: stable repoId derived from fullName.
// MUST match src/lib/utils.ts:slugToId so consumers can index by repoId
// without needing the original fullName.
function slugIdFromFullName(fullName: string): string {
  return String(fullName)
    .toLowerCase()
    .replace(/\//g, '--')
    .replace(/\./g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

const POSTS_PER_SUB = 100;
const WINDOW_DAYS = 7;
const WINDOW_SECONDS = WINDOW_DAYS * 24 * 60 * 60;
const RATE_LIMIT_BACKOFF_MS = 65_000;

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
  const text = `${post.title ?? ''}\n${post.url ?? ''}\n${post.selftext ?? ''}`;
  const lower = extractAllRepoMentions(text, tracked.size > 0 ? tracked : null);
  // Map to canonical casing
  return Array.from(lower, (l) => tracked.get(l) ?? l);
}

async function fetchSubredditNew(sub: string, log: FetcherContext['log']): Promise<RedditPostData[]> {
  const url = `https://www.reddit.com/r/${sub}/new.json?limit=${POSTS_PER_SUB}`;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const body = await fetchRedditJson(url);
      const children = body?.data?.children;
      if (!Array.isArray(children)) {
        throw new Error(`r/${sub}: malformed response (no data.children)`);
      }
      return children.map((c) => c.data).filter((p) => p && typeof p === 'object');
    } catch (err) {
      const status = (err as Error & { status?: number }).status;
      if (status !== 429 || attempt === 1) throw err;
      log.warn({ sub, backoffMs: RATE_LIMIT_BACKOFF_MS }, 'reddit 429 - sleeping before retry');
      await sleep(RATE_LIMIT_BACKOFF_MS);
    }
  }
  return [];
}

const fetcher: Fetcher = {
  name: 'reddit',
  // Staggered to :30 (was :27 — clustered with 3 others; reddit alone is
  // ~225s and was contending for the same TCP/Redis pipeline). Trustmrr
  // still runs at :27 because its hour-02 full sweep needs the most
  // headroom.
  schedule: '30 * * * *',
  async run(ctx: FetcherContext): Promise<RunResult> {
    const startedAt = new Date().toISOString();
    if (ctx.dryRun) {
      ctx.log.info('reddit dry-run');
      return done(startedAt, 0, false);
    }

    resetRedditFetchRuntime();
    ctx.log.info(
      { authMode: getRedditAuthMode(), apifyProxy: isApifyProxyEnabled() },
      'reddit: starting',
    );

    const tracked = await loadTrackedRepos({ log: ctx.log });
    if (tracked.size === 0) {
      ctx.log.warn('reddit: tracked repos map empty - mentions buckets will be empty');
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
        const posts = await fetchSubredditNew(sub, ctx.log);
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
          const score = Number.isFinite(p.score) ? Number(p.score) : 0;
          const { ageHours, velocity, logMagnitude } = computeVelocityFields(score, p.created_utc);
          // No baselines on the worker — collapse to log10-based score.
          const trendingScore = Math.round(velocity * logMagnitude * 100) / 100;

          const classification = classifyPost({
            title: rawTitle,
            selftext: rawSelftext,
            url: rawUrl,
            linkFlairText: p.link_flair_text ?? null,
          });

          const normalized: NormalizedPost = {
            id: String(p.id),
            subreddit: subName,
            title: rawTitle.slice(0, 300),
            url: rawUrl,
            permalink: p.permalink ? `https://www.reddit.com${p.permalink}` : '',
            score,
            numComments: Number.isFinite(p.num_comments) ? Number(p.num_comments) : 0,
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

    const mentionsOut: Record<string, { count7d: number; upvotes7d: number; posts: NormalizedPost[] }> = {};
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

    const runtime = getRedditFetchRuntime();
    const payload = {
      fetchedAt,
      cold: mentions.size === 0,
      authMode: getRedditAuthMode(),
      effectiveFetchMode: runtime.activeMode ?? getRedditAuthMode(),
      fallbackUsed: runtime.fallbackUsed,
      oauthFailures: runtime.oauthFailures,
      apifyProxyUsed: runtime.apifyProxyUsed,
      successfulSubreddits: SUBREDDITS.length - errors,
      failedSubreddits: errors,
      oauthRequests: runtime.oauthRequests,
      publicRequests: runtime.publicRequests,
      scannedSubreddits: SUBREDDITS,
      scannedPostsTotal: scannedTotal,
      mentions: mentionsOut,
      mentionsByRepoId: Object.fromEntries(
        Object.entries(mentionsOut).map(([fullName, value]) => [
          slugIdFromFullName(fullName),
          value,
        ]),
      ),
      allPosts: allPostsOut,
      topPosts,
      leaderboard,
    };

    const result = await writeDataStore('reddit-mentions', payload);

    // Also publish the all-posts slug consumed by /reddit/trending. The
    // legacy script merges this run's posts with the prior payload and
    // prunes anything older than the 7d cutoff, so the slug carries
    // historical depth across runs (some subs flake on individual ticks).
    // Replicating that here so Phase D archive of the script doesn't
    // freeze the consumer page.
    const previousAllPosts = await readDataStore<RedditAllPostsPayload>('reddit-all-posts');
    const mergedAllPosts = mergeAllPostsPayload(previousAllPosts?.posts ?? [], allPostsOut, cutoff);
    const allPostsPayload: RedditAllPostsPayload = {
      lastFetchedAt: fetchedAt,
      scannedSubreddits: SUBREDDITS,
      windowDays: WINDOW_DAYS,
      totalPosts: mergedAllPosts.length,
      prunedOldPosts: Math.max(0, (previousAllPosts?.posts.length ?? 0) - mergedAllPosts.length + allPostsOut.length),
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
  // Current overrides previous for any matching id (latest score/comments).
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
