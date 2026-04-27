// AI-blog fetcher Phase 1: RSS path only. Pulls posts from labs in
// AI_LAB_REGISTRY that publish a verified RSS/Atom feed, normalizes to
// trending_items rows with type='post', publishes leaderboard to
// ss:data:v1:trending-post.

import { upsertItem } from '../../lib/db.js';
import { publishLeaderboard } from '../../lib/publish.js';
import { listLabs } from '../../lib/registries/ai-labs.js';
import type {
  Fetcher, FetcherContext, NormalizedItem, RunResult,
} from '../../lib/types.js';
import { fetchLabRss } from './rss-path.js';
import type { NormalizedPost } from './types.js';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const SLUG_TITLE_CAP = 80;

const fetcher: Fetcher = {
  name: 'ai-blogs',
  schedule: '15 */6 * * *',
  requiresDb: true,
  async run(ctx: FetcherContext): Promise<RunResult> {
    const startedAt = new Date().toISOString();
    if (ctx.dryRun) {
      ctx.log.info('ai-blogs fetcher dry-run');
      return done('ai-blogs', startedAt, 0, 0, false, []);
    }

    const errors: RunResult['errors'] = [];
    const sinceIso = new Date(Date.now() - THIRTY_DAYS_MS).toISOString();
    const labs = listLabs().filter((l) => l.blog_rss_url !== null);
    let itemsSeen = 0;
    let itemsUpserted = 0;
    const seen = new Set<string>();

    ctx.log.info({ rssLabs: labs.length }, 'ai-blogs phase-1 starting');

    for (const lab of labs) {
      if (!lab.blog_rss_url) continue;
      const result = await fetchLabRss(
        { http: ctx.http, log: ctx.log },
        { labId: lab.lab_id, feedUrl: lab.blog_rss_url, sinceIso },
      );
      ctx.log.info(
        { labId: lab.lab_id, format: result.feedFormat, posts: result.posts.length, errors: result.errors.length },
        'ai-blogs lab fetched',
      );
      for (const e of result.errors) {
        errors.push({ stage: `${lab.lab_id}:${e.stage}`, message: e.message });
      }

      for (const post of result.posts) {
        if (seen.has(post.url)) continue;
        seen.add(post.url);
        itemsSeen += 1;
        try {
          const item = normalizePost(post);
          await upsertItem(ctx.db, { item });
          itemsUpserted += 1;
        } catch (err) {
          errors.push({
            stage: `upsert:${lab.lab_id}`,
            message: (err as Error).message,
            itemSourceId: post.url,
          });
        }
      }
    }

    let redisPublished = false;
    try {
      const result = await publishLeaderboard(ctx.db, 'post');
      redisPublished = result.redisPublished;
      ctx.log.info({ items: result.items, redisPublished }, 'ai-blogs leaderboard published');
    } catch (err) {
      errors.push({ stage: 'publish-post', message: (err as Error).message });
    }

    await ctx.signalRunComplete({
      fetcher: 'ai-blogs', startedAt,
      finishedAt: new Date().toISOString(),
      itemsSeen, itemsUpserted, metricsWritten: 0, redisPublished, errors,
    });

    return done('ai-blogs', startedAt, itemsSeen, itemsUpserted, redisPublished, errors);
  },
};

export default fetcher;

function normalizePost(post: NormalizedPost): NormalizedItem {
  const slug = `${post.labId}-${kebab(post.title.slice(0, SLUG_TITLE_CAP))}`;
  const mergeKeys = [`blog:${post.url}`, ...post.arxivIds.map((id) => `arxiv:${id}`)];
  return {
    type: 'post',
    source: 'ai-blog',
    source_id: post.url,
    slug,
    title: post.title.slice(0, 300),
    description: post.summary,
    url: post.url,
    author: post.author ?? undefined,
    vendor: post.labId,
    tags: [`lab:${post.labId}`],
    last_modified_at: post.publishedAt ?? undefined,
    raw: {
      lab_id: post.labId,
      arxiv_ids: post.arxivIds,
      cross_source_ids: [] as string[],
      published_at: post.publishedAt,
      summary: post.summary,
      merge_keys: mergeKeys,
    },
  };
}

function kebab(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_TITLE_CAP);
}

function done(
  name: string, startedAt: string,
  itemsSeen: number, itemsUpserted: number,
  redisPublished: boolean, errors: RunResult['errors'],
): RunResult {
  return {
    fetcher: name, startedAt,
    finishedAt: new Date().toISOString(),
    itemsSeen, itemsUpserted, metricsWritten: 0, redisPublished, errors,
  };
}
