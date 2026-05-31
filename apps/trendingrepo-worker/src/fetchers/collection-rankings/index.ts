// OSS Insight per-collection ranking fetcher.
//
// Ports the `--only-collection-rankings` path of
// `scripts/scrape-trending.mjs`. For each curated collection (~28 of
// them, hardcoded below), pull /v1/collections/{id}/ranking_by_stars and
// /v1/collections/{id}/ranking_by_issues for the past 28 days, normalize
// rows, and publish the aggregate to `ss:data:v1:collection-rankings`.
//
// Cadence: every 6 hours at :17 (matches
// `.github/workflows/refresh-collection-rankings.yml`).
//
// The original script also reads `data/collections/*.yml` files to
// discover collection IDs. The worker bundle is self-contained (no
// access to the monorepo's data/ tree), so we inline the {id, slug}
// list. New collections are added by editing this constant + the YAML
// fixture in tandem.

import type { Fetcher, FetcherContext, RunResult } from '../../lib/types.js';
import { readDataStore, writeDataStore } from '../../lib/redis.js';
import {
  COLLECTIONS,
  METRICS,
  SEED_COLLECTION_RANKINGS,
  buildGithubCollectionRankingsFallback,
  countRankingRows,
  rankingRows,
  readGithubCollectionFallbackSources,
  type CollectionRankingsPayload,
  type Metric,
  type NormalizedRankingRow,
} from './fallback.js';

const PERIOD = 'past_28_days';
const PAUSE_MS = 400;

interface RankingRow {
  repo_id?: string | number;
  repo_name?: string;
  current_period_growth?: string | number;
  past_period_growth?: string | number;
  growth_pop?: string | number;
  rank_pop?: string | number;
  total?: string | number;
  current_period_rank?: string | number;
  past_period_rank?: string | number;
}

