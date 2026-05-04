// Dev.to fetcher.
//
// Cron: 30 8 * * * (matches .github/workflows/scrape-devto.yml)
//
// Two passes:
//   1. Discovery — curated popularity/state/tag slices, dedupe by id.
//   2. Body fetch — /articles/{id} for each unique id (5 req/sec). On
//      consecutive 429/5xx batches we fall back to description-only.
//
// Outputs:
//   - ss:data:v1:devto-mentions  (per-repo article buckets, last 7d)
//   - ss:data:v1:devto-trending  (top AI/dev articles regardless of repo link)

import type { Fetcher, FetcherContext, RunResult } from '../../lib/types.js';
import { writeDataStore } from '../../lib/redis.js';
import {
  fetchArticleList,
  fetchDetailsBatched,
  sleep,
  DEVTO_PAUSE_MS,
  devtoKeyPoolSize,
  type DevtoArticle,
} from '../../lib/sources/devto.js';
import { extractAllRepoMentions } from '../../lib/util/github-repo-links.js';
import { loadTrackedRepos } from '../../lib/util/tracked-repos.js';
import {
  DEVTO_DISCOVERY_SLICES,
  DEVTO_PRIORITY_TAGS,
  SOURCE_DISCOVERY_VERSION,
} from '../../lib/util/source-watchers.js';

const WINDOW_DAYS = 7;
const PER_PAGE = 100;
const TRENDING_KEEP = 100;
const DESCRIPTION_TRUNCATE = 280;

interface NormalizedArticle {
  id: number;
  title: string;
  description: string;
  url: string;
  author: { username: string; name: string; profileImage: string };
  reactionsCount: number;
  commentsCount: number;
  readingTime: number;
  publishedAt: string;
  tags: string[];
  trendingScore: number;
  linkedRepos: Array<{ fullName: string; location: 'title' | 'description' | 'tag' | 'body' }>;
}

function computeTrendingScore(
  reactions: number,
  comments: number,
  publishedAtIso: string,
  nowMs = Date.now(),
): number {
  const publishedMs = Date.parse(publishedAtIso);
  if (!Number.isFinite(publishedMs)) return 0;
  const ageHours = Math.max(0.5, (nowMs - publishedMs) / (1000 * 60 * 60));
  const velocity = reactions / ageHours;
  const logMag = Math.log10(Math.max(1, reactions));
  const commentBoost = 1 + (Number.isFinite(comments) ? comments : 0) / 10;
  return Math.round(velocity * logMag * commentBoost * 100) / 100;
}

function classifyMentionLocation(args: {
  title: string;
  description: string;
  tags: string[];
  body: string | null;
  fullNameLower: string;
}): 'title' | 'description' | 'tag' | 'body' {
  const { title, description, tags, body, fullNameLower } = args;
  const re = new RegExp(
    `github\\.com\\/${fullNameLower.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}(?![A-Za-z0-9._-])`,
    'i',
  );
  if (title && re.test(title)) return 'title';
  if (description && re.test(description)) return 'description';
  if (Array.isArray(tags)) {
    const repoName = fullNameLower.split('/')[1] ?? '';
    for (const tag of tags) {
      if (typeof tag === 'string' && tag.toLowerCase() === repoName) {
        return 'tag';
      }
    }
  }
  if (body && re.test(body)) return 'body';
  return 'body';
}

