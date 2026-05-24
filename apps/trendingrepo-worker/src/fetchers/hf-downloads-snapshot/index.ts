// hf-downloads-snapshot fetcher.
//
//   API           none — reads `huggingface-trending` from Redis and writes
//                 a daily downloads+likes snapshot per HF model id
//   Auth          none
//   Rate limit    n/a (one Redis read + one write per day)
//   Cache TTL     31d per snapshot (hf-downloads-snapshot:<YYYY-MM-DD>)
//   Cadence       daily 04:30 UTC (refresh-hf-downloads-snapshot.yml)
//
// Why this exists
//   HuggingFace's `/api/models` returns `downloads` (lifetime) and `likes`
//   (lifetime) only — no 24h / 7d / 30d windows. To populate the
//   downloadsDelta24h/7d/30d fields the /cat=llms ranker reads, we snapshot
//   today's totals once a day. The reader joins today vs the slot keys
//   (hf-downloads-snapshot:prev:{1,7,30}d) and subtracts:
//     downloads_24h = today.downloads - 1d-ago.downloads
//     downloads_7d  = today.downloads - 7d-ago.downloads
//     downloads_30d = today.downloads - 30d-ago.downloads
//
//   Rolling window: 31d. TTL handles expiry; the belt-and-braces purge
//   below catches anything that aged past the TTL boundary because of
//   skipped cron runs.
//
// Cold-start behavior
//   Day 1: 24h window valid after the 2nd run (today vs yesterday).
//   Day 8: 7d window valid.
//   Day 31: 30d window valid.
//   Before each window matures, the reader falls back to delta=0 and the
//   /cat=llms ranker tiebreaks on absolute downloads — i.e., source-native
//   HF trending rank survives.

import type { Fetcher, FetcherContext, RunResult } from '../../lib/types.js';
import { writeDataStore, readDataStore, getRedis } from '../../lib/redis.js';

const SNAPSHOT_TTL_SECONDS = 31 * 24 * 60 * 60; // 31d (covers 24h/7d/30d windows)
const ROLLING_DAYS = 30;
const NAMESPACE = 'ss:data:v1';

interface RosterHfModel {
  id?: string;
  downloads?: number | null;
  likes?: number | null;
}

interface SnapshotEntry {
  downloads: number;
  likes: number;
}

interface SnapshotPayload {
  date: string; // YYYY-MM-DD
  fetchedAt: string;
  totals: Record<string, SnapshotEntry>; // model id -> totals
  counts: { models: number };
  status?: 'ok' | 'empty';
  reason?: string;
}