interface OssEnvelope<T> {
  data?: { rows?: T[] };
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

function toNumber(value: unknown): number | null {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function toFloat(value: unknown): number | null {
  const parsed = Number.parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function expectRows<T>(body: unknown, label: string): T[] {
  const rows = (body as OssEnvelope<T>)?.data?.rows;
  if (!Array.isArray(rows)) {
    throw new Error(`${label}: malformed response (no data.rows array)`);
  }
  return rows;
}

function normalize(row: RankingRow): NormalizedRankingRow {
  return {
    repoId: toNumber(row.repo_id),
    repoName: String(row.repo_name ?? ''),
    currentPeriodGrowth: toNumber(row.current_period_growth),
    pastPeriodGrowth: toNumber(row.past_period_growth),
    growthPop: toFloat(row.growth_pop),
    rankPop: toNumber(row.rank_pop),
    total: toNumber(row.total),
    currentPeriodRank: toNumber(row.current_period_rank),
    pastPeriodRank: toNumber(row.past_period_rank),
  };
}

const fetcher: Fetcher = {
  name: 'collection-rankings',
  // Every 6h at :17 - matches refresh-collection-rankings.yml.
  schedule: '17 */6 * * *',
  async run(ctx: FetcherContext): Promise<RunResult> {
    const startedAt = new Date().toISOString();
    const errors: RunResult['errors'] = [];

    if (ctx.dryRun) {
      ctx.log.info('collection-rankings dry-run');
      return done(startedAt, 0, false, errors);
    }

    const fetchedAt = new Date().toISOString();
    const collections: Record<string, Record<Metric, NormalizedRankingRow[]>> =
      {};
    const prior =
      (await readDataStore<CollectionRankingsPayload>('collection-rankings').catch(
        () => null,
      )) ?? null;
    const githubFallback = buildGithubCollectionRankingsFallback(
      await readGithubCollectionFallbackSources(),
      fetchedAt,
    );
    let totalRows = 0;
    let preservedRows = 0;
    let githubFallbackRows = 0;
    const payloadErrors: RunResult['errors'] = [];

    for (const collection of COLLECTIONS) {
      const metrics: Record<Metric, NormalizedRankingRow[]> = {
        stars: [],
        issues: [],
      };
      for (const metric of METRICS) {
        const url = `https://api.ossinsight.io/v1/collections/${collection.id}/ranking_by_${metric}/?period=${encodeURIComponent(PERIOD)}`;
        const label = `collection ${collection.id} (${collection.slug}) / ${metric}`;
        try {
          const { data } = await ctx.http.json<OssEnvelope<RankingRow>>(url, {
            useEtagCache: false,
            timeoutMs: 20_000,
          });
          const rows = expectRows<RankingRow>(data, label).map(normalize);
          metrics[metric] = rows;
          totalRows += rows.length;
          ctx.log.info(
            { collection: collection.id, slug: collection.slug, metric, rows: rows.length },
            'ranking fetched',
          );
        } catch (err) {
          const message = (err as Error).message;
          const collectionId = String(collection.id);
          const githubRows = rankingRows(githubFallback, collectionId, metric);
          const priorRows = rankingRows(prior, collectionId, metric);
          const seedRows = rankingRows(
            SEED_COLLECTION_RANKINGS,
            collectionId,
            metric,
          );
          const fallbackRows =
            githubRows.length > 0
              ? githubRows
              : priorRows.length > 0
              ? priorRows
              : seedRows.length > 0
                ? seedRows
                : [];
          const fallbackSource =
            githubRows.length > 0
              ? 'github-metadata'
              : priorRows.length > 0
              ? 'cached'
              : seedRows.length > 0
                ? 'seed'
                : null;
          ctx.log.error(
            {
              collection: collection.id,
              metric,
              err: message,
              preservedRows: fallbackRows.length,
              fallbackSource,
            },
            fallbackRows.length > 0
              ? 'ranking fetch failed - preserving fallback rows for collection metric'
              : 'ranking fetch failed',
          );
          if (fallbackRows.length > 0 && fallbackSource) {
            metrics[metric] = fallbackRows;
            if (fallbackSource === 'github-metadata') {
              githubFallbackRows += fallbackRows.length;
            } else {
              preservedRows += fallbackRows.length;
              payloadErrors.push({
                stage: label,
                message: `${message} (preserved ${fallbackRows.length} ${fallbackSource})`,
              });
            }
            totalRows += fallbackRows.length;
            errors.push({
              stage: label,
              message: `${message} (preserved ${fallbackRows.length} ${fallbackSource})`,
            });
          } else {
            errors.push({ stage: label, message });
            payloadErrors.push({ stage: label, message });
          }
        }
        await sleep(PAUSE_MS);
      }
      collections[String(collection.id)] = metrics;
    }

    const rowfulPrior = countRankingRows(prior) > 0 ? prior : null;
    const rowfulSeed =
      countRankingRows(SEED_COLLECTION_RANKINGS) > 0
        ? SEED_COLLECTION_RANKINGS
        : null;
    const payload: CollectionRankingsPayload = {
      fetchedAt,
      period: PERIOD,
      collections,
      status: payloadErrors.length > 0 ? 'degraded' : 'ok',
      ...(githubFallbackRows > 0 && payloadErrors.length === 0
        ? { source: 'github-metadata-fallback' }
        : {}),
      dataAsOf:
        payloadErrors.length > 0
          ? rowfulPrior?.dataAsOf ??
            rowfulPrior?.fetchedAt ??
            rowfulSeed?.fetchedAt ??
            null
          : fetchedAt,
      ...(payloadErrors.length > 0 ? { errors: payloadErrors } : {}),
    };

    // Zero-write guard (keep-last-50 rule): when api.ossinsight.io is down,
    // every collection ranking fails and totalRows is 0. Writing that empty
    // payload would zero the collection-rankings slug. Preserve the
    // last-known-good slug instead — slightly-stale beats empty.
    let resultSource = 'preserved';
    if (totalRows > 0) {
      const result = await writeDataStore('collection-rankings', payload, {
        writer:
          payload.status === 'degraded'
            ? 'worker:collection-rankings:degraded'
            : undefined,
      });
      resultSource = result.source;
      ctx.log.info(
        {
          collections: COLLECTIONS.length,
          totalRows,
          preservedRows,
          githubFallbackRows,
          redisSource: result.source,
          writtenAt: result.writtenAt,
        },
        'collection-rankings published',
      );
    } else {
      ctx.log.error(
        'collection-rankings: all rankings empty (api.ossinsight.io down?) - skipping empty degraded publish',
      );
      errors.push({
        stage: 'guard',
        message:
          'all rankings empty; skipped empty collection-rankings publish',
      });
      payloadErrors.push({
        stage: 'guard',
        message:
          'all rankings empty; skipped empty collection-rankings publish',
      });
    }

    return done(startedAt, totalRows, resultSource === 'redis', errors);
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
    fetcher: 'collection-rankings',
    startedAt,
    finishedAt: new Date().toISOString(),
    itemsSeen: items,
    itemsUpserted: 0,
    metricsWritten: 0,
    redisPublished,
    errors,
  };
}
