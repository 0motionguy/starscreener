// End-to-end pulse fetcher for the worker scheduler.
//
// Pulls the top 30 stories from HN's Firebase API and publishes a small
// payload to `ss:data:v1:hn-pulse`. The Next.js app's /api/worker/pulse
// route reads this slug as a worker liveness probe — fresh data there
// proves the croner -> runFetcher -> writeDataStore -> data-store path
// works end-to-end on Railway.
//
// Cadence: every 10 minutes. HN top-30 churns enough that a stale write
// timestamp is an unambiguous signal that the worker stopped ticking.

import type { Fetcher, FetcherContext, RunResult } from '../../lib/types.js';
import { writeDataStore } from '../../lib/redis.js';

const TOP_STORIES_URL = 'https://hacker-news.firebaseio.com/v0/topstories.json';
const ITEM_URL = (id: number): string =>
  `https://hacker-news.firebaseio.com/v0/item/${id}.json`;
const STORY_LIMIT = 30;
const FETCH_BATCH = 5;

interface FirebaseItem {
  id: number;
  title?: string;
  url?: string;
  score?: number;
  by?: string;
  time?: number;
  descendants?: number;
  type?: string;
  dead?: boolean;
  deleted?: boolean;
}

export interface HnPulseStory {
  id: number;
  rank: number;
  title: string;
  url: string | null;
  score: number;
  comments: number;
  by: string;
  createdAt: string;
}

export interface HnPulsePayload {
  fetchedAt: string;
  source: 'hacker-news';
  windowItems: number;
  stories: HnPulseStory[];
}

const fetcher: Fetcher = {
  name: 'hn-pulse',
  schedule: '*/10 * * * *',
  async run(ctx: FetcherContext): Promise<RunResult> {
    const startedAt = new Date().toISOString();

    if (ctx.dryRun) {
      ctx.log.info('hn-pulse dry-run');
      return done(startedAt, 0, false);
    }

    // Firebase doesn't emit ETag on these endpoints — disable cache to keep
    // the redis namespace clean of useless tr:etag-body:* entries.
    const { data: ids } = await ctx.http.json<number[]>(TOP_STORIES_URL, {
      useEtagCache: false,
    });
    const top = (Array.isArray(ids) ? ids : [])
      .filter((n): n is number => Number.isFinite(n) && n > 0)
      .slice(0, STORY_LIMIT);

    const stories: HnPulseStory[] = [];
    for (let i = 0; i < top.length; i += FETCH_BATCH) {
      const batch = top.slice(i, i + FETCH_BATCH);
      const settled = await Promise.allSettled(
        batch.map((id) =>
          ctx.http.json<FirebaseItem | null>(ITEM_URL(id), { useEtagCache: false }),
        ),
      );
      for (let j = 0; j < settled.length; j += 1) {
        const r = settled[j]!;
        if (r.status !== 'fulfilled') continue;
        const item = r.value.data;
        if (!item || item.type !== 'story') continue;
        if (item.dead || item.deleted) continue;
        if (typeof item.time !== 'number') continue;
        stories.push({
          id: Number(item.id),
          rank: i + j + 1,
          title: String(item.title ?? '').slice(0, 300),
          url: item.url ? String(item.url) : null,
          score: Number(item.score) || 0,
          comments: Number(item.descendants) || 0,
          by: String(item.by ?? ''),
          createdAt: new Date(item.time * 1000).toISOString(),
        });
      }
    }

    const payload: HnPulsePayload = {
      fetchedAt: new Date().toISOString(),
      source: 'hacker-news',
      windowItems: stories.length,
      stories,
    };

    const result = await writeDataStore('hn-pulse', payload);
    ctx.log.info(
      { stories: stories.length, redisSource: result.source, writtenAt: result.writtenAt },
      'hn-pulse published',
    );
    return done(startedAt, stories.length, result.source === 'redis');
  },
};

export default fetcher;

function done(startedAt: string, items: number, redisPublished: boolean): RunResult {
  return {
    fetcher: 'hn-pulse',
    startedAt,
    finishedAt: new Date().toISOString(),
    itemsSeen: items,
    itemsUpserted: 0,
    metricsWritten: 0,
    redisPublished,
    errors: [],
  };
}
