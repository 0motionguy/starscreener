// star-activity-deltas — GitHub-direct 24h/7d/30d star deltas, computed
// from the per-repo `star-activity` daily series instead of OSS Insight.
//
// WHY THIS EXISTS
// The homepage Top/Gainer/Trend tabs rank on 24h/7d/30d star growth. Until
// now the ONLY source of real 7d/30d numbers was OSS Insight's
// past_week/past_month trending buckets (api.ossinsight.io). When that
// third-party API 500s — which it does for days at a time — every 7d/30d
// delta on the site collapses to "—", because the only fallback (the
// `deltas` fetcher's snapshot ring) caps at ~2.67 days of history and can
// never satisfy a 7d/30d window (its values are always `cold-start`, which
// the app gates out of DISPLAY).
//
// This fetcher closes that single-point-of-failure. `star-activity` is a
// per-repo daily cumulative star-count series collected straight from the
// GitHub API (backfilled via the stargazer walk for the trending tier;
// forward-appended daily for the registry tail). Diffing today's count
// against the point ~N days ago yields a real, OSS-Insight-independent
// 24h/7d/30d delta with honest basis labelling. The app reads this slug and
// prefers it for 7d/30d (see src/lib/star-activity-deltas.ts + the
// resolveDelta() precedence in src/lib/derived-repos.ts).
//
// OUTPUT slug `star-activity-deltas`, keyed by lowercased fullName so the
// app can join on registry `entry.fullName` (always present), unlike the
// numeric-repo_id-keyed `deltas` slug.
//
// SCHEDULE daily 05:30 UTC — after `star-activity` (04:17) has appended
// today's points and the GH Action append-star-activity (03:17) has covered
// the trending tier.
//
// ZERO-WRITE GUARD a recompute that produces zero entries (e.g. registry
// read failed) MUST NOT overwrite a populated slug — same hazard class as
// the recent-repos regression. Uses shouldPreserveCache from the shared
// cache-merge primitive (also satisfies lint:guards / keep-last-50).

import type { Fetcher, FetcherContext, RunResult } from '../../lib/types.js';
import { readDataStore, writeDataStore } from '../../lib/redis.js';
import { shouldPreserveCache } from '../../lib/util/cache-merge.js';
import {
  rankedRegistryFullNames,
  type RegistryPayloadLite,
} from '../../lib/util/registry-candidates.js';

// --- env-tunable knobs -----------------------------------------------------

// Effectively "all registry repos" — bounded only so a runaway registry
// can't make the run unbounded. The trending tier (~1000) plus the
// daily-appended tail all fit comfortably under this.
const MAX_CANDIDATES = Math.max(
  100,
  Math.min(
    20_000,
    Number.parseInt(process.env.STAR_ACTIVITY_DELTAS_LIMIT ?? '5000', 10) || 5000,
  ),
);
const CONCURRENCY = 8;

const DAY_MS = 86_400_000;

// Per-window target + tolerance (days). A historical point within tolerance
// of (latest - windowDays) yields a real `exact`/`nearest` delta; a point
// only further back (shallow series) yields a best-effort `cold-start` the
// app gates out of display but still uses for ranking.
const WINDOWS = [
  { key: '24h' as const, days: 1, tolDays: 1 },
  { key: '7d' as const, days: 7, tolDays: 2 },
  { key: '30d' as const, days: 30, tolDays: 5 },
];

type WindowKey = (typeof WINDOWS)[number]['key'];

// --- payload shapes (kept self-describing; mirrored app-side in
//     src/lib/star-activity-deltas.ts) -------------------------------------

interface StarActivityPointLite {
  d: string; // YYYY-MM-DD UTC bucket
  s: number; // cumulative stars at end of day
}
interface StarActivityPayloadLite {
  points?: StarActivityPointLite[];
  // True when the backfill walked all the way back to the repo's first star.
  // When set, points[0] is the genuine inception, so a repo younger than a
  // window has gained ALL its stars within that window.
  coversFirstStar?: boolean;
}

