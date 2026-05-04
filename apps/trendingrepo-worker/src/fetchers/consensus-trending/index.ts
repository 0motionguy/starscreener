import type { Fetcher, FetcherContext, RunResult } from '../../lib/types.js';
import { readDataStore, writeDataStore } from '../../lib/redis.js';
import { scoreConsensus, CONSENSUS_WEIGHTS } from './scoring.js';
import type {
  ConsensusScoreInput,
  ConsensusSourceInput,
  ConsensusTrendingPayload,
} from './types.js';

const TOP_LIMIT = 200;

interface EngagementCompositePayload {
  items?: Array<{
    fullName?: string;
    rank?: number;
    compositeScore?: number;
  }>;
}

interface OssTrendingPayload {
  buckets?: Record<string, Record<string, Array<{
    repo_name?: string;
    total_score?: string | number;
  }>>>;
}

interface TrendshiftDailyPayload {
  items?: Array<{
    fullName?: string;
    rank?: number;
    score?: number;
  }>;
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function fromEngagement(payload: EngagementCompositePayload | null): ConsensusSourceInput[] {
  const items = Array.isArray(payload?.items) ? payload.items : [];
  return items
    .map((item, idx) => ({
      fullName: String(item.fullName ?? ''),
      rank: typeof item.rank === 'number' ? item.rank : idx + 1,
      score: toNumber(item.compositeScore),
    }))
    .filter((item) => item.fullName.includes('/'));
}

function fromOss(payload: OssTrendingPayload | null): ConsensusSourceInput[] {
  const rows = payload?.buckets?.past_24_hours?.All ?? [];
  return rows
    .map((row, idx) => ({
      fullName: String(row.repo_name ?? ''),
      rank: idx + 1,
      score: toNumber(row.total_score),
    }))
    .filter((item) => item.fullName.includes('/'));
}

function fromTrendshift(payload: TrendshiftDailyPayload | null): ConsensusSourceInput[] {
  const items = Array.isArray(payload?.items) ? payload.items : [];
  return items
    .map((item, idx) => ({
      fullName: String(item.fullName ?? ''),
      rank: typeof item.rank === 'number' ? item.rank : idx + 1,
      score: toNumber(item.score),
    }))
    .filter((item) => item.fullName.includes('/'));
}

const fetcher: Fetcher = {
  name: 'consensus-trending',
  // Runs after engagement-composite (:45), using fresh OSS + Trendshift
  // payloads from earlier in the hour.
  schedule: '50 * * * *',
  async run(ctx: FetcherContext): Promise<RunResult> {
    const startedAt = new Date().toISOString();

    if (ctx.dryRun) {
      ctx.log.info('consensus-trending dry-run');
      return done(startedAt, 0, false);
    }

    const [engagement, oss, trendshift] = await Promise.all([
      readDataStore<EngagementCompositePayload>('engagement-composite'),
      readDataStore<OssTrendingPayload>('trending'),
      readDataStore<TrendshiftDailyPayload>('trendshift-daily'),
    ]);

    const input: ConsensusScoreInput = {
      ours: fromEngagement(engagement),
      oss: fromOss(oss),
      trendshift: fromTrendshift(trendshift),
      limit: TOP_LIMIT,
    };
    const items = scoreConsensus(input);
    const payload: ConsensusTrendingPayload = {
      computedAt: new Date().toISOString(),
      itemCount: items.length,
      weights: CONSENSUS_WEIGHTS,
      items,
    };

    const result = await writeDataStore('consensus-trending', payload);
    ctx.log.info(
      {
        itemCount: items.length,
        sourceRows: {
          ours: input.ours.length,
          oss: input.oss.length,
          trendshift: input.trendshift.length,
        },
        redisSource: result.source,
        writtenAt: result.writtenAt,
      },
      'consensus-trending published',
    );

    return done(startedAt, items.length, result.source === 'redis');
  },
};

export default fetcher;

function done(startedAt: string, items: number, redisPublished: boolean): RunResult {
  return {
    fetcher: 'consensus-trending',
    startedAt,
    finishedAt: new Date().toISOString(),
    itemsSeen: items,
    itemsUpserted: 0,
    metricsWritten: 0,
    redisPublished,
    errors: [],
  };
}