function normalizeArticle(
  raw: DevtoArticle,
  args: { tracked: Map<string, string>; body: string | null; nowMs?: number },
): NormalizedArticle | null {
  const { tracked, body, nowMs = Date.now() } = args;
  if (!raw || typeof raw !== 'object') return null;
  const id = Number(raw.id);
  if (!Number.isFinite(id) || id <= 0) return null;

  const title = String(raw.title ?? '');
  const description = String(raw.description ?? '');
  const url = String(raw.url ?? '');
  const tags = Array.isArray(raw.tag_list)
    ? raw.tag_list.map((t) => String(t).toLowerCase())
    : [];
  const reactions = Number.isFinite(raw.public_reactions_count)
    ? Number(raw.public_reactions_count)
    : 0;
  const comments = Number.isFinite(raw.comments_count) ? Number(raw.comments_count) : 0;
  const readingTime = Number.isFinite(raw.reading_time_minutes)
    ? Number(raw.reading_time_minutes)
    : 0;
  const publishedAt = String(raw.published_at ?? raw.created_at ?? '');
  const author = {
    username: String(raw.user?.username ?? ''),
    name: String(raw.user?.name ?? ''),
    profileImage: String(raw.user?.profile_image_90 ?? raw.user?.profile_image ?? ''),
  };

  const blob = `${title}\n${description}\n${tags.join(' ')}\n${body ?? ''}`;
  const linkedLower = extractAllRepoMentions(blob, tracked.size > 0 ? tracked : null);
  const linkedRepos = Array.from(linkedLower, (lower) => ({
    fullName: tracked.get(lower) ?? lower,
    location: classifyMentionLocation({
      title,
      description,
      tags,
      body,
      fullNameLower: lower,
    }),
  }));

  return {
    id,
    title: title.slice(0, 300),
    description: description.slice(0, DESCRIPTION_TRUNCATE),
    url,
    author,
    reactionsCount: reactions,
    commentsCount: comments,
    readingTime,
    publishedAt,
    tags,
    trendingScore: computeTrendingScore(reactions, comments, publishedAt, nowMs),
    linkedRepos,
  };
}

