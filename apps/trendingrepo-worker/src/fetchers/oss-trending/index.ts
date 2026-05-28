// OSS Insight trending + hot collections fetcher.
//
// Ports `scripts/scrape-trending.mjs` (the `--skip-collection-rankings`
// path) into the worker. Pulls 3 periods x 5 languages from
// /v1/trends/repos/, plus /v1/collections/hot/, then publishes two
// data-store slugs:
//   - `trending`         (ss:data:v1:trending)         buckets payload
//   - `hot-collections`  (ss:data:v1:hot-collections)  hot-collections payload
//
// Cadence: hourly at :27 (matches .github/workflows/scrape-trending.yml).
// OSS Insight allows ~600 req/hr per IP; we throttle 1.5s between bucket
// requests to stay polite. Endpoints don't emit ETag, so we disable the
// HTTP client's ETag cache to keep redis namespace tidy.

import type { Fetcher, FetcherContext, RunResult } from '../../lib/types.js';
import { writeDataStore } from '../../lib/redis.js';

const PERIODS = ['past_24_hours', 'past_week', 'past_month'] as const;
const LANGUAGES = ['All', 'Python', 'TypeScript', 'Rust', 'Go'] as const;
const TRENDS_PAUSE_MS = 1500;
const TRENDS_URL = 'https://api.ossinsight.io/v1/trends/repos/';
const HOT_COLLECTIONS_URL = 'https://api.ossinsight.io/v1/collections/hot/';

interface OssRow {
  repo_id?: string;
  repo_name?: string;
  primary_language?: string;
  description?: string;
  stars?: string;
  forks?: string;
  pull_requests?: string;
  pushes?: string;
  total_score?: string;
  contributor_logins?: string;
  collection_names?: string;
  [k: string]: unknown;
}

interface OssEnvelope<T = OssRow> {
  data?: { rows?: T[] };
}

interface HotCollectionRow {
  id?: string | number;
  name?: string;
  repos?: string | number;
  repo_id?: string | number;
  repo_name?: string;
  repo_current_period_rank?: string | number;
  repo_past_period_rank?: string | number;
  repo_rank_changes?: string | number;
}

export interface NormalizedHotCollectionRow {
  id: number | null;
  name: string;
  repos: number | null;
  repoId: number | null;
  repoName: string;
  repoCurrentPeriodRank: number | null;
  repoPastPeriodRank: number | null;
  repoRankChanges: number | null;
}

export interface TrendingPayload {
  fetchedAt: string;
  buckets: Record<string, Record<string, OssRow[]>>;
}

