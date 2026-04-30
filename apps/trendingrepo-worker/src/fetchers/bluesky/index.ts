// Bluesky AT Protocol fetcher.
//
// Cron: 17 * * * * (matches .github/workflows/scrape-bluesky.yml)
//
// Two passes, single session:
//   1. Repo-mentions: searchPosts(q="github.com", sort=latest) up to 3
//      pages × 100 posts. Buckets per tracked repo.
//   2. Topic-trending: BLUESKY_TRENDING_QUERIES queried with sort=top.
//      Deduped by at:// URI across queries.
//
// Outputs:
//   - ss:data:v1:bluesky-mentions  (per-repo mention buckets, last 7d)
//   - ss:data:v1:bluesky-trending  (top-engagement posts across families)

import type { Fetcher, FetcherContext, RunResult } from '../../lib/types.js';
import { writeDataStore } from '../../lib/redis.js';
import {
  BlueskyRateLimitError,
  collectPostUrls,
  createSession,
  deriveBskyUrl,
  searchPostsAllPages,
  type BlueskyPost,
} from '../../lib/sources/bluesky.js';
import { classifyPost } from '../../lib/util/classify-post.js';
import { extractAllRepoMentions } from '../../lib/util/github-repo-links.js';
import { loadTrackedRepos } from '../../lib/util/tracked-repos.js';
import {
  BLUESKY_QUERY_FAMILIES,
  BLUESKY_TRENDING_QUERIES,
  SOURCE_DISCOVERY_VERSION,
} from '../../lib/util/source-watchers.js';

const MENTIONS_WINDOW_DAYS = 7;
const MENTIONS_WINDOW_SECONDS = MENTIONS_WINDOW_DAYS * 24 * 60 * 60;
const REPO_QUERY = 'github.com';
const REPO_MAX_PAGES = 3;
const REPO_PAGE_LIMIT = 100;
const QUERY_LIMIT = 50;
const POST_TEXT_MAX_CHARS = 500;

interface NormalizedPost {
  uri: string;
  cid: string;
  bskyUrl: string;
  text: string;
  author: { handle: string; displayName?: string };
  likeCount: number;
  repostCount: number;
  replyCount: number;
  createdAt: string;
  createdUtc: number;
  ageHours: number;
  trendingScore: number;
  content_tags: string[];
  value_score: number;
  linkedRepos: Array<{ fullName: string; matchType: 'url'; confidence: number }>;
  matchedKeyword?: string;
  matchedQuery?: string;
  matchedTopicId?: string;
  matchedTopicLabel?: string;
}

function stripPostText(raw: string): string {
  if (!raw || typeof raw !== 'string') return '';
  return raw.replace(/\s+/g, ' ').trim().slice(0, POST_TEXT_MAX_CHARS);
}

function computeTrendingScore(likeCount: number, repostCount: number, replyCount: number): number {
  const l = Number.isFinite(likeCount) ? likeCount : 0;
  const r = Number.isFinite(repostCount) ? repostCount : 0;
  const c = Number.isFinite(replyCount) ? replyCount : 0;
  return Math.round((l + 2 * r + 0.5 * c) * 100) / 100;
}

function normalizePost(post: BlueskyPost, tracked: Map<string, string>, nowSec: number): NormalizedPost | null {
  if (!post || typeof post !== 'object') return null;
  if (typeof post.uri !== 'string' || !post.uri) return null;
  if (typeof post.cid !== 'string' || !post.cid) return null;

  const record = post.record && typeof post.record === 'object' ? post.record : {};
  const createdIso =
    typeof record.createdAt === 'string'
      ? record.createdAt
      : typeof post.indexedAt === 'string'
        ? post.indexedAt
        : null;
  if (!createdIso) return null;
  const createdMs = Date.parse(createdIso);
  if (!Number.isFinite(createdMs)) return null;
  const createdUtc = Math.floor(createdMs / 1000);

  const text = typeof record.text === 'string' ? record.text : '';
  const embedUrls = collectPostUrls(post);
  const textBlob = `${text}\n${embedUrls.join('\n')}`;

  const linkedLower = extractAllRepoMentions(textBlob, tracked);
  const linkedRepos = Array.from(linkedLower, (lower) => ({
    fullName: tracked.get(lower) ?? lower,
    matchType: 'url' as const,
    confidence: 1.0,
  }));

  const classification = classifyPost({
    title: text.slice(0, 140),
    selftext: text,
    url: embedUrls[0] ?? '',
    platform: 'bsky',
  });

  const likeCount = Number.isFinite(post.likeCount) ? Number(post.likeCount) : 0;
  const repostCount = Number.isFinite(post.repostCount) ? Number(post.repostCount) : 0;
  const replyCount = Number.isFinite(post.replyCount) ? Number(post.replyCount) : 0;

  const ageSec = Math.max(0, nowSec - createdUtc);
  const ageHours = Math.max(0.5, ageSec / 3600);
  const trendingScore = computeTrendingScore(likeCount, repostCount, replyCount);

  const authorHandle = String(post.author?.handle ?? '');
  const authorDisplay = String(post.author?.displayName ?? '');

  return {
    uri: post.uri,
    cid: post.cid,
    bskyUrl: deriveBskyUrl(post.uri, authorHandle || post.author?.did),
    text: stripPostText(text),
    author: {
      handle: authorHandle,
      ...(authorDisplay ? { displayName: authorDisplay } : {}),
    },
    likeCount,
    repostCount,
    replyCount,
    createdAt: createdIso,
    createdUtc,
    ageHours: Math.round(ageHours * 100) / 100,
    trendingScore,
    content_tags: classification.content_tags,
    value_score: classification.value_score,
    linkedRepos,
  };
}