export type SADeltaBasis = 'exact' | 'nearest' | 'cold-start' | 'no-history';

export interface SADeltaValue {
  value: number | null;
  basis: SADeltaBasis;
  from_d?: string; // date of the historical point used
  age_days?: number; // how far back that point actually was (cold-start only)
}

export interface SADeltaEntry {
  stars_now: number;
  latest_d: string;
  delta_24h: SADeltaValue;
  delta_7d: SADeltaValue;
  delta_30d: SADeltaValue;
}

export interface StarActivityDeltasPayload {
  computedAt: string;
  coverage: Record<SADeltaBasis, number>;
  repos: Record<string, SADeltaEntry>;
}

// --- pure compute ----------------------------------------------------------

function dayMs(d: string): number {
  return Date.parse(`${d}T00:00:00Z`);
}

const NO_HISTORY: SADeltaValue = { value: null, basis: 'no-history' };

/**
 * Compute one window's delta from an ascending-by-date points series.
 * `latest` is the most recent point (current stars). Considers only points
 * strictly older than `latest`, picks the one nearest to (latest - N days),
 * and labels the basis by how close that point is to the target.
 *
 * Pure.
 */
export function computeWindowDelta(
  points: StarActivityPointLite[],
  latest: StarActivityPointLite,
  windowDays: number,
  tolDays: number,
  coversFirstStar = false,
): SADeltaValue {
  if (points.length < 2) return NO_HISTORY;
  const latestMs = dayMs(latest.d);
  if (!Number.isFinite(latestMs)) return NO_HISTORY;
  const targetMs = latestMs - windowDays * DAY_MS;

  // Young-repo case: when our series covers the repo's first star AND that
  // first star is more recent than the window start, the repo gained ALL of
  // its stars inside this window (it had 0 before it existed). The windowed
  // delta is therefore the full current count — a REAL number, not "—". This
  // is what populates 7d/30d for brand-new viral repos (a 5-day-old repo's
  // 30d delta == its total stars). Without this they'd look back for a
  // non-existent 30-days-ago point and fall to cold-start.
  const oldest = points[0];
  if (oldest && coversFirstStar) {
    const oldestMs = dayMs(oldest.d);
    if (Number.isFinite(oldestMs) && oldestMs > targetMs) {
      return { value: latest.s, basis: 'nearest', from_d: oldest.d };
    }
  }

  let best: StarActivityPointLite | null = null;
  let bestDiff = Infinity;
  for (const p of points) {
    const pMs = dayMs(p.d);
    if (!Number.isFinite(pMs) || pMs >= latestMs) continue;
    const diff = Math.abs(pMs - targetMs);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = p;
    }
  }
  if (!best) return NO_HISTORY;

  const diffDays = Math.round(bestDiff / DAY_MS);
  const value = latest.s - best.s;
  if (diffDays <= tolDays) {
    return { value, basis: diffDays === 0 ? 'exact' : 'nearest', from_d: best.d };
  }
  // Series doesn't reach back far enough — best-effort, gated from display.
  return {
    value,
    basis: 'cold-start',
    from_d: best.d,
    age_days: Math.round((latestMs - dayMs(best.d)) / DAY_MS),
  };
}

/**
 * Build a per-repo delta entry from a star-activity payload, or null when
 * there aren't enough points to compute anything. Pure.
 */
export function entryFromPayload(
  payload: StarActivityPayloadLite | null,
): SADeltaEntry | null {
  const points = Array.isArray(payload?.points) ? payload!.points : [];
  if (points.length < 2) return null;
  const latest = points[points.length - 1];
  if (!latest || typeof latest.s !== 'number' || typeof latest.d !== 'string') {
    return null;
  }
  const covers = payload?.coversFirstStar === true;
  const byKey = {} as Record<`delta_${WindowKey}`, SADeltaValue>;
  for (const w of WINDOWS) {
    byKey[`delta_${w.key}`] = computeWindowDelta(
      points,
      latest,
      w.days,
      w.tolDays,
      covers,
    );
  }
  return {
    stars_now: latest.s,
    latest_d: latest.d,
    delta_24h: byKey.delta_24h,
    delta_7d: byKey.delta_7d,
    delta_30d: byKey.delta_30d,
  };
}

