// velocity-refresh — frequent (every 40 min) CHEAP top-N star-velocity refresh.
//
// WHY THIS EXISTS
// `star-activity-deltas` recomputes 24h/7d/30d once a day (05:30 UTC), so the
// homepage velocity board only moves once per day. The operator wants the
// numbers (stars gained + %) refreshed every 30–60 min, OSS-Insight-independent,
// gathered by us via the GitHub token pool. This fetcher delivers that for the
// repos users actually see.
//
// THE TWO-TIER ENGINE (read before changing the cadence)
//   tier 1 — THIS fetcher: every 40 min, the CHEAP path. One
//     `GET /repos/{owner}/{name}` (1 request → `stargazers_count`) for the
//     top-N by current velocity, update today's `star-activity` point, recompute
//     the per-repo delta entry, and merge it into the shared `star-activity-deltas`
//     slug the app already reads. Keeps `stars_now` + 24h live intra-day and
//     re-diffs 7d/30d against whatever anchors exist.
//   tier 2 — `velocity-seed` (daily): the EXPENSIVE newest-first stargazer walk,
//     bounded + throttled, that creates the recent 7d/30d anchor points tier 1
//     diffs against.
//   broad/long-tail — `star-activity` (daily): cheap snapshot of the FULL
//     registry; over days this accrues the anchors for everyone.
//
// SCALE FINDING (do NOT undo): the naive full-registry stargazer WALK fails to
// GitHub's secondary rate limit at scale (571/700 in one sweep). This fetcher is
// the cheap 1-call path precisely so it can run often over the top-N without
// tripping that limit. The walk stays in `velocity-seed`, bounded.
//
// OUTPUT merges into slug `star-activity-deltas` (same shape + keying as the
// daily fetcher) so the app reader (src/lib/star-activity-deltas.ts) needs zero
// changes — it just sees fresher numbers. Partial top-N entries are overlaid on
// the existing payload; untouched repos are preserved (last daily compute).
//
// ZERO-WRITE GUARD never overwrites a populated slug with an empty recompute
// (shouldPreserveCache — also satisfies lint:guards / keep-last-50).

import type { Fetcher, FetcherContext, RunResult } from '../../lib/types.js';
import { readDataStore, writeDataStore } from '../../lib/redis.js';
import { shouldPreserveCache } from '../../lib/util/cache-merge.js';
import {
  pickGithubToken,
  parseRateLimitHeaders,
  recordRateLimit,
} from '../../lib/util/github-token-pool.js';
import {
  rankedRegistryFullNames,
  type RegistryPayloadLite,
} from '../../lib/util/registry-candidates.js';
import { appendToday, type StarActivityPayload } from '../star-activity/index.js';
import {
  entryFromPayload,
  type SADeltaBasis,
  type SADeltaEntry,
  type StarActivityDeltasPayload,
} from '../star-activity-deltas/index.js';

// --- env-tunable knobs -----------------------------------------------------

function clampEnv(name: string, def: number, lo: number, hi: number): number {
  const n = Number.parseInt(process.env[name] ?? '', 10);
  const v = Number.isFinite(n) && n > 0 ? n : def;
  return Math.max(lo, Math.min(hi, v));
}

// Refresh the top-N most-active repos each tick. 300 cheap calls every 40 min
// (~10.8k/day) is trivial for the 20-token pool (100k/hr capacity).
const TOP_N = clampEnv('VELOCITY_REFRESH_TOP_N', 300, 10, 2000);
const CONCURRENCY = 4;
const FETCH_TIMEOUT_MS = 12_000;

// --- helpers ---------------------------------------------------------------

function payloadSlug(fullName: string): string {
  return `star-activity:${fullName.toLowerCase().replace('/', '__')}`;
}

function ghHeaders(token: string | undefined): Record<string, string> {
  const h: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'starscreener-velocity-refresh',
  };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

/**
 * Cheap current-star lookup: one `GET /repos/{owner}/{name}` → stargazers_count.
 * Records the response's rate-limit headers back into the shared pool so the
 * app + worker lanes coordinate quota. Returns null on any non-OK / parse miss.
 */
