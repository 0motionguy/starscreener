// mcp-usage-snapshot fetcher.
//
//   API           none — reads `trending-mcp` from Redis and writes a daily
//                 usage snapshot per MCP slug
//   Auth          none
//   Rate limit    n/a (one Redis read + one write per day)
//   Cache TTL     35d per snapshot (mcp-usage-snapshot:<YYYY-MM-DD>)
//   Cadence       daily 03:30 UTC (refresh-mcp-usage-snapshot.yml)
//
// Why this exists
//   PulseMCP / Smithery / Anthropic MCP registries do NOT publish per-window
//   install counts (24h / 7d / 30d). They only publish lifetime totals
//   (`useCount`, `installs_total`) and 4-week visitor estimates. To synthesize
//   real 24h / 7d / 30d windows for /mcp's columns, we snapshot the
//   aggregated per-MCP total once a day. The reader then joins against
//   snapshots from 1d / 7d / 30d ago to emit:
//     installs_24h = today.total - 1d-ago.total
//     installs_7d  = today.total - 7d-ago.total
//     installs_30d = today.total - 30d-ago.total
//
//   Rolling window: 35d. Anything older expires via TTL; we belt-and-braces
//   purge ahead of the TTL cliff for stale runs.

import type { Fetcher, FetcherContext, RunResult } from '../../lib/types.js';
import { writeDataStore, readDataStore, getRedis } from '../../lib/redis.js';

const SNAPSHOT_TTL_SECONDS = 36 * 24 * 60 * 60; // 36d (one extra day for read-tolerance)
const ROLLING_DAYS = 35;
const NAMESPACE = 'ss:data:v1';

interface RosterMcpItem {
  slug?: string;
  id?: string;
  metrics?: {
    installs_total?: number | null;
    downloads_7d?: number | null;
    stars_total?: number | null;
  };
  raw?: {
    pulsemcp?: { metrics?: { visitors_4w?: number; use_count?: number } };
    smithery?: { metrics?: { use_count?: number } };
    glama?: { metrics?: { use_count?: number; visitors_4w?: number } };
    official?: { metrics?: { use_count?: number; visitors_4w?: number } };
  };
}

interface SnapshotEntry {
  installs_total?: number;
  use_count?: number;
  visitors_4w?: number;
  downloads_7d?: number;
}

interface SnapshotPayload {
  date: string; // YYYY-MM-DD
  fetchedAt: string;
  totals: Record<string, SnapshotEntry>; // slug -> totals
  counts: { mcps: number };
}

const fetcher: Fetcher = {
  name: 'mcp-usage-snapshot',
  schedule: '30 3 * * *',
  async run(ctx: FetcherContext): Promise<RunResult> {
    const startedAt = new Date().toISOString();
    if (ctx.dryRun) {
      ctx.log.info('mcp-usage-snapshot dry-run');
      return done(startedAt, 0, false, []);
    }

    const errors: RunResult['errors'] = [];
    const today = todayUtc();

    const roster = await readDataStore<{ items?: RosterMcpItem[] }>(
      'trending-mcp',
    );
    const items = Array.isArray(roster?.items) ? roster.items : [];
    if (items.length === 0) {
      ctx.log.warn(
        'mcp-usage-snapshot: trending-mcp roster empty - nothing to snapshot',
      );
      return done(startedAt, 0, false, []);
    }

    const totals: Record<string, SnapshotEntry> = {};
    for (const it of items) absorb(totals, it);
    const mcpCount = Object.keys(totals).length;
    ctx.log.info({ mcps: mcpCount }, 'mcp-usage-snapshot collected');

    if (mcpCount === 0) {
      ctx.log.warn(
        'mcp-usage-snapshot: roster items had no usable totals to snapshot',
      );
      return done(startedAt, 0, false, []);
    }

    const payload: SnapshotPayload = {
      date: today,
      fetchedAt: new Date().toISOString(),
      totals,
      counts: { mcps: mcpCount },
    };
    const writeResult = await writeDataStore(
      `mcp-usage-snapshot:${today}`,
      payload,
      { ttlSeconds: SNAPSHOT_TTL_SECONDS },
    );

    // Belt-and-braces purge of entries older than ROLLING_DAYS days. TTL
    // already handles this, but if the cron skipped runs the keys still
    // accumulate — this loop deletes anything > ROLLING_DAYS days old.
    try {
      const handle = await getRedis();
      if (handle) {
        for (let d = ROLLING_DAYS + 1; d <= ROLLING_DAYS + 7; d += 1) {
          const oldDate = isoDateNDaysAgo(d);
          await handle.del(`${NAMESPACE}:mcp-usage-snapshot:${oldDate}`);
          await handle.del(`ss:meta:v1:mcp-usage-snapshot:${oldDate}`);
        }
      }
    } catch (err) {
      errors.push({ stage: 'purge', message: (err as Error).message });
    }

    ctx.log.info(
      { date: today, mcps: mcpCount, redisSource: writeResult.source },
      'mcp-usage-snapshot published',
    );

    return {
      fetcher: 'mcp-usage-snapshot',
      startedAt,
      finishedAt: new Date().toISOString(),
      itemsSeen: mcpCount,
      itemsUpserted: 0,
      metricsWritten: mcpCount,
      redisPublished: writeResult.source === 'redis',
      errors,
    };
  },
};

