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
import { writeDataStore } from '../../lib/redis.js';

interface CollectionRef {
  id: number;
  slug: string;
}

// Source: data/collections/*.yml (id + filename without .yml). Must stay
// in lockstep with that directory; cross-check with `head -2 *.yml` if
// adding a new collection.
const COLLECTIONS: CollectionRef[] = [
  { id: 10139, slug: 'a2a-protocol' },
  { id: 10141, slug: 'agent-harness' },
  { id: 10124, slug: 'agent-skills' },
  { id: 10098, slug: 'ai-agent-frameworks' },
  { id: 10114, slug: 'ai-agent-memory' },
  { id: 10113, slug: 'ai-browser-agents' },
  { id: 10136, slug: 'ai-code-review' },
  { id: 10112, slug: 'ai-coding-assistants' },
  { id: 10130, slug: 'ai-finops' },
  { id: 10127, slug: 'ai-governance' },
  { id: 10125, slug: 'ai-infrastructure' },
  { id: 10135, slug: 'ai-observability' },
  { id: 10116, slug: 'ai-safety-alignment' },
  { id: 10122, slug: 'ai-video-generation' },
  { id: 10010, slug: 'artificial-intelligence' },
  { id: 10075, slug: 'chatgpt-alternatives' },
  { id: 10078, slug: 'chatgpt-apps' },
  { id: 10106, slug: 'coding-agents' },
  { id: 10126, slug: 'edge-ai' },
  { id: 10134, slug: 'knowledge-graphs-for-ai' },
  { id: 10110, slug: 'llm-finetuning' },
  { id: 10109, slug: 'llm-inference-engines' },
  { id: 10076, slug: 'llm-tools' },
  { id: 10105, slug: 'mcp-servers' },
  { id: 10121, slug: 'model-compression' },
  { id: 10118, slug: 'multimodal-ai' },
  { id: 10108, slug: 'rag-frameworks' },
  { id: 10117, slug: 'vector-databases' },
];

const PERIOD = 'past_28_days';
const METRICS = ['stars', 'issues'] as const;
const PAUSE_MS = 400;

type Metric = (typeof METRICS)[number];

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

interface NormalizedRankingRow {
  repoId: number | null;
  repoName: string;
  currentPeriodGrowth: number | null;
  pastPeriodGrowth: number | null;
  growthPop: number | null;
  rankPop: number | null;
  total: number | null;
  currentPeriodRank: number | null;
  pastPeriodRank: number | null;
}

interface OssEnvelope<T> {
  data?: { rows?: T[] };
}

export interface CollectionRankingsPayload {
  fetchedAt: string;
  period: string;
  collections: Record<string, Record<Metric, NormalizedRankingRow[]>>;
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
    let totalRows = 0;

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
            timeoutMs: 15_000,
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
          ctx.log.error(
            { collection: collection.id, metric, err: message },
            'ranking fetch failed',
          );
          errors.push({ stage: label, message });
        }
        await sleep(PAUSE_MS);
      }
      collections[String(collection.id)] = metrics;
    }

    const payload: CollectionRankingsPayload = {
      fetchedAt,
      period: PERIOD,
      collections,
    };

    const result = await writeDataStore('collection-rankings', payload);
    ctx.log.info(
      {
        collections: COLLECTIONS.length,
        totalRows,
        redisSource: result.source,
        writtenAt: result.writtenAt,
      },
      'collection-rankings published',
    );

    return done(startedAt, totalRows, result.source === 'redis', errors);
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
