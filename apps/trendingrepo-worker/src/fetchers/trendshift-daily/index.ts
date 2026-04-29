import * as cheerio from 'cheerio';
import type { Fetcher, FetcherContext, RunResult } from '../../lib/types.js';
import { writeDataStore } from '../../lib/redis.js';

const TRENSHIFT_URL = 'https://trendshift.io/?trending-limit=100';
const MAX_ITEMS = 100;

export interface TrendshiftDailyItem {
  fullName: string;
  rank: number;
  repositoryId: number | null;
  url: string;
  source: 'trendshift';
}

export interface TrendshiftDailyPayload {
  fetchedAt: string;
  sourceUrl: string;
  itemCount: number;
  items: TrendshiftDailyItem[];
}

function parseRepositoryId(href: string): number | null {
  const match = href.match(/\/repositories\/(\d+)/);
  if (!match) return null;
  const parsed = Number.parseInt(match[1]!, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function looksLikeFullName(text: string): boolean {
  if (!text.includes('/')) return false;
  const [owner, name] = text.split('/');
  if (!owner || !name) return false;
  return /^[A-Za-z0-9_.-]+$/.test(owner) && /^[A-Za-z0-9_.-]+$/.test(name);
}

export function parseTrendshiftDaily(html: string): TrendshiftDailyItem[] {
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const items: TrendshiftDailyItem[] = [];

  $('a[href^="/repositories/"]').each((_, el) => {
    const href = String($(el).attr('href') ?? '');
    const fullName = $(el).text().trim();
    if (!looksLikeFullName(fullName)) return;
    const lower = fullName.toLowerCase();
    if (seen.has(lower)) return;
    seen.add(lower);
    items.push({
      fullName,
      rank: items.length + 1,
      repositoryId: parseRepositoryId(href),
      url: `https://trendshift.io${href}`,
      source: 'trendshift',
    });
  });

  return items.slice(0, MAX_ITEMS);
}

const fetcher: Fetcher = {
  name: 'trendshift-daily',
  // After OSS trending (:22) and before engagement-composite (:45). The
  // consensus fetcher (:50) then sees all three inputs in the same hour.
  schedule: '35 * * * *',
  async run(ctx: FetcherContext): Promise<RunResult> {
    const startedAt = new Date().toISOString();
    const errors: RunResult['errors'] = [];

    if (ctx.dryRun) {
      ctx.log.info('trendshift-daily dry-run');
      return done(startedAt, 0, false, errors);
    }

    let items: TrendshiftDailyItem[] = [];
    try {
      const { data } = await ctx.http.text(TRENSHIFT_URL, {
        headers: { accept: 'text/html' },
        timeoutMs: 20_000,
        useEtagCache: false,
      });
      items = parseTrendshiftDaily(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({ stage: 'fetch', message });
      ctx.log.error({ err: message }, 'trendshift fetch failed');
    }

    const payload: TrendshiftDailyPayload = {
      fetchedAt: new Date().toISOString(),
      sourceUrl: TRENSHIFT_URL,
      itemCount: items.length,
      items,
    };
    const result = await writeDataStore('trendshift-daily', payload);

    ctx.log.info(
      { items: items.length, redisSource: result.source, writtenAt: result.writtenAt },
      'trendshift-daily published',
    );
    return done(startedAt, items.length, result.source === 'redis', errors);
  },
};

export default fetcher;

function done(
  startedAt: string,
  items: number,
  redisPublished: boolean,
  errors: RunResult['errors'],
): RunResult {
  return {
    fetcher: 'trendshift-daily',
    startedAt,
    finishedAt: new Date().toISOString(),
    itemsSeen: items,
    itemsUpserted: 0,
    metricsWritten: 0,
    redisPublished,
    errors,
  };
}