export default fetcher;

function absorb(out: Record<string, SnapshotEntry>, it: RosterMcpItem): void {
  const slug = String(it.slug ?? it.id ?? '').trim().toLowerCase();
  if (!slug) return;
  // installs_total is the densest signal — Smithery's useCount lifetime
  // aggregated by the publish layer. Falls back to use_count from any
  // single source when the aggregate isn't computed yet.
  const installsTotal = pickFiniteNumber(
    it.metrics?.installs_total,
    it.raw?.smithery?.metrics?.use_count,
    it.raw?.pulsemcp?.metrics?.use_count,
    it.raw?.glama?.metrics?.use_count,
    it.raw?.official?.metrics?.use_count,
  );
  const useCount = pickFiniteNumber(
    it.raw?.smithery?.metrics?.use_count,
    it.raw?.glama?.metrics?.use_count,
    it.raw?.pulsemcp?.metrics?.use_count,
    it.raw?.official?.metrics?.use_count,
  );
  const visitors4w = pickFiniteNumber(
    it.raw?.pulsemcp?.metrics?.visitors_4w,
    it.raw?.glama?.metrics?.visitors_4w,
    it.raw?.official?.metrics?.visitors_4w,
  );
  const downloads7d = pickFiniteNumber(it.metrics?.downloads_7d);

  // Skip rows with no usable signal at all.
  if (
    installsTotal === undefined &&
    useCount === undefined &&
    visitors4w === undefined &&
    downloads7d === undefined
  ) {
    return;
  }
  const entry: SnapshotEntry = {};
  if (installsTotal !== undefined) entry.installs_total = installsTotal;
  if (useCount !== undefined) entry.use_count = useCount;
  if (visitors4w !== undefined) entry.visitors_4w = visitors4w;
  if (downloads7d !== undefined) entry.downloads_7d = downloads7d;
  // First write wins on slug collision (rare; same slug from two roster
  // entries usually agree on the totals).
  if (out[slug] === undefined) out[slug] = entry;
}

function pickFiniteNumber(
  ...candidates: Array<number | null | undefined>
): number | undefined {
  for (const c of candidates) {
    if (typeof c === 'number' && Number.isFinite(c) && c >= 0) return c;
  }
  return undefined;
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function isoDateNDaysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

function done(
  startedAt: string,
  items: number,
  redisPublished: boolean,
  errors: RunResult['errors'],
): RunResult {
  return {
    fetcher: 'mcp-usage-snapshot',
    startedAt,
    finishedAt: new Date().toISOString(),
    itemsSeen: items,
    itemsUpserted: 0,
    metricsWritten: 0,
    redisPublished,
    errors,
  };
}
