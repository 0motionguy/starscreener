// skill-forks-snapshot fetcher.
//
//   API           none — reads `trending-skill` and `trending-skill-sh` from
//                 Redis and writes a daily fork-count snapshot
//   Auth          none
//   Rate limit    n/a (one Redis read + one write per day)
//   Cache TTL     8d per snapshot (skill-forks-snapshot:<YYYY-MM-DD>)
//   Cadence       daily 03:13 UTC (refresh-skill-forks-snapshot.yml)
//
// Why this exists
//   The skill scorer wants `forkVelocity7d = forks - forks7dAgo`, but cold-
//   start has no history. This fetcher snapshots `forks` per skill once a
//   day, so 7 days from now buildSkillItem can join against
//   `skill-forks-snapshot:<7d-ago>` and populate `forks7dAgo`.
//
//   Rolling window: we purge entries older than 7d at the end of each run by
//   over-writing them with empty payloads (Redis TTL handles the actual
//   expiry — the deletion is belt-and-braces).

import type { Fetcher, FetcherContext, RunResult } from '../../lib/types.js';
import { writeDataStore, readDataStore, getRedis } from '../../lib/redis.js';

const SNAPSHOT_TTL_SECONDS = 8 * 24 * 60 * 60; // 8d (one extra day for read-tolerance)
const ROLLING_DAYS = 7;
const NAMESPACE = 'ss:data:v1';

interface RosterSkillItem {
  slug?: string;
  full_name?: string;
  forks?: number;
  forks_count?: number;
}

interface SnapshotPayload {
  date: string; // YYYY-MM-DD
  fetchedAt: string;
  forks: Record<string, number>; // slug -> forks
  counts: { sources: number; skills: number };
}

const fetcher: Fetcher = {
  name: 'skill-forks-snapshot',
  schedule: '13 3 * * *',
  async run(ctx: FetcherContext): Promise<RunResult> {
    const startedAt = new Date().toISOString();
    if (ctx.dryRun) {
      ctx.log.info('skill-forks-snapshot dry-run');
      return done(startedAt, 0, false, []);
    }

    const errors: RunResult['errors'] = [];
    const today = todayUtc();

    const [github, skillsSh] = await Promise.all([
      readDataStore<{ items?: RosterSkillItem[] }>('trending-skill'),
      readDataStore<{ items?: RosterSkillItem[] }>('trending-skill-sh'),
    ]);

    const forks: Record<string, number> = {};
    let sources = 0;
    if (github?.items) {
      sources += 1;
      for (const it of github.items) absorb(forks, it);
    }
    if (skillsSh?.items) {
      sources += 1;
      for (const it of skillsSh.items) absorb(forks, it);
    }
    const skillCount = Object.keys(forks).length;
    ctx.log.info({ skills: skillCount, sources }, 'skill-forks-snapshot collected');

    if (skillCount === 0) {
      ctx.log.warn('skill-forks-snapshot: no fork data found - both rosters empty');
      return done(startedAt, 0, false, []);
    }

    const payload: SnapshotPayload = {
      date: today,
      fetchedAt: new Date().toISOString(),
      forks,
      counts: { sources, skills: skillCount },
    };
    const writeResult = await writeDataStore(`skill-forks-snapshot:${today}`, payload, {
      ttlSeconds: SNAPSHOT_TTL_SECONDS,
    });

    // Belt-and-braces purge of entries older than ROLLING_DAYS days. TTL alone
    // already handles this, but if the cron skipped a few runs the keys still
    // accumulate — this loop deletes anything > ROLLING_DAYS days old.
    try {
      const handle = await getRedis();
      if (handle) {
        for (let d = ROLLING_DAYS + 1; d <= ROLLING_DAYS + 7; d += 1) {
          const oldDate = isoDateNDaysAgo(d);
          await handle.del(`${NAMESPACE}:skill-forks-snapshot:${oldDate}`);
          await handle.del(`ss:meta:v1:skill-forks-snapshot:${oldDate}`);
        }
      }
    } catch (err) {
      errors.push({ stage: 'purge', message: (err as Error).message });
    }

    ctx.log.info(
      { date: today, skills: skillCount, redisSource: writeResult.source },
      'skill-forks-snapshot published',
    );

    return {
      fetcher: 'skill-forks-snapshot',
      startedAt,
      finishedAt: new Date().toISOString(),
      itemsSeen: skillCount,
      itemsUpserted: 0,
      metricsWritten: skillCount,
      redisPublished: writeResult.source === 'redis',
      errors,
    };
  },
};

export default fetcher;

function absorb(out: Record<string, number>, it: RosterSkillItem): void {
  const slug = String(it.slug ?? it.full_name ?? '').trim().toLowerCase();
  if (!slug) return;
  const v = typeof it.forks === 'number'
    ? it.forks
    : typeof it.forks_count === 'number'
      ? it.forks_count
      : null;
  if (v === null || !Number.isFinite(v) || v < 0) return;
  // First write wins on collision; both feeds usually agree on this slug.
  if (out[slug] === undefined) out[slug] = v;
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
    fetcher: 'skill-forks-snapshot',
    startedAt,
    finishedAt: new Date().toISOString(),
    itemsSeen: items,
    itemsUpserted: 0,
    metricsWritten: 0,
    redisPublished,
    errors,
  };
}
