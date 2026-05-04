// Lobsters fetcher.
//
// Cron: 37 * * * * (matches .github/workflows/scrape-lobsters.yml)
//
// Lobsters has no official authenticated API. We pull hottest, active, and
// 3 pages of newest as JSON. Outputs:
//   - ss:data:v1:lobsters-trending  (stories last 72h, velocity-scored)
//   - ss:data:v1:lobsters-mentions  (per-repo mention buckets last 7d)

import type { Fetcher, FetcherContext, RunResult } from '../../lib/types.js';
import { writeDataStore } from '../../lib/redis.js';
import { extractAllRepoMentions } from '../../lib/util/github-repo-links.js';
import { loadTrackedRepos } from '../../lib/util/tracked-repos.js';

const USER_AGENT =
  'StarScreener-worker/0.1 (+https://github.com/0motionguy/starscreener; lobsters)';
const TRENDING_WINDOW_HOURS = 72;
const MENTIONS_WINDOW_DAYS = 7;
const TRENDING_WINDOW_SECONDS = TRENDING_WINDOW_HOURS * 60 * 60;
const MENTIONS_WINDOW_SECONDS = MENTIONS_WINDOW_DAYS * 24 * 60 * 60;
const NEWEST_PAGES = 3;
const PER_REQUEST_DELAY_MS = 400;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

interface LobstersStoryRaw {
  short_id?: string;
  id?: string | number;
  created_at?: string;
  title?: string;
  url?: string;
  description?: string;
  score?: number;
  comment_count?: number;
  tags?: string[];
  user?: string;
  submitter_user?: { username?: string };
  comments_url?: string;
}

interface NormalizedStory {
  shortId: string;
  title: string;
  url: string;
  commentsUrl: string;
  by: string;
  score: number;
  commentCount: number;
  createdUtc: number;
  ageHours: number;
  trendingScore: number;
  tags: string[];
  description: string;
  linkedRepos: Array<{ fullName: string; matchType: 'url'; confidence: number }>;
}

function normalizeStory(
  raw: LobstersStoryRaw,
  tracked: Map<string, string>,
  nowSec: number,
): NormalizedStory | null {
  if (!raw || typeof raw !== 'object') return null;
  const shortId = String(raw.short_id ?? raw.id ?? '');
  if (!shortId) return null;

  const createdAt = raw.created_at ? Date.parse(raw.created_at) : NaN;
  if (!Number.isFinite(createdAt)) return null;
  const createdUtc = Math.floor(createdAt / 1000);

  const title = String(raw.title ?? '');
  const url = String(raw.url ?? '');
  const description = String(raw.description ?? '');
  const score = Number.isFinite(raw.score) ? Number(raw.score) : 0;
  const commentCount = Number.isFinite(raw.comment_count) ? Number(raw.comment_count) : 0;
  const tags = Array.isArray(raw.tags) ? raw.tags.map(String) : [];
  const user = raw.submitter_user?.username ?? raw.user ?? '';
  const commentsUrl = String(raw.comments_url ?? `https://lobste.rs/s/${shortId}`);

  const ageSec = Math.max(1, nowSec - createdUtc);
  const ageHours = ageSec / 3600;
  const trendingScore = score / Math.pow(ageHours + 2, 1.5);

  const blob = `${title}\n${url}\n${description}`;
  const linkedLower = extractAllRepoMentions(blob, tracked.size > 0 ? tracked : null);
  const linkedRepos = Array.from(linkedLower, (lower) => ({
    fullName: tracked.get(lower) ?? lower,
    matchType: 'url' as const,
    confidence: 1.0,
  }));

  return {
    shortId,
    title: title.slice(0, 300),
    url,
    commentsUrl,
    by: user,
    score,
    commentCount,
    createdUtc,
    ageHours,
    trendingScore,
    tags,
    description: description.slice(0, 500),
    linkedRepos,
  };
}