const fetcher: Fetcher = {
  name: 'devto',
  schedule: '30 8 * * *',
  async run(ctx: FetcherContext): Promise<RunResult> {
    const startedAt = new Date().toISOString();
    if (ctx.dryRun) {
      ctx.log.info('devto dry-run');
      return done(startedAt, 0, false);
    }

    ctx.log.info({ keyPoolSize: devtoKeyPoolSize() }, 'devto: starting');

    const tracked = await loadTrackedRepos({ log: ctx.log });
    if (tracked.size === 0) {
      ctx.log.warn('devto: tracked repos map empty - mentions buckets will be empty');
    }

    const fetchedAt = new Date().toISOString();
    const nowMs = Date.now();

    // Discovery pass.
    const byId = new Map<number, DevtoArticle>();
    const sliceCounts: Record<string, number> = {};
    for (const slice of DEVTO_DISCOVERY_SLICES) {
      try {
        const list = await fetchArticleList({
          http: ctx.http,
          tag: slice.tag,
          top: slice.top,
          state: slice.state,
          perPage: PER_PAGE,
        });
        for (const a of list) {
          if (!a || typeof a.id !== 'number') continue;
          if (!byId.has(a.id)) byId.set(a.id, a);
        }
        sliceCounts[slice.id] = list.length;
        ctx.log.debug({ slice: slice.id, fetched: list.length, cumulative: byId.size }, 'devto slice');
      } catch (err) {
        ctx.log.warn({ slice: slice.id, err: (err as Error).message }, 'devto slice failed');
      }
      await sleep(DEVTO_PAUSE_MS);
    }

    if (byId.size === 0) {
      ctx.log.warn('devto: discovery returned zero articles');
      return done(startedAt, 0, false);
    }

    // Body fetch pass.
    const ids = Array.from(byId.keys());
    const { details, errors: bodyErrors, aborted } = await fetchDetailsBatched({
      http: ctx.http,
      ids,
    });
    const bodyFetchMode = !aborted ? 'full' : details.length > 0 ? 'partial' : 'description-only';
    ctx.log.info({ fetched: details.length, total: ids.length, errors: bodyErrors, mode: bodyFetchMode }, 'devto bodies');

    const bodyById = new Map<number, string>();
    for (const d of details) {
      if (d && typeof d.id === 'number') {
        bodyById.set(d.id, String(d.body_markdown ?? ''));
      }
    }

    // Normalize.
    const normalized: NormalizedArticle[] = [];
    for (const [id, raw] of byId) {
      const body = bodyById.get(id) ?? null;
      const n = normalizeArticle(raw, { tracked, body, nowMs });
      if (n) normalized.push(n);
    }

    // Mentions map.
    interface MentionBucket {
      count7d: number;
      reactionsSum7d: number;
      commentsSum7d: number;
      topArticle: unknown;
      articles: NormalizedArticle[];
    }
    const mentions: Record<string, MentionBucket> = {};
    const leaderboardMap = new Map<string, { fullName: string; count7d: number; reactionsSum7d: number }>();

    for (const article of normalized) {
      if (!article.linkedRepos.length) continue;
      for (const repo of article.linkedRepos) {
        const full = repo.fullName;
        let bucket = mentions[full];
        if (!bucket) {
          bucket = {
            count7d: 0,
            reactionsSum7d: 0,
            commentsSum7d: 0,
            topArticle: null,
            articles: [],
          };
          mentions[full] = bucket;
        }
        bucket.count7d += 1;
        bucket.reactionsSum7d += article.reactionsCount;
        bucket.commentsSum7d += article.commentsCount;
        bucket.articles.push(article);

        const lb = leaderboardMap.get(full) ?? { fullName: full, count7d: 0, reactionsSum7d: 0 };
        lb.count7d += 1;
        lb.reactionsSum7d += article.reactionsCount;
        leaderboardMap.set(full, lb);
      }
    }

    for (const bucket of Object.values(mentions)) {
      bucket.articles.sort((a, b) => b.reactionsCount - a.reactionsCount);
      const top = bucket.articles[0];
      if (top) {
        const ageMs = nowMs - Date.parse(top.publishedAt);
        const hoursSincePosted = Number.isFinite(ageMs)
          ? Math.round((ageMs / 3600000) * 10) / 10
          : null;
        bucket.topArticle = {
          id: top.id,
          title: top.title,
          url: top.url,
          author: top.author.username,
          reactions: top.reactionsCount,
          comments: top.commentsCount,
          hoursSincePosted,
          readingTime: top.readingTime,
        };
      }
    }

    const leaderboard = Array.from(leaderboardMap.values()).sort((a, b) => {
      if (b.reactionsSum7d !== a.reactionsSum7d) return b.reactionsSum7d - a.reactionsSum7d;
      if (b.count7d !== a.count7d) return b.count7d - a.count7d;
      return a.fullName.localeCompare(b.fullName);
    });

    const trendingArticles = normalized
      .slice()
      .sort((a, b) => b.trendingScore - a.trendingScore)
      .slice(0, TRENDING_KEEP);

    const mentionsPayload = {
      fetchedAt,
      discoveryVersion: SOURCE_DISCOVERY_VERSION,
      windowDays: WINDOW_DAYS,
      scannedArticles: normalized.length,
      bodyFetchMode,
      priorityTags: DEVTO_PRIORITY_TAGS,
      discoverySlices: DEVTO_DISCOVERY_SLICES,
      sliceCounts,
      mentions,
      leaderboard,
    };
    const trendingPayload = {
      fetchedAt,
      discoveryVersion: SOURCE_DISCOVERY_VERSION,
      windowDays: WINDOW_DAYS,
      scannedArticles: normalized.length,
      bodyFetchMode,
      priorityTags: DEVTO_PRIORITY_TAGS,
      discoverySlices: DEVTO_DISCOVERY_SLICES,
      sliceCounts,
      articles: trendingArticles,
    };

    const mentionsResult = await writeDataStore('devto-mentions', mentionsPayload);
    const trendingResult = await writeDataStore('devto-trending', trendingPayload);

    ctx.log.info(
      {
        mentions: Object.keys(mentions).length,
        trending: trendingArticles.length,
        mentionsRedis: mentionsResult.source,
        trendingRedis: trendingResult.source,
      },
      'devto published',
    );
    return done(
      startedAt,
      normalized.length,
      mentionsResult.source === 'redis' || trendingResult.source === 'redis',
    );
  },
};

export default fetcher;

function done(startedAt: string, items: number, redisPublished: boolean): RunResult {
  return {
    fetcher: 'devto',
    startedAt,
    finishedAt: new Date().toISOString(),
    itemsSeen: items,
    itemsUpserted: 0,
    metricsWritten: 0,
    redisPublished,
    errors: [],
  };
}
