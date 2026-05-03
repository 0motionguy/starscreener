// skill-install-snapshot fetcher.
//
//   API           none — reads `trending-skill` and `trending-skill-sh` from
//                 Redis and writes a daily install-count snapshot
//   Auth          none
//   Rate limit    n/a (one Redis read + one write per day)
//   Cache TTL     31d per snapshot (skill-install-snapshot:<YYYY-MM-DD>)
//   Cadence       daily 03:00 UTC (refresh-skill-install-snapshot.yml)
//
// Why this exists
//   The skill scorer wants installs deltas at 24h / 7d / 30d windows, but
//   cold-start has no history. This fetcher snapshots `installs7d` per skill
//   once a day, so the reader can join today's totals against
//   `skill-install-snapshot:<N-d-ago>` for N in {1, 7, 30}.
//
//   Rolling window: we keep 31 days of snapshots so the prev30d window has at
//   least one valid candidate even if cron skips a tick. TTL handles expiry;
//   the explicit purge is belt-and-braces for keys that aged out.
//
// W5-SKILLS24H — extended retention from 8d to 31d so prev1d + prev30d
// readers can land. Existing prev7d behavior unchanged.

import type { Fetcher, FetcherContext, RunResult } from '../../lib/types.js';
import { writeDataStore, readDataStore, getRedis } from '../../lib/redis.js';

const SNAPSHOT_TTL_SECONDS = 31 * 24 * 60 * 60; // 31d (covers 24h/7d/30d windows)
const ROLLING_DAYS = 30;
const NAMESPACE = 'ss:data:v1';

interface RosterSkillItem {
  slug?: string;
  full_name?: string;
  installs?: number;
  installs7d?: number;
}

interface SnapshotPayload {
  date: string; // YYYY-MM-DD
  fetchedAt: string;
  installs: Record<string, number>; // slug -> installs7d
  counts: { sources: number; skills: number };
}

const fetcher: Fetcher = {
  name: 'skill-install-snapshot',
  schedule: '0 3 * * *',
  async run(ctx: FetcherContext): Promise<RunResult> {
    const startedAt = new Date().toISOString();
    if (ctx.dryRun) {
      ctx.log.info('skill-install-snapshot dry-run');
      return done(startedAt, 0, false, []);
    }

    const errors: RunResult['errors'] = [];
    const today = todayUtc();

    // AUDIT-2026-05-04: allSettled so a single Redis flake degrades to
    // null instead of crashing the whole fetcher. Same fix as f39cd09d.
    const reads = await Promise.allSettled([
      readDataStore<{ items?: RosterSkillItem[] }>('trending-skill'),
      readDataStore<{ items?: RosterSkillItem[] }>('trending-skill-sh'),
    ]);
    const github = reads[0].status === 'fulfilled' ? reads[0].value : null;
    const skillsSh = reads[1].status === 'fulfilled' ? reads[1].value : null;
    if (reads[0].status === 'rejected' || reads[1].status === 'rejected') {
      ctx.log.warn(
        {
          trendingSkill:
            reads[0].status === 'rejected'
              ? reads[0].reason instanceof Error
                ? reads[0].reason.message
                : String(reads[0].reason)
              : null,
          trendingSkillSh:
            reads[1].status === 'rejected'
              ? reads[1].reason instanceof Error
                ? reads[1].reason.message
                : String(reads[1].reason)
              : null,
        },
        'skill-install-snapshot: roster read failed; degrading to null',
      );
    }

    const installs: Record<string, number> = {};
    let sources = 0;
    if (github?.items) {
      sources += 1;
      for (const it of github.items) absorb(installs, it);
    }
    if (skillsSh?.items) {
      sources += 1;
      for (const it of skillsSh.items) absorb(installs, it);
    }
    const skillCount = Object.keys(installs).length;
    ctx.log.info({ skills: skillCount, sources }, 'skill-install-snapshot collected');

    if (skillCount === 0) {
      ctx.log.warn('skill-install-snapshot: no install data found - both rosters empty');
      return done(startedAt, 0, false, []);
    }

    const payload: SnapshotPayload = {
      date: today,
      fetchedAt: new Date().toISOString(),
      installs,
      counts: { sources, skills: skillCount },
    };
    const writeResult = await writeDataStore(`skill-install-snapshot:${today}`, payload, {
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
          await handle.del(`${NAMESPACE}:skill-install-snapshot:${oldDate}`);
          await handle.del(`ss:meta:v1:skill-install-snapshot:${oldDate}`);
        }
      }
    } catch (err) {
      errors.push({ stage: 'purge', message: (err as Error).message });
    }

    // W5-SKILLS24H: ALSO mirror today's snapshot to fixed window slot keys so
    // the reader can do a single Redis read per window (prev1d/prev7d/prev30d)
    // without needing to know today's UTC date. Each slot points to the
    // snapshot that was current N days ago. Same payload shape — buildItem
    // reads `.installs`. TTL = window + 1d grace so the slot survives
    // between cron ticks.
    //
    // This is additive; the dated keys above remain the canonical history
    // and the prev7d reader keeps working.
    for (const w of [
      { name: '1d', days: 1 },
      { name: '7d', days: 7 },
      { name: '30d', days: 30 },
    ]) {
      const targetDate = isoDateNDaysAgo(w.days);
      const targetKey = `skill-install-snapshot:${targetDate}`;
      const targetPayload = await readDataStore<SnapshotPayload>(targetKey);
      if (!targetPayload || !targetPayload.installs) continue;
      await writeDataStore(`skill-install-snapshot:prev:${w.name}`, targetPayload, {
        ttlSeconds: (w.days + 1) * 24 * 60 * 60,
      });
    }

    ctx.log.info(
      { date: today, skills: skillCount, redisSource: writeResult.source },
      'skill-install-snapshot published',
    );

    return {
      fetcher: 'skill-install-snapshot',
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
  const v = typeof it.installs7d === 'number'
    ? it.installs7d
    : typeof it.installs === 'number'
      ? it.installs
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
    fetcher: 'skill-install-snapshot',
    startedAt,
    finishedAt: new Date().toISOString(),
    itemsSeen: items,
    itemsUpserted: 0,
    metricsWritten: 0,
    redisPublished,
    errors,
  };
}