export interface HotCollectionsPayload {
  fetchedAt: string;
  rows: NormalizedHotCollectionRow[];
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

function expectRows<T>(body: OssEnvelope<T> | unknown, label: string): T[] {
  const rows = (body as OssEnvelope<T>)?.data?.rows;
  if (!Array.isArray(rows)) {
    throw new Error(`${label}: malformed response (no data.rows array)`);
  }
  return rows;
}

function toNumber(value: unknown): number | null {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeHotCollectionRow(
  row: HotCollectionRow,
): NormalizedHotCollectionRow {
  return {
    id: toNumber(row.id),
    name: String(row.name ?? ''),
    repos: toNumber(row.repos),
    repoId: toNumber(row.repo_id),
    repoName: String(row.repo_name ?? ''),
    repoCurrentPeriodRank: toNumber(row.repo_current_period_rank),
    repoPastPeriodRank: toNumber(row.repo_past_period_rank),
    repoRankChanges: toNumber(row.repo_rank_changes),
  };
}

const fetcher: Fetcher = {
  name: 'oss-trending',
  // Staggered to :22 (was :27 — clustered with 3 others). Runs first in
  // the cluster so deltas (:40) sees a fresh `trending` payload. Cron-tick
  // budget is generous: 22s of bucket fetches comfortably finish before
  // recent-repos starts at :25.
  schedule: '22 * * * *',
  async run(ctx: FetcherContext): Promise<RunResult> {
    const startedAt = new Date().toISOString();
    const errors: RunResult['errors'] = [];

    if (ctx.dryRun) {
      ctx.log.info('oss-trending dry-run');
      return done(startedAt, 0, false, errors);
    }

    const fetchedAt = new Date().toISOString();
    const buckets: Record<string, Record<string, OssRow[]>> = {};
    let totalRows = 0;

    for (const period of PERIODS) {
      buckets[period] = {};
      for (const language of LANGUAGES) {
        const label = `${period}/${language}`;
        const url = `${TRENDS_URL}?period=${encodeURIComponent(period)}&language=${encodeURIComponent(language)}`;
        try {
          const { data } = await ctx.http.json<OssEnvelope>(url, {
            useEtagCache: false,
            timeoutMs: 20_000,
          });
          const rows = expectRows<OssRow>(data, label);
          buckets[period]![language] = rows;
          totalRows += rows.length;
          ctx.log.info({ period, language, rows: rows.length }, 'bucket fetched');
        } catch (err) {
          const message = (err as Error).message;
          ctx.log.error({ period, language, err: message }, 'bucket fetch failed');
          errors.push({ stage: `bucket:${label}`, message });
          buckets[period]![language] = [];
        }
        await sleep(TRENDS_PAUSE_MS);
      }
    }

    let hotRows: NormalizedHotCollectionRow[] = [];
    try {
      const { data } = await ctx.http.json<OssEnvelope<HotCollectionRow>>(
        HOT_COLLECTIONS_URL,
        { useEtagCache: false, timeoutMs: 20_000 },
      );
      hotRows = expectRows<HotCollectionRow>(data, 'hot collections').map(
        normalizeHotCollectionRow,
      );
      ctx.log.info({ rows: hotRows.length }, 'hot collections fetched');
    } catch (err) {
      const message = (err as Error).message;
      ctx.log.error({ err: message }, 'hot collections fetch failed');
      errors.push({ stage: 'hot-collections', message });
    }

    const trendsPayload: TrendingPayload = { fetchedAt, buckets };
    const hotPayload: HotCollectionsPayload = { fetchedAt, rows: hotRows };

    // Zero-write guard — root-cause fix for the 2026-05-28 site-wide delta wipe.
    // When api.ossinsight.io is fully down, every bucket fetch fails and comes
    // back empty. Writing that empty payload OVERWRITES the last-known-good
    // `trending` slug, which zeroes every repo's star-delta site-wide and forces
    // the deltaless registry fallback ("—" + monogram everywhere). Preserve the
    // existing slug instead — slightly-stale beats empty, same contract as the
    // keep-last-50 collector rule. Only a TOTAL failure (totalRows === 0)
    // triggers preservation; partial buckets still publish.
    let trendsSource = 'preserved';
    let hotSource = 'preserved';
    if (totalRows > 0) {
      const res = await writeDataStore('trending', trendsPayload);
      trendsSource = res.source;
    } else {
      ctx.log.error(
        'oss-trending: ALL buckets empty (api.ossinsight.io down?) — preserving last-known-good `trending` slug instead of overwriting with empty',
      );
      errors.push({
        stage: 'guard-trending',
        message: 'all buckets empty; preserved last-known-good trending slug',
      });
    }
    if (hotRows.length > 0) {
      const res = await writeDataStore('hot-collections', hotPayload);
      hotSource = res.source;
    } else {
      ctx.log.warn(
        'oss-trending: no hot collections this run — preserving last-known-good hot-collections slug',
      );
    }

    ctx.log.info(
      {
        totalRows,
        hotCollections: hotRows.length,
        trendingRedis: trendsSource,
        hotRedis: hotSource,
      },
      'oss-trending published',
    );

    const redisPublished = trendsSource === 'redis' && hotSource === 'redis';
    return done(startedAt, totalRows + hotRows.length, redisPublished, errors);
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
    fetcher: 'oss-trending',
    startedAt,
    finishedAt: new Date().toISOString(),
    itemsSeen: items,
    itemsUpserted: 0,
    metricsWritten: 0,
    redisPublished,
    errors,
  };
}
