import type { Fetcher, FetcherContext, RunResult } from '../../lib/types.js';
import { readDataStore, writeDataStore } from '../../lib/redis.js';
import { scoreConsensus, CONSENSUS_WEIGHTS, bandCounts, EXTERNAL_SOURCES } from './scoring.js';
import type {
  ConsensusExternalSource,
  ConsensusScoreInput,
  ConsensusSourceInput,
  ConsensusTrendingPayload,
} from './types.js';

const TOP_LIMIT = 200;

interface EngagementCompositePayload {
  items?: Array<{ fullName?: string; rank?: number; compositeScore?: number }>;
}

interface OssTrendingPayload {
  buckets?: Record<string, Record<string, Array<{
    repo_name?: string;
    total_score?: string | number;
  }>>>;
}

interface HfTrendingPayload {
  models?: Array<{ id?: string; rank?: number; trendingScore?: number }>;
}

interface LeaderboardEntry {
  fullName?: string;
  count7d?: number;
  scoreSum7d?: number;
  upvotes7d?: number;
  likesSum7d?: number;
  reactionsSum7d?: number;
}

interface MentionsPayload {
  leaderboard?: LeaderboardEntry[];
}

interface ProductHuntPayload {
  launches?: Array<{ id?: string; linkedRepo?: string | null; votesCount?: number }>;
}