const fetcher: Fetcher = {
  name: 'bluesky',
  schedule: '17 * * * *',
  async run(ctx: FetcherContext): Promise<RunResult> {
    const startedAt = new Date().toISOString();

    if (ctx.dryRun) {
      ctx.log.info('bluesky dry-run');
      return done(startedAt, 0, false);
    }

    const handle = process.env.BLUESKY_HANDLE;
    const password = process.env.BLUESKY_APP_PASSWORD;
    if (!handle || !password) {
      ctx.log.warn('bluesky: BLUESKY_HANDLE / BLUESKY_APP_PASSWORD not set - skipping');
      return done(startedAt, 0, false);
    }

    const tracked = await loadTrackedRepos({ log: ctx.log });
    if (tracked.size === 0) {
      ctx.log.warn('bluesky: tracked repos map is empty (Redis trending slug missing?) - mentions pass will yield nothing');
    }

    const session = await createSession(ctx.http, handle, password);
    ctx.log.info({ handle: session.handle, did: session.did?.slice(0, 28) }, 'bluesky session');

    const fetchedAt = new Date().toISOString();
    const nowSec = Math.floor(Date.now() / 1000);
    const mentionsCutoff = nowSec - MENTIONS_WINDOW_SECONDS;

    // Repo-mentions pass.
    let rawMentionPosts: BlueskyPost[] = [];
    let mentionsPagesFetched = 0;
    try {
      const res = await searchPostsAllPages({
        http: ctx.http,
        accessJwt: session.accessJwt,
        q: REPO_QUERY,
        sort: 'latest',
        limit: REPO_PAGE_LIMIT,
        maxPages: REPO_MAX_PAGES,
      });
      rawMentionPosts = res.posts;
      mentionsPagesFetched = res.pagesFetched;
    } catch (err) {
      if (err instanceof BlueskyRateLimitError) {
        ctx.log.warn({ err: err.message }, 'bluesky: rate-limited during mentions pass');
      } else {
        throw err;
      }
    }

    // Topic-trending pass.
    const trendingByUri = new Map<string, NormalizedPost>();
    const keywordCounts: Record<string, number> = Object.fromEntries(
      BLUESKY_QUERY_FAMILIES.map((f) => [f.label, 0]),
    );
    const queryCounts: Record<string, number> = {};

    for (const queryDef of BLUESKY_TRENDING_QUERIES) {
      const { familyId, familyLabel, query } = queryDef;
      try {
        const res = await searchPostsAllPages({
          http: ctx.http,
          accessJwt: session.accessJwt,
          q: query,
          sort: 'top',
          limit: QUERY_LIMIT,
          maxPages: 1,
        });
        queryCounts[query] = res.posts.length;
        keywordCounts[familyLabel] = (keywordCounts[familyLabel] ?? 0) + res.posts.length;
        for (const raw of res.posts) {
          const n = normalizePost(raw, tracked, nowSec);
          if (!n) continue;
          if (trendingByUri.has(n.uri)) continue;
          n.matchedKeyword = familyLabel;
          n.matchedQuery = query;
          n.matchedTopicId = familyId;
          n.matchedTopicLabel = familyLabel;
          trendingByUri.set(n.uri, n);
        }
      } catch (err) {
        if (err instanceof BlueskyRateLimitError) {
          ctx.log.warn({ query, err: err.message }, 'bluesky: rate-limited mid-loop, stopping');
          break;
        }
        throw err;
      }
    }

    // Bucket mentions.
    const normalizedMentionPosts: NormalizedPost[] = [];
    for (const raw of rawMentionPosts) {
      const n = normalizePost(raw, tracked, nowSec);
      if (!n) continue;
      if (n.createdUtc < mentionsCutoff) continue;
      if (!n.linkedRepos || n.linkedRepos.length === 0) continue;
      normalizedMentionPosts.push(n);
    }
    const dedupedByUri = new Map<string, NormalizedPost>();
    for (const p of normalizedMentionPosts) {
      if (!dedupedByUri.has(p.uri)) dedupedByUri.set(p.uri, p);
    }

    interface MentionBucket {
      count7d: number;
      likesSum7d: number;
      repostsSum7d: number;
      repliesSum7d: number;
      topPost: unknown;
      posts: NormalizedPost[];
    }
    const mentions: Record<string, MentionBucket> = {};
    const leaderboardMap = new Map<string, { fullName: string; count7d: number; likesSum7d: number }>();

    for (const post of dedupedByUri.values()) {
      for (const repo of post.linkedRepos) {
        const full = repo.fullName;
        let bucket = mentions[full];
        if (!bucket) {
          bucket = {
            count7d: 0,
            likesSum7d: 0,
            repostsSum7d: 0,
            repliesSum7d: 0,
            topPost: null,
            posts: [],
          };
          mentions[full] = bucket;
        }
        bucket.count7d += 1;
        bucket.likesSum7d += post.likeCount;
        bucket.repostsSum7d += post.repostCount;
        bucket.repliesSum7d += post.replyCount;
        bucket.posts.push(post);

        const lb = leaderboardMap.get(full) ?? { fullName: full, count7d: 0, likesSum7d: 0 };
        lb.count7d += 1;
        lb.likesSum7d += post.likeCount;
        leaderboardMap.set(full, lb);
      }
    }

    for (const bucket of Object.values(mentions)) {
      bucket.posts.sort((a, b) => {
        if (b.likeCount !== a.likeCount) return b.likeCount - a.likeCount;
        return b.repostCount - a.repostCount;
      });
      const top = bucket.posts[0];
      if (top) {
        bucket.topPost = {
          uri: top.uri,
          cid: top.cid,
          bskyUrl: top.bskyUrl,
          text: top.text,
          author: top.author,
          likeCount: top.likeCount,
          repostCount: top.repostCount,
          replyCount: top.replyCount,
          createdAt: top.createdAt,
          hoursSincePosted: top.ageHours,
        };
      }
    }

    const leaderboard = Array.from(leaderboardMap.values()).sort((a, b) => {
      if (b.likesSum7d !== a.likesSum7d) return b.likesSum7d - a.likesSum7d;
      if (b.count7d !== a.count7d) return b.count7d - a.count7d;
      return a.fullName.localeCompare(b.fullName);
    });

    const trendingMerged = Array.from(trendingByUri.values()).sort(
      (a, b) => b.trendingScore - a.trendingScore,
    );

    const mentionsPayload = {
      fetchedAt,
      windowDays: MENTIONS_WINDOW_DAYS,
      scannedPosts: rawMentionPosts.length,
      searchQuery: REPO_QUERY,
      pagesFetched: mentionsPagesFetched,
      mentions,
      leaderboard,
    };
    const trendingPayload = {
      fetchedAt,
      discoveryVersion: SOURCE_DISCOVERY_VERSION,
      keywords: BLUESKY_QUERY_FAMILIES.map((f) => f.label),
      keywordCounts,
      queries: BLUESKY_TRENDING_QUERIES.map((q) => q.query),
      queryCounts,
      queryFamilies: BLUESKY_QUERY_FAMILIES,
      scannedPosts: trendingByUri.size,
      posts: trendingMerged,
    };

    const mentionsResult = await writeDataStore('bluesky-mentions', mentionsPayload);
    const trendingResult = await writeDataStore('bluesky-trending', trendingPayload);

    const itemsSeen = rawMentionPosts.length + trendingByUri.size;
    ctx.log.info(
      {
        mentions: Object.keys(mentions).length,
        trending: trendingMerged.length,
        mentionsRedis: mentionsResult.source,
        trendingRedis: trendingResult.source,
      },
      'bluesky published',
    );
    return done(
      startedAt,
      itemsSeen,
      mentionsResult.source === 'redis' || trendingResult.source === 'redis',
    );
  },
};

export default fetcher;

function done(startedAt: string, items: number, redisPublished: boolean): RunResult {
  return {
    fetcher: 'bluesky',
    startedAt,
    finishedAt: new Date().toISOString(),
    itemsSeen: items,
    itemsUpserted: 0,
    metricsWritten: 0,
    redisPublished,
    errors: [],
  };
}