const fetcher: Fetcher = {
  name: 'hf-downloads-snapshot',
  schedule: '30 4 * * *',
  async run(ctx: FetcherContext): Promise<RunResult> {
    const startedAt = new Date().toISOString();
    if (ctx.dryRun) {
      ctx.log.info('hf-downloads-snapshot dry-run');
      return done(startedAt, 0, false, []);
    }

    const errors: RunResult['errors'] = [];
    const today = todayUtc();

    let roster: { models?: RosterHfModel[] } | null = null;
    try {
      roster = await readDataStore<{ models?: RosterHfModel[] }>('huggingface-trending');
    } catch (err) {
      errors.push({ stage: 'read-roster', message: (err as Error).message });
      ctx.log.warn(
        { err: (err as Error).message },
        'hf-downloads-snapshot: roster read failed; degrading to empty',
      );
    }
    const models = Array.isArray(roster?.models) ? roster.models : [];
    if (models.length === 0) {
      ctx.log.warn(
        'hf-downloads-snapshot: huggingface-trending roster empty - nothing to snapshot',
      );
      const empty = emptySnapshot(today, 'roster_empty');
      await writeDataStore(`hf-downloads-snapshot:${today}`, empty, {
        ttlSeconds: SNAPSHOT_TTL_SECONDS,
      });
      return done(startedAt, 0, true, errors);
    }

    const totals: Record<string, SnapshotEntry> = {};
    for (const m of models) absorb(totals, m);
    const modelCount = Object.keys(totals).length;
    ctx.log.info({ models: modelCount }, 'hf-downloads-snapshot collected');

    const payload: SnapshotPayload =
      modelCount === 0
        ? emptySnapshot(today, 'no_downloads')
        : {
            date: today,
            fetchedAt: new Date().toISOString(),
            totals,
            counts: { models: modelCount },
            status: 'ok',
          };
    const writeResult = await writeDataStore(
      `hf-downloads-snapshot:${today}`,
      payload,
      { ttlSeconds: SNAPSHOT_TTL_SECONDS },
    );

    // Belt-and-braces purge of entries older than ROLLING_DAYS days.
    try {
      const handle = await getRedis();
      if (handle) {
        for (let d = ROLLING_DAYS + 1; d <= ROLLING_DAYS + 7; d += 1) {
          const oldDate = isoDateNDaysAgo(d);
          await handle.del(`${NAMESPACE}:hf-downloads-snapshot:${oldDate}`);
          await handle.del(`ss:meta:v1:hf-downloads-snapshot:${oldDate}`);
        }
      }
    } catch (err) {
      errors.push({ stage: 'purge', message: (err as Error).message });
    }

    // Slot keys for O(1) reads (no date math). Mirror the
    // skill-install-snapshot pattern: each slot points to the snapshot that
    // was current N days ago. Reader subtracts today's totals from slot
    // totals to synthesize the 24h/7d/30d windows.
    for (const w of [
      { name: '1d', days: 1 },
      { name: '7d', days: 7 },
      { name: '30d', days: 30 },
    ]) {
      const targetDate = isoDateNDaysAgo(w.days);
      const targetKey = `hf-downloads-snapshot:${targetDate}`;
      const targetPayload = await readDataStore<SnapshotPayload>(targetKey);
      const slotPayload =
        targetPayload && targetPayload.totals
          ? targetPayload
          : emptySnapshot(targetDate, 'history_missing');
      await writeDataStore(`hf-downloads-snapshot:prev:${w.name}`, slotPayload, {
        ttlSeconds: (w.days + 1) * 24 * 60 * 60,
      });
    }

    ctx.log.info(
      { date: today, models: modelCount, redisSource: writeResult.source },
      'hf-downloads-snapshot published',
    );

    return {
      fetcher: 'hf-downloads-snapshot',
      startedAt,
      finishedAt: new Date().toISOString(),
      itemsSeen: modelCount,
      itemsUpserted: 0,
      metricsWritten: modelCount,
      redisPublished: writeResult.source === 'redis',
      errors,
    };
  },
};

export default fetcher;

function emptySnapshot(date: string, reason: string): SnapshotPayload {
  return {
    date,
    fetchedAt: new Date().toISOString(),
    totals: {},
    counts: { models: 0 },
    status: 'empty',
    reason,
  };
}

function absorb(out: Record<string, SnapshotEntry>, m: RosterHfModel): void {
  const id = (m.id ?? '').trim().toLowerCase();
  if (!id) return;
  const dl = typeof m.downloads === 'number' && Number.isFinite(m.downloads) && m.downloads >= 0
    ? m.downloads
    : null;
  const lk = typeof m.likes === 'number' && Number.isFinite(m.likes) && m.likes >= 0
    ? m.likes
    : null;
  if (dl === null && lk === null) return;
  // First write wins on duplicate id (rare; HF model ids are unique).
  if (out[id] === undefined) {
    out[id] = { downloads: dl ?? 0, likes: lk ?? 0 };
  }
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
    fetcher: 'hf-downloads-snapshot',
    startedAt,
    finishedAt: new Date().toISOString(),
    itemsSeen: items,
    itemsUpserted: 0,
    metricsWritten: 0,
    redisPublished,
    errors,
  };
}