interface TwitterTrendingPayload {
  items?: Array<{ fullName?: string; rank?: number; mentions?: number; impressions?: number }>;
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function fromEngagement(p: EngagementCompositePayload | null): ConsensusSourceInput[] {
  const items = Array.isArray(p?.items) ? p.items : [];
  return items
    .map((item, idx) => ({
      fullName: String(item.fullName ?? ''),
      rank: typeof item.rank === 'number' ? item.rank : idx + 1,
      score: toNumber(item.compositeScore),
    }))
    .filter((it) => it.fullName.includes('/'));
}

function fromOss(p: OssTrendingPayload | null): ConsensusSourceInput[] {
  const rows = p?.buckets?.past_24_hours?.All ?? [];
  return rows
    .map((row, idx) => ({
      fullName: String(row.repo_name ?? ''),
      rank: idx + 1,
      score: toNumber(row.total_score),
    }))
    .filter((it) => it.fullName.includes('/'));
}

function fromHf(p: HfTrendingPayload | null): ConsensusSourceInput[] {
  const rows = Array.isArray(p?.models) ? p.models : [];
  return rows
    .map((row, idx) => ({
      fullName: String(row.id ?? ''),
      rank: typeof row.rank === 'number' ? row.rank : idx + 1,
      score: toNumber(row.trendingScore),
    }))
    .filter((it) => it.fullName.includes('/'));
}

function fromLeaderboard(
  p: MentionsPayload | null,
  scoreField: keyof LeaderboardEntry,
): ConsensusSourceInput[] {
  const rows = Array.isArray(p?.leaderboard) ? p.leaderboard : [];
  // Sort by the source's primary engagement field, descending. Rank = position.
  const sorted = rows
    .filter((row): row is LeaderboardEntry => Boolean(row?.fullName?.includes('/')))
    .map((row) => ({
      row,
      sortKey: toNumber(row[scoreField]) ?? 0,
    }))
    .sort((a, b) => b.sortKey - a.sortKey);
  return sorted.map((entry, idx) => ({
    fullName: String(entry.row.fullName),
    rank: idx + 1,
    score: entry.sortKey,
  }));
}

function fromProductHunt(p: ProductHuntPayload | null): ConsensusSourceInput[] {
  const rows = Array.isArray(p?.launches) ? p.launches : [];
  // ProductHunt launches with linkedRepo are GitHub-tracked products.
  // Aggregate votes per repo.
  const byRepo = new Map<string, number>();
  for (const launch of rows) {
    const linked = launch.linkedRepo;
    if (!linked || !linked.includes('/')) continue;
    const lower = linked.toLowerCase();
    byRepo.set(lower, (byRepo.get(lower) ?? 0) + (toNumber(launch.votesCount) ?? 1));
  }
  const sorted = Array.from(byRepo.entries())
    .map(([fullName, votes]) => ({ fullName, votes }))
    .sort((a, b) => b.votes - a.votes);
  return sorted.map((entry, idx) => ({
    fullName: entry.fullName,
    rank: idx + 1,
    score: entry.votes,
  }));
}

function fromTwitter(p: TwitterTrendingPayload | null): ConsensusSourceInput[] {
  // Twitter feed is not yet wired to Redis (Apify collector still file-based).
  // Defensive: read if present, otherwise empty.
  const rows = Array.isArray(p?.items) ? p.items : [];
  return rows
    .map((row, idx) => ({
      fullName: String(row.fullName ?? ''),
      rank: typeof row.rank === 'number' ? row.rank : idx + 1,
      score: toNumber(row.mentions ?? row.impressions),
    }))
    .filter((it) => it.fullName.includes('/'));
}

const fetcher: Fetcher = {
  name: 'consensus-trending',
  // Runs after engagement-composite (:45) and the late-hour fetchers, so all
  // 8 external feeds + ours are fresh.
  schedule: '50 * * * *',
  async run(ctx: FetcherContext): Promise<RunResult> {
    const startedAt = new Date().toISOString();

    if (ctx.dryRun) {
      ctx.log.info('consensus-trending dry-run');
      return done(startedAt, 0, false);
    }

    // AUDIT-2026-05-04: consensus-trending was 45h stale because a single
    // Redis flake on any of these 9 reads would reject the Promise.all
    // and crash the whole fetcher (run.ts captures + rethrows; cron
    // .catch swallows; meta key never refreshes). Switch to allSettled
    // so per-source flakes degrade to null (treated identically to a
    // genuine cache miss by the from*() coercers below) and the
    // fetcher always publishes SOMETHING. Per-key failures are logged
    // so they're not invisible.
    const reads = await Promise.allSettled([
      readDataStore<EngagementCompositePayload>('engagement-composite'),
      readDataStore<OssTrendingPayload>('trending'),
      readDataStore<HfTrendingPayload>('huggingface-trending'),
      readDataStore<MentionsPayload>('hackernews-repo-mentions'),
      readDataStore<TwitterTrendingPayload>('twitter-trending'),
      readDataStore<MentionsPayload>('reddit-mentions'),
      readDataStore<ProductHuntPayload>('producthunt-launches'),
      readDataStore<MentionsPayload>('devto-mentions'),
      readDataStore<MentionsPayload>('bluesky-mentions'),
    ]);
    const READ_KEYS = [
      'engagement-composite',
      'trending',
      'huggingface-trending',
      'hackernews-repo-mentions',
      'twitter-trending',
      'reddit-mentions',
      'producthunt-launches',
      'devto-mentions',
      'bluesky-mentions',
    ] as const;
    const readFailures: Array<{ key: string; err: string }> = [];
    const values = reads.map((r, i) => {
      if (r.status === 'fulfilled') return r.value;
      readFailures.push({
        key: READ_KEYS[i] ?? `index-${i}`,
        err: r.reason instanceof Error ? r.reason.message : String(r.reason),
      });
      return null;
    });
    if (readFailures.length > 0) {
      ctx.log.warn(
        { failures: readFailures },
        'consensus-trending: some reads failed; degrading those sources to null',
      );
    }
    const [
      engagement,
      oss,
      hf,
      hnMentions,
      twitter,
      redditMentions,
      ph,
      devtoMentions,
      blueskyMentions,
    ] = values as [
      EngagementCompositePayload | null,
      OssTrendingPayload | null,
      HfTrendingPayload | null,
      MentionsPayload | null,
      TwitterTrendingPayload | null,
      MentionsPayload | null,
      ProductHuntPayload | null,
      MentionsPayload | null,
      MentionsPayload | null,
    ];

    const input: ConsensusScoreInput = {
      ours: fromEngagement(engagement),
      gh: fromOss(oss),
      hf: fromHf(hf),
      hn: fromLeaderboard(hnMentions, 'scoreSum7d'),
      x: fromTwitter(twitter),
      r: fromLeaderboard(redditMentions, 'upvotes7d'),
      pdh: fromProductHunt(ph),
      dev: fromLeaderboard(devtoMentions, 'reactionsSum7d'),
      bs: fromLeaderboard(blueskyMentions, 'likesSum7d'),
      limit: TOP_LIMIT,
    };

    const items = scoreConsensus(input);

    const sourceStats: Record<ConsensusExternalSource, { count: number; rows: number }> = {
      gh: { count: input.gh.length, rows: oss?.buckets?.past_24_hours?.All?.length ?? 0 },
      hf: { count: input.hf.length, rows: hf?.models?.length ?? 0 },
      hn: { count: input.hn.length, rows: hnMentions?.leaderboard?.length ?? 0 },
      x: { count: input.x.length, rows: twitter?.items?.length ?? 0 },
      r: { count: input.r.length, rows: redditMentions?.leaderboard?.length ?? 0 },
      pdh: { count: input.pdh.length, rows: ph?.launches?.length ?? 0 },
      dev: { count: input.dev.length, rows: devtoMentions?.leaderboard?.length ?? 0 },
      bs: { count: input.bs.length, rows: blueskyMentions?.leaderboard?.length ?? 0 },
    };

    const payload: ConsensusTrendingPayload = {
      computedAt: new Date().toISOString(),
      itemCount: items.length,
      weights: CONSENSUS_WEIGHTS,
      sourceStats,
      bandCounts: bandCounts(items),
      items,
    };

    const result = await writeDataStore('consensus-trending', payload);
    ctx.log.info(
      {
        itemCount: items.length,
        bandCounts: payload.bandCounts,
        sourceRows: Object.fromEntries(
          EXTERNAL_SOURCES.map((k) => [k, input[k].length]),
        ),
        oursRows: input.ours.length,
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
