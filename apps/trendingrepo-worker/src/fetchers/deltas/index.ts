// Deltas fetcher.
//
// The GH-Actions version of this (`scripts/compute-deltas.mjs`) walks
// `git log -- data/trending.json` to find historical snapshots inside
// each window {1h, 24h, 7d, 30d}. The worker has no git checkout, so we
// use the next-best signal: the most recent trending payload that's
// already been published to Redis (under `ss:data:v1:trending`).
//
// We stash each fresh `trending` snapshot we observe under a rolling key
// `ss:data:v1:deltas:snapshot:<ageBucket>` (TTL = 35d) so that subsequent
// ticks can read back the snapshot whose age is closest to each window
// target. This builds up real history for 1h/24h/7d/30d coverage without
// any git/disk dependency.
//
// On cold start (no snapshots yet): every window emits {value:null,
// basis:'no-history'} for every repo. The script exits 0 either way —
// downstream readers tolerate missing windows and a partial coverage
// summary is more useful than nothing.
//
// Cadence: hourly at :27, after `oss-trending` writes the fresh
// `trending` payload. Croner runs both jobs at :27 in registration order
// — relying on that ordering is fragile, so we ALSO accept a stale
// (previous-tick) trending snapshot if we beat oss-trending on the same
// minute. coverage will simply lag by one tick.

import type {
  Fetcher,
  FetcherContext,
  RedisHandle,
  RunResult,
} from '../../lib/types.js';
import { writeDataStore } from '../../lib/redis.js';

const TRENDING_KEY = 'ss:data:v1:trending';
const TRENDING_META_KEY = 'ss:meta:v1:trending';
const SNAPSHOT_PREFIX = 'ss:data:v1:deltas:snapshot:';
const SNAPSHOT_INDEX_KEY = 'ss:data:v1:deltas:snapshot-index';
const SNAPSHOT_TTL_SECONDS = 35 * 24 * 60 * 60; // 35 days
const MAX_SNAPSHOTS = 64; // bounded ring; ~one per hour x ~3 days = plenty

// Target windows (seconds) + per-window buffer (how far off a candidate
// snapshot may be from `target = now - window` before falling back).
const WINDOWS = [
  { key: '1h', seconds: 60 * 60, buffer_s: 30 * 60 },
  { key: '24h', seconds: 24 * 60 * 60, buffer_s: 30 * 60 },
  { key: '7d', seconds: 7 * 24 * 60 * 60, buffer_s: 6 * 60 * 60 },
  { key: '30d', seconds: 30 * 24 * 60 * 60, buffer_s: 6 * 60 * 60 },
] as const;

type WindowKey = (typeof WINDOWS)[number]['key'];
const EXACT_THRESHOLD_S = 60;

interface TrendingRow {
  repo_id?: string;
  stars?: string | number;
  [k: string]: unknown;
}
interface TrendingPayload {
  fetchedAt?: string;
  buckets?: Record<string, Record<string, TrendingRow[]>>;
}

interface SnapshotIndexEntry {
  key: string;
  ts: number; // unix seconds
}

interface PickedSnapshot {
  key: string;
  ts: number;
  offset: number;
}

interface DeltaValue {
  value: number | null;
  basis: 'exact' | 'nearest' | 'cold-start' | 'no-history' | 'repo-not-tracked';
  from_ts?: number;
  age_seconds?: number;
}

interface RepoEntry {
  stars_now: number;
  delta_1h: DeltaValue;
  delta_24h: DeltaValue;
  delta_7d: DeltaValue;
  delta_30d: DeltaValue;
}

export interface DeltasPayload {
  computedAt: string;
  windows: Record<WindowKey, (PickedSnapshot & { basis: string }) | null>;
  coverage: Record<DeltaValue['basis'], number>;
  repos: Record<string, RepoEntry>;
}

function flattenToStarsById(payload: TrendingPayload): Map<string, number> {
  const out = new Map<string, number>();
  const buckets = payload?.buckets;
  if (!buckets) return out;
  for (const langMap of Object.values(buckets)) {
    for (const rows of Object.values(langMap)) {
      if (!Array.isArray(rows)) continue;
      for (const row of rows) {
        const id = row?.repo_id;
        if (!id) continue;
        const stars = Number.parseInt(String(row.stars ?? '0'), 10);
        if (!Number.isFinite(stars)) continue;
        const prev = out.get(id);
        if (prev === undefined || stars > prev) out.set(id, stars);
      }
    }
  }
  return out;
}

