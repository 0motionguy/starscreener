// GitHub-backed trending + hot collections fetcher.
//
// Publishes two data-store slugs from worker-owned Redis inputs:
//   - `trending`
//   - `hot-collections`
//
// OSS Insight is kept as an explicit opt-in diagnostic source only
// (`OSSINSIGHT_ENABLED=1`). It has repeatedly returned HTTP 500 envelopes with
// upstream 429 bodies, so production must not spend every hourly tick waiting
// on that dependency before serving the internal GitHub freshness backbone.

import type { Fetcher, FetcherContext, RunResult } from '../../lib/types.js';
import { readDataStore, writeDataStore } from '../../lib/redis.js';
import {
  buildFallbackTrendingPayload,
  countTrendingRows,
  readFallbackSources,
} from './fallback.js';
import {
  buildGithubCollectionRankingsFallback,
  buildHotCollectionsFromRankings,
  readGithubCollectionFallbackSources,
} from '../collection-rankings/fallback.js';

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
  status?: 'ok' | 'degraded';
  dataAsOf?: string | null;
  errors?: Array<{ stage: string; message: string }>;
  source?: string;
}

export interface HotCollectionsPayload {
  fetchedAt: string;
  rows: NormalizedHotCollectionRow[];
  status?: 'ok' | 'degraded';
  dataAsOf?: string | null;
  errors?: Array<{ stage: string; message: string }>;
  source?: string;
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

function trendingRows(
  payload: TrendingPayload | null | undefined,
  period: string,
  language: string,
): OssRow[] {
  return payload?.buckets?.[period]?.[language] ?? [];
}

function hotRowsFromPayload(
  payload: HotCollectionsPayload | null | undefined,
): NormalizedHotCollectionRow[] {
  return Array.isArray(payload?.rows) ? payload.rows : [];
}

function ossInsightEnabled(): boolean {
  const value = process.env.OSSINSIGHT_ENABLED?.trim().toLowerCase();
  return value === '1' || value === 'true' || value === 'yes' || value === 'live';
}

const fetcher: Fetcher = {
  name: 'oss-trending',
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
    const priorTrending =
      (await readDataStore<TrendingPayload>('trending').catch(() => null)) ??
      null;
    const priorHotCollections =
      (await readDataStore<HotCollectionsPayload>('hot-collections').catch(
        () => null,
      )) ?? null;
    const internalTrendingFallback = buildFallbackTrendingPayload(
      await readFallbackSources(),
      fetchedAt,
    );

    if (!ossInsightEnabled()) {
      return publishInternalGithubFallback({
        ctx,
        startedAt,
        fetchedAt,
        internalTrendingFallback,
      });
    }

    let totalRows = 0;
    let preservedTrendRows = 0;
    let internalTrendRows = 0;
    let missingTrendFallbacks = 0;
    const trendPayloadErrors: Array<{ stage: string; message: string }> = [];

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
          const internalRows = trendingRows(
            internalTrendingFallback,
            period,
            language,
          );
          const priorRows = trendingRows(priorTrending, period, language);
          if (internalTrendingFallback) {
            const fallbackRows = internalRows;
            buckets[period]![language] = fallbackRows;
            internalTrendRows += fallbackRows.length;
            totalRows += fallbackRows.length;
            ctx.log.warn(
              {
                period,
                language,
                err: message,
                preservedRows: fallbackRows.length,
                fallbackSource: 'internal-github',
              },
              'bucket fetch failed - serving fallback rows',
            );
            errors.push({
              stage: `bucket:${label}`,
              message: `${message} (served ${fallbackRows.length} internal-github)`,
            });
          } else if (priorRows.length > 0) {
            const fallbackRows = priorRows;
            buckets[period]![language] = fallbackRows;
            preservedTrendRows += fallbackRows.length;
            trendPayloadErrors.push({
              stage: `bucket:${label}`,
              message: `${message} (preserved ${fallbackRows.length} cached)`,
            });
            totalRows += fallbackRows.length;
            ctx.log.warn(
              {
                period,
                language,
                err: message,
                preservedRows: fallbackRows.length,
                fallbackSource: 'cached',
              },
              'bucket fetch failed - serving fallback rows',
            );
            errors.push({
              stage: `bucket:${label}`,
              message: `${message} (served ${fallbackRows.length} cached)`,
            });
          } else {
            ctx.log.error({ period, language, err: message }, 'bucket fetch failed');
            errors.push({ stage: `bucket:${label}`, message });
            buckets[period]![language] = [];
            missingTrendFallbacks += 1;
            trendPayloadErrors.push({ stage: `bucket:${label}`, message });
          }
        }
        await sleep(TRENDS_PAUSE_MS);
      }
    }

    let hotRows: NormalizedHotCollectionRow[] = [];
    let preservedHotRows = 0;
    let githubHotRows = 0;
    let missingHotFallback = false;
    const hotPayloadErrors: Array<{ stage: string; message: string }> = [];
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
      const priorRows = hotRowsFromPayload(priorHotCollections);
      const githubFallback = buildGithubCollectionRankingsFallback(
        await readGithubCollectionFallbackSources(),
        fetchedAt,
      );
      const fallbackRows = buildHotCollectionsFromRankings(githubFallback);
      if (fallbackRows.length > 0) {
        hotRows = fallbackRows;
        githubHotRows = hotRows.length;
        ctx.log.warn(
          { err: message, rows: hotRows.length },
          'hot collections fetch failed - serving github-metadata fallback rows',
        );
        errors.push({
          stage: 'hot-collections',
          message: `${message} (served ${hotRows.length} github-metadata fallback)`,
        });
      } else if (priorRows.length > 0) {
        hotRows = priorRows;
        preservedHotRows = priorRows.length;
        ctx.log.warn(
          { err: message, preservedRows: priorRows.length },
          'hot collections fetch failed - preserving cached rows',
        );
        const preserved = {
          stage: 'hot-collections',
          message: `${message} (preserved ${priorRows.length} cached)`,
        };
        errors.push(preserved);
        hotPayloadErrors.push(preserved);
      } else {
        ctx.log.error({ err: message }, 'hot collections fetch failed');
        const failed = { stage: 'hot-collections', message };
        errors.push(failed);
        hotPayloadErrors.push(failed);
        missingHotFallback = true;
      }
    }

    const trendStatus = trendPayloadErrors.length > 0 ? 'degraded' : 'ok';
    const hotStatus = hotPayloadErrors.length > 0 ? 'degraded' : 'ok';
    const trendsPayload: TrendingPayload = {
      fetchedAt,
      buckets,
      status: trendStatus,
      ...(internalTrendRows > 0 && trendPayloadErrors.length === 0
        ? { source: 'internal-github-fallback' }
        : {}),
      dataAsOf:
        trendStatus === 'degraded'
          ? priorTrending?.dataAsOf ?? priorTrending?.fetchedAt ?? null
          : fetchedAt,
      ...(trendPayloadErrors.length > 0 ? { errors: trendPayloadErrors } : {}),
    };
    const hotPayload: HotCollectionsPayload = {
      fetchedAt,
      rows: hotRows,
      status: hotStatus,
      ...(githubHotRows > 0 && hotPayloadErrors.length === 0
        ? { source: 'github-metadata-fallback' }
        : {}),
      dataAsOf:
        hotStatus === 'degraded'
          ? priorHotCollections?.dataAsOf ??
            priorHotCollections?.fetchedAt ??
            null
          : fetchedAt,
      ...(hotPayloadErrors.length > 0 ? { errors: hotPayloadErrors } : {}),
    };

    let trendsSource: 'redis' | 'preserved' = 'preserved';
    let hotSource: 'redis' | 'preserved' = 'preserved';
    if (totalRows > 0 && missingTrendFallbacks === 0) {
      const trendsRes = await writeDataStore(
        'trending',
        trendsPayload,
        trendStatus === 'degraded'
          ? { writer: 'worker:oss-trending:degraded' }
          : {},
      );
      trendsSource = trendsRes.source === 'redis' ? 'redis' : 'preserved';
    } else if (totalRows === 0) {
      const fallbackPayload = internalTrendingFallback;
      if (fallbackPayload) {
        const fallbackRows = countTrendingRows(fallbackPayload);
        const message = `all OSSInsight buckets empty; published ${fallbackRows} internal fallback rows`;
        const trendsRes = await writeDataStore(
          'trending',
          {
            ...fallbackPayload,
            status: 'degraded',
            dataAsOf: fetchedAt,
            errors: [{ stage: 'fallback-trending', message }],
          } satisfies TrendingPayload,
          { writer: 'worker:oss-trending:fallback' },
        );
        totalRows = fallbackRows;
        trendsSource = trendsRes.source === 'redis' ? 'redis' : 'preserved';
        errors.push({ stage: 'fallback-trending', message });
        ctx.log.warn({ fallbackRows }, message);
      } else {
        const message = 'all trend buckets empty; skipped empty trending publish';
        errors.push({ stage: 'guard:trending', message });
        ctx.log.error({ totalRows, preservedTrendRows }, message);
      }
    } else {
      const message = `missing cached rows for ${missingTrendFallbacks} failed trend bucket(s); skipped empty trending publish`;
      errors.push({ stage: 'guard:trending', message });
      ctx.log.error(
        {
          totalRows,
          preservedTrendRows,
          missingTrendFallbacks,
        },
        message,
      );
    }

    if (hotRows.length > 0 && !missingHotFallback) {
      const hotRes = await writeDataStore(
        'hot-collections',
        hotPayload,
        hotStatus === 'degraded'
          ? { writer: 'worker:oss-trending:degraded' }
          : {},
      );
      hotSource = hotRes.source === 'redis' ? 'redis' : 'preserved';
    } else {
      const message = missingHotFallback
        ? 'no cached hot collection rows after upstream failure; skipped empty hot-collections publish'
        : 'hot collections empty; skipped empty hot-collections publish';
      errors.push({ stage: 'guard:hot-collections', message });
      ctx.log.error({ hotCollections: hotRows.length }, message);
    }

    ctx.log.info(
      {
        totalRows,
        hotCollections: hotRows.length,
        preservedTrendRows,
        internalTrendRows,
        preservedHotRows,
        githubHotRows,
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

async function publishInternalGithubFallback(args: {
  ctx: FetcherContext;
  startedAt: string;
  fetchedAt: string;
  internalTrendingFallback: TrendingPayload | null;
}): Promise<RunResult> {
  const { ctx, startedAt, fetchedAt, internalTrendingFallback } = args;
  const errors: RunResult['errors'] = [];
  let totalRows = 0;
  let hotRows: NormalizedHotCollectionRow[] = [];
  let trendsSource: 'redis' | 'preserved' = 'preserved';
  let hotSource: 'redis' | 'preserved' = 'preserved';

  if (internalTrendingFallback) {
    const fallbackRows = countTrendingRows(internalTrendingFallback);
    totalRows = fallbackRows;
    const trendsRes = await writeDataStore(
      'trending',
      {
        ...internalTrendingFallback,
        fetchedAt,
        status: 'ok',
        source: 'internal-github',
        dataAsOf: fetchedAt,
      } satisfies TrendingPayload,
      { writer: 'worker:oss-trending:internal-github' },
    );
    trendsSource = trendsRes.source === 'redis' ? 'redis' : 'preserved';
  } else {
    const message =
      'internal GitHub fallback had no joinable rows; skipped empty trending publish';
    errors.push({ stage: 'fallback-trending', message });
    ctx.log.error({ fallbackRows: 0 }, message);
  }

  const githubFallback = buildGithubCollectionRankingsFallback(
    await readGithubCollectionFallbackSources(),
    fetchedAt,
  );
  hotRows = buildHotCollectionsFromRankings(githubFallback);
  if (hotRows.length > 0) {
    const hotRes = await writeDataStore(
      'hot-collections',
      {
        fetchedAt,
        rows: hotRows,
        status: 'ok',
        source: 'github-metadata-fallback',
        dataAsOf: fetchedAt,
      } satisfies HotCollectionsPayload,
      { writer: 'worker:oss-trending:internal-github' },
    );
    hotSource = hotRes.source === 'redis' ? 'redis' : 'preserved';
  } else {
    const message =
      'internal GitHub collection fallback had no rows; skipped empty hot-collections publish';
    errors.push({ stage: 'fallback-hot-collections', message });
    ctx.log.error({ fallbackRows: 0 }, message);
  }

  ctx.log.info(
    {
      source: 'internal-github',
      ossInsightEnabled: false,
      totalRows,
      hotCollections: hotRows.length,
      trendingRedis: trendsSource,
      hotRedis: hotSource,
    },
    'oss-trending published from internal GitHub fallback',
  );

  return done(
    startedAt,
    totalRows + hotRows.length,
    trendsSource === 'redis' && hotSource === 'redis',
    errors,
  );
}

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