async function fetchCurrentStars(
  fullName: string,
  token: string | undefined,
): Promise<number | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${fullName}`, {
      headers: ghHeaders(token),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (token) {
      const rl = parseRateLimitHeaders(res.headers);
      if (rl) recordRateLimit(token, rl.remaining, rl.resetUnixSec);
    }
    if (!res.ok) return null;
    const data = (await res.json()) as { stargazers_count?: number };
    return typeof data.stargazers_count === 'number' ? data.stargazers_count : null;
  } catch {
    return null;
  }
}

/**
 * Choose the top-N repos to refresh, ordered by current 24h star velocity from
 * the existing `star-activity-deltas` slug (highest movers first), topped up
 * from the registry (most-recently-seen) when the deltas slug is thin/empty.
 *
 * Keyed by lowercased fullName throughout — GitHub's `/repos` endpoint and
 * `payloadSlug` are both case-insensitive, and the deltas slug keys this way, so
 * a single lowercased identity composes cleanly across read/fetch/merge.
 *
 * Pure.
 */
export function pickTopByVelocity(
  deltas: StarActivityDeltasPayload | null,
  registry: RegistryPayloadLite | null,
  topN: number,
): string[] {
  const ranked = Object.entries(deltas?.repos ?? {})
    .filter(
      ([k, e]) =>
        typeof k === 'string' &&
        k.includes('/') &&
        !!e &&
        typeof e.delta_24h?.value === 'number',
    )
    .map(([k, e]) => ({ fullName: k, v: (e as SADeltaEntry).delta_24h.value as number }))
    .sort((a, b) =>
      b.v !== a.v ? b.v - a.v : a.fullName < b.fullName ? -1 : a.fullName > b.fullName ? 1 : 0,
    )
    .map((r) => r.fullName);

  if (ranked.length >= topN) return ranked.slice(0, topN);

  // Top up from the registry (most recently seen) so a thin deltas slug still
  // gets a full working set — and brand-new repos with no delta yet get covered.
  const out = [...ranked];
  const seen = new Set(out.map((s) => s.toLowerCase()));
  for (const fn of rankedRegistryFullNames(registry, topN, 'desc')) {
    const key = fn.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
    if (out.length >= topN) break;
  }
  return out.slice(0, topN);
}

/** Overlay fresh top-N entries onto the prior full delta map (fresh wins). Pure. */
export function mergeDeltaRepos(
  existing: Record<string, SADeltaEntry>,
  fresh: Record<string, SADeltaEntry>,
): Record<string, SADeltaEntry> {
  return { ...existing, ...fresh };
}

/** Recompute the per-basis coverage histogram over a full delta map. Pure. */
export function computeCoverage(
  repos: Record<string, SADeltaEntry>,
): Record<SADeltaBasis, number> {
  const coverage: Record<SADeltaBasis, number> = {
    exact: 0,
    nearest: 0,
    'cold-start': 0,
    'no-history': 0,
  };
  for (const e of Object.values(repos)) {
    coverage[e.delta_24h.basis] += 1;
    coverage[e.delta_7d.basis] += 1;
    coverage[e.delta_30d.basis] += 1;
  }
  return coverage;
}

// --- fetcher ---------------------------------------------------------------

const fetcher: Fetcher = {
  name: 'velocity-refresh',
  // Every 40 min, off the :00/:30 slots (jittered away from the bursty marks).
  schedule: '*/40 * * * *',
  async run(ctx: FetcherContext): Promise<RunResult> {
    const startedAt = new Date().toISOString();
    const errors: RunResult['errors'] = [];

    if (ctx.dryRun) {
      ctx.log.info('velocity-refresh dry-run');
      return done(startedAt, 0, false, errors);
    }

    const [registry, prior] = await Promise.all([
      readDataStore<RegistryPayloadLite>('repo-registry').catch(() => null),
      readDataStore<StarActivityDeltasPayload>('star-activity-deltas').catch(() => null),
    ]);

    const candidates = pickTopByVelocity(prior, registry, TOP_N);
    if (candidates.length === 0) {
      ctx.log.warn('velocity-refresh: no candidates (empty deltas slug + registry)');
      return done(startedAt, 0, false, errors);
    }

    const fresh: Record<string, SADeltaEntry> = {};
    let refreshed = 0;
    let skipped = 0;

    const queue = [...candidates];
    const workers = Array.from({ length: CONCURRENCY }, async () => {
      while (queue.length > 0) {
        const fullName = queue.shift();
        if (!fullName) break;
        const token = pickGithubToken() ?? undefined;
        try {
          const stars = await fetchCurrentStars(fullName, token);
          if (stars === null) {
            skipped += 1;
            continue;
          }
          const slug = payloadSlug(fullName);
          const existing = await readDataStore<StarActivityPayload>(slug).catch(
            () => null,
          );
          const updated = appendToday(existing, fullName, stars);
          await writeDataStore(slug, updated, { writer: 'velocity-refresh' });
          const entry = entryFromPayload(updated);
          if (entry) {
            fresh[fullName.toLowerCase()] = entry;
            refreshed += 1;
          } else {
            skipped += 1;
          }
        } catch (err) {
          skipped += 1;
          errors.push({
            stage: `repo:${fullName}`,
            message: (err as Error).message ?? String(err),
          });
        }
      }
    });
    await Promise.all(workers);

    const freshEntries = Object.values(fresh);

    // Re-read the slug right before merge to shrink the cross-fetcher race
    // window: the daily star-activity-deltas full recompute may have written
    // during our ~25s of GitHub calls, and merging onto the start-of-run
    // snapshot would silently drop its fresh entries. Fall back to the
    // start-of-run prior if the re-read fails.
    const latest = await readDataStore<StarActivityDeltasPayload>(
      'star-activity-deltas',
    ).catch(() => null);
    const priorRepos = latest?.repos ?? prior?.repos ?? {};

    // Zero-write guard: an empty recompute (every fetch failed — most often the
    // GH token pool is exhausted/expired) must not blank a populated slug.
    // Surface it as an ERROR + a run error so it shows in the run-summary and is
    // caught by the star-activity-deltas freshness monitor, rather than silently
    // serving a stale board.
    if (shouldPreserveCache({ fresh: freshEntries, existing: Object.values(priorRepos) })) {
      ctx.log.error(
        { candidates: candidates.length, priorRepos: Object.keys(priorRepos).length },
        'velocity-refresh: empty recompute — preserving prior slug (check GH token pool health)',
      );
      errors.push({
        stage: 'empty-recompute',
        message:
          'all top-N refreshes failed (likely GH token pool exhausted); preserved prior slug',
      });
      return done(startedAt, 0, false, errors);
    }

    const mergedRepos = mergeDeltaRepos(priorRepos, fresh);
    const payload: StarActivityDeltasPayload = {
      computedAt: new Date().toISOString(),
      coverage: computeCoverage(mergedRepos),
      repos: mergedRepos,
    };
    // Wrap the final write: a Redis blip here would otherwise throw, lose this
    // tick's intra-day refresh, and only surface in logs. Capture + degrade.
    try {
      const result = await writeDataStore('star-activity-deltas', payload, {
        writer: 'velocity-refresh',
      });
      ctx.log.info(
        {
          candidates: candidates.length,
          refreshed,
          skipped,
          totalRepos: Object.keys(mergedRepos).length,
          coverage: payload.coverage,
          redisSource: result.source,
        },
        'velocity-refresh published',
      );
      return done(startedAt, refreshed, result.source === 'redis', errors);
    } catch (err) {
      errors.push({
        stage: 'write:star-activity-deltas',
        message: (err as Error).message ?? String(err),
      });
      ctx.log.error({ err }, 'velocity-refresh: slug write failed — prior preserved');
      return done(startedAt, 0, false, errors);
    }
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
    fetcher: 'velocity-refresh',
    startedAt,
    finishedAt: new Date().toISOString(),
    itemsSeen: items,
    itemsUpserted: 0,
    metricsWritten: 0,
    redisPublished,
    errors,
  };
}