async function readJson<T>(
  redis: RedisHandle,
  key: string,
): Promise<T | null> {
  const raw = await redis.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function loadSnapshotIndex(
  redis: RedisHandle,
): Promise<SnapshotIndexEntry[]> {
  const idx = await readJson<SnapshotIndexEntry[]>(redis, SNAPSHOT_INDEX_KEY);
  if (!Array.isArray(idx)) return [];
  return idx.filter(
    (e): e is SnapshotIndexEntry =>
      Boolean(e) &&
      typeof e.key === 'string' &&
      typeof e.ts === 'number' &&
      Number.isFinite(e.ts),
  );
}

async function saveSnapshotIndex(
  redis: RedisHandle,
  entries: SnapshotIndexEntry[],
): Promise<void> {
  await redis.set(SNAPSHOT_INDEX_KEY, JSON.stringify(entries), {
    ex: SNAPSHOT_TTL_SECONDS,
  });
}

function pickNearest(
  entries: SnapshotIndexEntry[],
  targetEpoch: number,
  withinSeconds?: number,
): PickedSnapshot | null {
  if (entries.length === 0) return null;
  let best: SnapshotIndexEntry | null = null;
  let bestDelta = Infinity;
  for (const e of entries) {
    const d = Math.abs(e.ts - targetEpoch);
    if (withinSeconds !== undefined && d > withinSeconds) continue;
    if (d < bestDelta) {
      best = e;
      bestDelta = d;
    }
  }
  if (!best) return null;
  return { key: best.key, ts: best.ts, offset: bestDelta };
}

const fetcher: Fetcher = {
  name: 'deltas',
  // Hourly at :29 - two minutes after oss-trending publishes the fresh
  // trending snapshot at :27, giving the snapshot time to land in Redis.
  schedule: '29 * * * *',
  async run(ctx: FetcherContext): Promise<RunResult> {
    const startedAt = new Date().toISOString();
    const errors: RunResult['errors'] = [];

    if (ctx.dryRun) {
      ctx.log.info('deltas dry-run');
      return done(startedAt, 0, false, errors);
    }

    const redis = ctx.redis;
    const now = Math.floor(Date.now() / 1000);

    // 1) Pull current trending payload.
    const currentJson = await readJson<TrendingPayload>(redis, TRENDING_KEY);
    if (!currentJson) {
      const message =
        'no current trending payload at ss:data:v1:trending - waiting for oss-trending';
      ctx.log.warn(message);
      errors.push({ stage: 'read-current', message });
      return done(startedAt, 0, false, errors);
    }
    const currentMetaRaw = await redis.get(TRENDING_META_KEY);
    const currentTs = currentMetaRaw
      ? Math.floor(Date.parse(currentMetaRaw) / 1000)
      : now;
    const currentStars = flattenToStarsById(currentJson);
    if (currentStars.size === 0) {
      const message = 'current trending has zero joinable rows';
      ctx.log.warn(message);
      errors.push({ stage: 'flatten-current', message });
      return done(startedAt, 0, false, errors);
    }

    // 2) Stash the current snapshot under its own key so we can read it
    //    back at a later tick when this `currentTs` becomes "1h ago" /
    //    "24h ago" / etc. The snapshot key is `prefix + currentTs` so
    //    multiple ticks per second don't clobber each other.
    const snapshotKey = `${SNAPSHOT_PREFIX}${currentTs}`;
    await redis.set(snapshotKey, JSON.stringify(currentJson), {
      ex: SNAPSHOT_TTL_SECONDS,
    });

    // 3) Update the snapshot index (sorted by ts asc, capped at MAX_SNAPSHOTS).
    let index = await loadSnapshotIndex(redis);
    if (!index.some((e) => e.key === snapshotKey)) {
      index.push({ key: snapshotKey, ts: currentTs });
    }
    index.sort((a, b) => a.ts - b.ts);
    if (index.length > MAX_SNAPSHOTS) {
      const drop = index.slice(0, index.length - MAX_SNAPSHOTS);
      index = index.slice(index.length - MAX_SNAPSHOTS);
      // Best-effort delete of evicted snapshot keys; ignore failures.
      await Promise.allSettled(drop.map((e) => redis.del(e.key)));
    }
    await saveSnapshotIndex(redis, index);

    // 4) For each window, find the best historical snapshot.
    //    Two-tier match: (a) within buffer ⇒ exact/nearest;
    //    (b) outside buffer but inside index ⇒ cold-start fallback.
    const windowPicks: Record<WindowKey, (PickedSnapshot & { basis: DeltaValue['basis'] }) | null> =
      { '1h': null, '24h': null, '7d': null, '30d': null };
    const historicalStars: Record<WindowKey, Map<string, number> | null> = {
      '1h': null,
      '24h': null,
      '7d': null,
      '30d': null,
    };

    // Exclude the just-written snapshot from history candidates - matching
    // current against current produces a useless zero-delta.
    const historyCandidates = index.filter((e) => e.ts < currentTs);

    for (const w of WINDOWS) {
      const target = currentTs - w.seconds;
      let picked = pickNearest(historyCandidates, target, w.buffer_s);
      let basis: DeltaValue['basis'];
      if (picked) {
        basis = picked.offset < EXACT_THRESHOLD_S ? 'exact' : 'nearest';
      } else {
        picked = pickNearest(historyCandidates, target);
        basis = picked ? 'cold-start' : 'no-history';
      }
      if (picked && basis !== 'no-history') {
        windowPicks[w.key] = { ...picked, basis };
        const histPayload = await readJson<TrendingPayload>(redis, picked.key);
        historicalStars[w.key] = histPayload
          ? flattenToStarsById(histPayload)
          : new Map();
      } else {
        windowPicks[w.key] = null;
      }
    }

    // 5) Build per-repo entries + roll up coverage.
    const coverage: Record<DeltaValue['basis'], number> = {
      exact: 0,
      nearest: 0,
      'cold-start': 0,
      'no-history': 0,
      'repo-not-tracked': 0,
    };
    const repos: Record<string, RepoEntry> = {};

    for (const [repoId, starsNow] of currentStars.entries()) {
      const entry: RepoEntry = {
        stars_now: starsNow,
        delta_1h: { value: null, basis: 'no-history' },
        delta_24h: { value: null, basis: 'no-history' },
        delta_7d: { value: null, basis: 'no-history' },
        delta_30d: { value: null, basis: 'no-history' },
      };
      for (const w of WINDOWS) {
        const pick = windowPicks[w.key];
        const field = `delta_${w.key}` as keyof Pick<
          RepoEntry,
          'delta_1h' | 'delta_24h' | 'delta_7d' | 'delta_30d'
        >;
        if (!pick) {
          coverage['no-history'] += 1;
          continue;
        }
        const histStars = historicalStars[w.key]?.get(repoId);
        if (histStars === undefined) {
          entry[field] = { value: null, basis: 'repo-not-tracked' };
          coverage['repo-not-tracked'] += 1;
          continue;
        }
        const delta: DeltaValue = {
          value: starsNow - histStars,
          basis: pick.basis,
          from_ts: pick.ts,
        };
        if (pick.basis === 'cold-start') {
          delta.age_seconds = currentTs - pick.ts;
        }
        entry[field] = delta;
        coverage[pick.basis] += 1;
      }
      repos[repoId] = entry;
    }

    const payload: DeltasPayload = {
      computedAt: new Date().toISOString(),
      windows: Object.fromEntries(
        Object.entries(windowPicks).map(([k, v]) => [
          k,
          v
            ? {
                key: v.key,
                ts: v.ts,
                offset: v.offset,
                basis: v.basis,
              }
            : null,
        ]),
      ) as DeltasPayload['windows'],
      coverage,
      repos,
    };

    const result = await writeDataStore('deltas', payload);
    ctx.log.info(
      {
        repos: currentStars.size,
        snapshots: index.length,
        coverage,
        redisSource: result.source,
      },
      'deltas published',
    );

    return done(startedAt, currentStars.size, result.source === 'redis', errors);
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
    fetcher: 'deltas',
    startedAt,
    finishedAt: new Date().toISOString(),
    itemsSeen: items,
    itemsUpserted: 0,
    metricsWritten: 0,
    redisPublished,
    errors,
  };
}