// --- IO helpers ------------------------------------------------------------

function payloadSlug(fullName: string): string {
  return `star-activity:${fullName.toLowerCase().replace('/', '__')}`;
}

// --- fetcher ---------------------------------------------------------------

const fetcher: Fetcher = {
  name: 'star-activity-deltas',
  schedule: '30 5 * * *',
  async run(ctx: FetcherContext): Promise<RunResult> {
    const startedAt = new Date().toISOString();
    const errors: RunResult['errors'] = [];

    if (ctx.dryRun) {
      ctx.log.info('star-activity-deltas dry-run');
      return done(startedAt, 0, false, errors);
    }

    const registry = await readDataStore<RegistryPayloadLite>(
      'repo-registry',
    ).catch(() => null);
    const candidates = rankedRegistryFullNames(registry, MAX_CANDIDATES, 'desc');
    if (candidates.length === 0) {
      ctx.log.warn('star-activity-deltas: no registry candidates available');
      return done(startedAt, 0, false, errors);
    }

    const repos: Record<string, SADeltaEntry> = {};
    const coverage: Record<SADeltaBasis, number> = {
      exact: 0,
      nearest: 0,
      'cold-start': 0,
      'no-history': 0,
    };

    const queue = [...candidates];
    const workers = Array.from({ length: CONCURRENCY }, async () => {
      while (queue.length > 0) {
        const fullName = queue.shift();
        if (!fullName) break;
        try {
          const payload = await readDataStore<StarActivityPayloadLite>(
            payloadSlug(fullName),
          ).catch(() => null);
          const entry = entryFromPayload(payload);
          if (!entry) continue;
          repos[fullName.toLowerCase()] = entry;
          for (const w of WINDOWS) {
            coverage[entry[`delta_${w.key}`].basis] += 1;
          }
        } catch (err) {
          errors.push({
            stage: `repo:${fullName}`,
            message: (err as Error).message ?? String(err),
          });
        }
      }
    });
    await Promise.all(workers);

    const freshEntries = Object.values(repos);

    // Zero-write guard: never overwrite a populated slug with an empty
    // recompute (e.g. registry read returned rows but every star-activity
    // read failed). Same hazard class as the recent-repos regression.
    const prior = await readDataStore<StarActivityDeltasPayload>(
      'star-activity-deltas',
    ).catch(() => null);
    const priorEntries = Object.values(prior?.repos ?? {});
    if (shouldPreserveCache({ fresh: freshEntries, existing: priorEntries })) {
      ctx.log.warn(
        { candidates: candidates.length, priorRepos: priorEntries.length },
        'star-activity-deltas: empty recompute — preserving prior slug',
      );
      return done(startedAt, 0, false, errors);
    }

    const payload: StarActivityDeltasPayload = {
      computedAt: new Date().toISOString(),
      coverage,
      repos,
    };
    const result = await writeDataStore('star-activity-deltas', payload, {
      writer: 'star-activity-deltas',
    });

    ctx.log.info(
      {
        candidates: candidates.length,
        withDeltas: freshEntries.length,
        coverage,
        redisSource: result.source,
      },
      'star-activity-deltas published',
    );

    return done(startedAt, freshEntries.length, result.source === 'redis', errors);
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
    fetcher: 'star-activity-deltas',
    startedAt,
    finishedAt: new Date().toISOString(),
    itemsSeen: items,
    itemsUpserted: 0,
    metricsWritten: 0,
    redisPublished,
    errors,
  };
}
