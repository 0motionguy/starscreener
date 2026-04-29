// hotness-snapshot fetcher.
//
//   API           none — reads `trending-skill`, `trending-skill-sh`, and
//                 `trending-mcp` from Redis and writes a daily hotness
//                 snapshot per domain.
//   Auth          none
//   Rate limit    n/a (one Redis read per domain + one write per domain
//                 per day)
//   Cache TTL     8d per snapshot (hotness-snapshot:<domain>:<YYYY-MM-DD>)
//   Cadence       daily 03:25 UTC (refresh-hotness-snapshot.yml)
//
// Why this exists
//   The /mcp "Hottest by Velocity" tab and /skills "Hottest This Week" tab
//   should rank by Δhotness, but cold-start has no historical hotness data.
//   This fetcher snapshots `hotness` (raw scorer output, falling back to
//   `momentum` / `signalScore`) per item once a day, so 7 days from now the
//   leaderboard reader can join against `hotness-snapshot:<domain>:<7d-ago>`
//   and surface velocity-style ordering.
//
//   Rolling window: 8d TTL means yesterday's snapshot survives one day past
//   the read window, giving the reader a safety margin if the cron skips a
//   tick. Belt-and-braces purge of >8d keys mirrors the install-snapshot
//   pattern so accumulating skipped runs don't pile up keys.

import type { Fetcher, FetcherContext, RunResult } from '../../lib/types.js';
import { writeDataStore, readDataStore, getRedis } from '../../lib/redis.js';

const SNAPSHOT_TTL_SECONDS = 8 * 24 * 60 * 60; // 8d (one extra day for read-tolerance)
const ROLLING_DAYS = 7;
const NAMESPACE = 'ss:data:v1';

// Domains we snapshot. Keys here match the published leaderboard keys; the
// per-item id is whatever the upstream payload uses (skills.sh: source_id,
// GitHub-topic skills: full_name, MCP: id/slug). All ids are lowercased on
// write so the reader can do a case-insensitive lookup.
const DOMAINS = ['trending-skill', 'trending-skill-sh', 'trending-mcp'] as const;
type Domain = (typeof DOMAINS)[number];

interface RosterItem {
  id?: string;
  slug?: string;
  source_id?: string;
  full_name?: string;
  hotness?: number;
  momentum?: number;
  signalScore?: number;
  signal_score?: number;
  trending_score?: number;
}

interface SnapshotPayload {
  date: string; // YYYY-MM-DD
  fetchedAt: string;
  scores: Record<string, number>; // id (lowercased) -> hotness
  counts: { total: number };
}

const fetcher: Fetcher = {
  name: 'hotness-snapshot',
  schedule: '25 3 * * *',
  async run(ctx: FetcherContext): Promise<RunResult> {
    const startedAt = new Date().toISOString();
    if (ctx.dryRun) {
      ctx.log.info('hotness-snapshot dry-run');
      return done(startedAt, 0, false, []);
    }

    const errors: RunResult['errors'] = [];
    const today = todayUtc();
    let totalItems = 0;
    let publishedDomains = 0;

    for (const domain of DOMAINS) {
      try {
        const result = await snapshotDomain(domain, today);
        totalItems += result.count;
        if (result.published) publishedDomains += 1;
        ctx.log.info(
          { domain, items: result.count, published: result.published },
          'hotness-snapshot domain captured',
        );
      } catch (err) {
        errors.push({
          stage: `snapshot:${domain}`,
          message: (err as Error).message,
        });
      }
    }

    // Belt-and-braces purge of entries older than ROLLING_DAYS days. TTL
    // already handles this, but if the cron skipped a few runs the keys
    // still accumulate — this loop deletes anything > ROLLING_DAYS old.
    try {
      const handle = await getRedis();
      if (handle) {
        for (const domain of DOMAINS) {
          for (let d = ROLLING_DAYS + 1; d <= ROLLING_DAYS + 7; d += 1) {
            const oldDate = isoDateNDaysAgo(d);
            await handle.del(`${NAMESPACE}:hotness-snapshot:${domain}:${oldDate}`);
            await handle.del(`ss:meta:v1:hotness-snapshot:${domain}:${oldDate}`);
          }
        }
      }
    } catch (err) {
      errors.push({ stage: 'purge', message: (err as Error).message });
    }

    ctx.log.info(
      { date: today, totalItems, publishedDomains },
      'hotness-snapshot published',
    );

    return {
      fetcher: 'hotness-snapshot',
      startedAt,
      finishedAt: new Date().toISOString(),
      itemsSeen: totalItems,
      itemsUpserted: 0,
      metricsWritten: totalItems,
      redisPublished: publishedDomains > 0,
      errors,
    };
  },
};

export default fetcher;

async function snapshotDomain(
  domain: Domain,
  date: string,
): Promise<{ count: number; published: boolean }> {
  const roster = await readDataStore<{ items?: RosterItem[] }>(domain);
  if (!roster?.items || roster.items.length === 0) {
    return { count: 0, published: false };
  }

  const scores: Record<string, number> = {};
  for (const item of roster.items) absorb(scores, item);

  const count = Object.keys(scores).length;
  if (count === 0) {
    return { count: 0, published: false };
  }

  const payload: SnapshotPayload = {
    date,
    fetchedAt: new Date().toISOString(),
    scores,
    counts: { total: count },
  };
  const writeResult = await writeDataStore(`hotness-snapshot:${domain}:${date}`, payload, {
    ttlSeconds: SNAPSHOT_TTL_SECONDS,
  });
  return { count, published: writeResult.source === 'redis' };
}

function absorb(out: Record<string, number>, it: RosterItem): void {
  const id = String(
    it.id ?? it.slug ?? it.source_id ?? it.full_name ?? '',
  )
    .trim()
    .toLowerCase();
  if (!id) return;
  // Prefer hotness (raw scorer output); fall back to momentum / signalScore /
  // trending_score so cold-start payloads (where the leaderboard publisher
  // hasn't stamped hotness yet) still produce a usable snapshot.
  const v =
    pickFinite(it.hotness) ??
    pickFinite(it.momentum) ??
    pickFinite(it.signalScore) ??
    pickFinite(it.signal_score) ??
    pickFinite(it.trending_score);
  if (v === null) return;
  // First write wins on collision; the publisher emits one row per id.
  if (out[id] === undefined) out[id] = v;
}

function pickFinite(v: unknown): number | null {
  if (typeof v !== 'number') return null;
  return Number.isFinite(v) ? v : null;
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
    fetcher: 'hotness-snapshot',
    startedAt,
    finishedAt: new Date().toISOString(),
    itemsSeen: items,
    itemsUpserted: 0,
    metricsWritten: 0,
    redisPublished,
    errors,
  };
}