const fetcher: Fetcher = {
  name: 'lobsters',
  schedule: '37 * * * *',
  async run(ctx: FetcherContext): Promise<RunResult> {
    const startedAt = new Date().toISOString();
    if (ctx.dryRun) {
      ctx.log.info('lobsters dry-run');
      return done(startedAt, 0, false);
    }

    const tracked = await loadTrackedRepos({ log: ctx.log });
    if (tracked.size === 0) {
      ctx.log.warn('lobsters: tracked repos map empty - mentions buckets will be empty');
    }

    const fetchedAt = new Date().toISOString();
    const nowSec = Math.floor(Date.now() / 1000);
    const trendingCutoff = nowSec - TRENDING_WINDOW_SECONDS;
    const mentionsCutoff = nowSec - MENTIONS_WINDOW_SECONDS;

    const feedUrls: string[] = [
      'https://lobste.rs/hottest.json',
      'https://lobste.rs/active.json',
    ];
    for (let i = 1; i <= NEWEST_PAGES; i += 1) {
      feedUrls.push(`https://lobste.rs/newest/page/${i}.json`);
    }

    const seen = new Set<string>();
    const stories: NormalizedStory[] = [];
    for (const url of feedUrls) {
      try {
        const { data } = await ctx.http.json<LobstersStoryRaw[]>(url, {
          headers: {
            'user-agent': USER_AGENT,
            accept: 'application/json',
          },
          useEtagCache: false,
          timeoutMs: 15_000,
        });
        if (!Array.isArray(data)) {
          ctx.log.warn({ url }, 'lobsters: non-array response, skipping');
          continue;
        }
        for (const raw of data) {
          const norm = normalizeStory(raw, tracked, nowSec);
          if (!norm) continue;
          if (seen.has(norm.shortId)) continue;
          seen.add(norm.shortId);
          stories.push(norm);
        }
        ctx.log.debug({ url, raw: data.length, totalUnique: stories.length }, 'lobsters page');
      } catch (err) {
        ctx.log.warn({ url, err: (err as Error).message }, 'lobsters page failed');
      }
      await sleep(PER_REQUEST_DELAY_MS);
    }

    if (stories.length === 0) {
      ctx.log.warn('lobsters: zero stories fetched');
      return done(startedAt, 0, false);
    }

    const trendingStories = stories
      .filter((s) => s.createdUtc >= trendingCutoff)
      .sort((a, b) => b.trendingScore - a.trendingScore);

    interface MentionBucket {
      count7d: number;
      scoreSum7d: number;
      topStory: unknown;
      stories: NormalizedStory[];
    }
    const mentions: Record<string, MentionBucket> = {};
    const leaderboardMap = new Map<string, { fullName: string; count7d: number; scoreSum7d: number }>();
    const mentionEligible = stories.filter(
      (s) => s.createdUtc >= mentionsCutoff && s.linkedRepos.length > 0,
    );

    for (const story of mentionEligible) {
      for (const repo of story.linkedRepos) {
        const full = repo.fullName;
        let bucket = mentions[full];
        if (!bucket) {
          bucket = { count7d: 0, scoreSum7d: 0, topStory: null, stories: [] };
          mentions[full] = bucket;
        }
        bucket.count7d += 1;
        bucket.scoreSum7d += story.score;
        bucket.stories.push(story);

        const lb = leaderboardMap.get(full) ?? { fullName: full, count7d: 0, scoreSum7d: 0 };
        lb.count7d += 1;
        lb.scoreSum7d += story.score;
        leaderboardMap.set(full, lb);
      }
    }

    for (const bucket of Object.values(mentions)) {
      bucket.stories.sort((a, b) => b.score - a.score);
      const top = bucket.stories[0];
      if (top) {
        bucket.topStory = {
          shortId: top.shortId,
          title: top.title,
          score: top.score,
          url: top.url,
          commentsUrl: top.commentsUrl,
          hoursSincePosted: top.ageHours,
        };
      }
    }

    const leaderboard = Array.from(leaderboardMap.values()).sort((a, b) => {
      if (b.scoreSum7d !== a.scoreSum7d) return b.scoreSum7d - a.scoreSum7d;
      if (b.count7d !== a.count7d) return b.count7d - a.count7d;
      return a.fullName.localeCompare(b.fullName);
    });

    const trendingPayload = {
      fetchedAt,
      windowHours: TRENDING_WINDOW_HOURS,
      scannedTotal: stories.length,
      stories: trendingStories,
    };
    const mentionsPayload = {
      fetchedAt,
      windowDays: MENTIONS_WINDOW_DAYS,
      scannedStories: stories.length,
      mentions,
      leaderboard,
    };

    const trendingResult = await writeDataStore('lobsters-trending', trendingPayload);
    const mentionsResult = await writeDataStore('lobsters-mentions', mentionsPayload);

    ctx.log.info(
      {
        trending: trendingStories.length,
        mentions: Object.keys(mentions).length,
        trendingRedis: trendingResult.source,
        mentionsRedis: mentionsResult.source,
      },
      'lobsters published',
    );
    return done(
      startedAt,
      stories.length,
      trendingResult.source === 'redis' || mentionsResult.source === 'redis',
    );
  },
};

export default fetcher;

function done(startedAt: string, items: number, redisPublished: boolean): RunResult {
  return {
    fetcher: 'lobsters',
    startedAt,
    finishedAt: new Date().toISOString(),
    itemsSeen: items,
    itemsUpserted: 0,
    metricsWritten: 0,
    redisPublished,
    errors: [],
  };
}
