// Engagement composite scoring fetcher.
//
// Hourly @ :45 — runs after every upstream signal slug has had time to
// flush. Pulls active upstream payloads, aggregates per-repo signals, runs
// the pure scoring kernel from scoring.ts, and publishes a ranked
// leaderboard (top 200) to ss:data:v1:engagement-composite.
//
// Cohort: union of every full_name we observe across upstream slugs
// PLUS the canonical tracked-repo set. The intersection isn't enough
// because a niche repo with strong HN attention but no GH activity
// today should still appear; the union is bounded by upstream slug
// sizes (~200-500 repos in practice).
//
// Slug: `engagement-composite`. Cron: `45 * * * *`.

import type { Fetcher, FetcherContext, RunResult } from '../../lib/types.js';
import { writeDataStore, readDataStore } from '../../lib/redis.js';
import { loadTrackedRepos } from '../../lib/util/tracked-repos.js';
import { scoreCohort, WEIGHTS } from './scoring.js';
import type {
  EngagementCompositePayload,
  NormalizedRepoSignals,
} from './types.js';

const TOP_LIMIT = 200;

// ---------------------------------------------------------------------------
// Upstream payload type stubs (non-exhaustive — only the fields we read)
// ---------------------------------------------------------------------------

interface HnMentionsBucket {
  count7d?: number;
  scoreSum7d?: number;
}
interface HnMentionsPayload {
  mentions?: Record<string, HnMentionsBucket>;
}

interface BlueskyMentionsBucket {
  count7d?: number;
  likesSum7d?: number;
  repostsSum7d?: number;
}
interface BlueskyMentionsPayload {
  mentions?: Record<string, BlueskyMentionsBucket>;
}

interface DevtoMentionsBucket {
  count7d?: number;
  reactionsSum7d?: number;
}
interface DevtoMentionsPayload {
  mentions?: Record<string, DevtoMentionsBucket>;
}

interface NpmPackage {
  name?: string;
  linkedRepo?: string | null;
  downloads7d?: number;
}
interface NpmPackagesPayload {
  packages?: NpmPackage[];
}

interface DeltaValue {
  value?: number | null;
}
interface DeltaRepoEntry {
  stars_now?: number;
  delta_24h?: DeltaValue;
  delta_7d?: DeltaValue;
}
interface DeltasPayload {
  repos?: Record<string, DeltaRepoEntry>;
}

interface RepoMetadataItem {
  fullName?: string;
}
interface RepoMetadataPayload {
  items?: RepoMetadataItem[];
}

interface PhLaunch {
  linkedRepo?: string | null;
  votesCount?: number;
}
interface PhLaunchesPayload {
  launches?: PhLaunch[];
}

interface GhEventsStreamRepoEntry {
  events7d?: number;
}
interface GhEventsStreamPayload {
  computedAt?: string;
  repos?: Record<string, GhEventsStreamRepoEntry>;
}

/**
 * Drop ghEvents data older than 90 minutes per the no-publicly-stale-batches
 * rule. gh-events-stream runs at :15 + :45 so a healthy snapshot is at most
 * 30 minutes old; 90min gives a 3x grace for transient cron misses.
 */
const GH_EVENTS_STALENESS_BUDGET_MS = 90 * 60 * 1000;

// ---------------------------------------------------------------------------
// Aggregation helpers
// ---------------------------------------------------------------------------

interface SignalAccum {
  canonicalByLower: Map<string, string>; // lowerKey -> canonical fullName
  rows: Map<string, NormalizedRepoSignals>; // lowerKey -> row
}

function emptyAccum(): SignalAccum {
  return {
    canonicalByLower: new Map(),
    rows: new Map(),
  };
}

function ensureRow(accum: SignalAccum, fullName: string): NormalizedRepoSignals {
  const lower = fullName.toLowerCase();
  const canonical = accum.canonicalByLower.get(lower) ?? fullName;
  // Prefer the first canonical we see; later sources won't override case.
  if (!accum.canonicalByLower.has(lower)) {
    accum.canonicalByLower.set(lower, canonical);
  }
  let row = accum.rows.get(lower);
  if (!row) {
    row = {
      fullName: canonical,
      hn: 0,
      reddit: 0,
      bluesky: 0,
      devto: 0,
      npm: 0,
      ghStars: 0,
      ph: 0,
      ghEvents: 0,
    };
    accum.rows.set(lower, row);
  }
  return row;
}

function safeNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function nonNegative(value: number): number {
  return value > 0 ? value : 0;
}

const fetcher: Fetcher = {
  name: 'engagement-composite',
  schedule: '45 * * * *',
  async run(ctx: FetcherContext): Promise<RunResult> {
    const startedAt = new Date().toISOString();
    const errors: RunResult['errors'] = [];

    if (ctx.dryRun) {
      ctx.log.info('engagement-composite dry-run');
      return done(startedAt, 0, false, errors);
    }

    // AUDIT-2026-05-04: same Promise.all-rejects-everything anti-pattern
    // that bricked consensus-trending (see f39cd09d). engagement-composite
    // is the upstream of consensus-trending, so a flake here cascades.
    // tracked is required (no repos = no work); the readDataStore calls
    // each degrade to null on per-source flakes.
    const tracked = await loadTrackedRepos({ log: ctx.log });
    const reads = await Promise.allSettled([
      readDataStore<HnMentionsPayload>('hackernews-repo-mentions'),
      readDataStore<BlueskyMentionsPayload>('bluesky-mentions'),
      readDataStore<DevtoMentionsPayload>('devto-mentions'),
      readDataStore<NpmPackagesPayload>('npm-packages'),
      readDataStore<DeltasPayload>('deltas'),
      readDataStore<RepoMetadataPayload>('repo-metadata'),
      readDataStore<PhLaunchesPayload>('producthunt-launches'),
    ]);
    const READ_KEYS = [
      'hackernews-repo-mentions',
      'bluesky-mentions',
      'devto-mentions',
      'npm-packages',
      'deltas',
      'repo-metadata',
      'producthunt-launches',
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
      for (const failure of readFailures) {
        errors.push({
          stage: 'upstream-read',
          message: `${failure.key}: ${failure.err}`,
        });
      }
      ctx.log.warn(
        { failures: readFailures },
        'engagement-composite: upstream reads failed; preserving prior slug',
      );
      return done(startedAt, 0, false, errors);
    }
    const missingKeys = values
      .map((value, index) => (value === null ? READ_KEYS[index] : null))
      .filter((key): key is (typeof READ_KEYS)[number] => key !== null);
    if (missingKeys.length > 0) {
      errors.push({
        stage: 'upstream-missing',
        message: `missing upstream payloads: ${missingKeys.join(', ')}`,
      });
      ctx.log.warn(
        { missing: missingKeys },
        'engagement-composite: upstream payloads missing; preserving prior slug',
      );
      return done(startedAt, 0, false, errors);
    }
    const [
      hnMentions,
      blueskyMentions,
      devtoMentions,
      npmPackages,
      deltas,
      repoMetadata,
      phLaunches,
    ] = values as [
      HnMentionsPayload | null,
      BlueskyMentionsPayload | null,
      DevtoMentionsPayload | null,
      NpmPackagesPayload | null,
      DeltasPayload | null,
      RepoMetadataPayload | null,
      PhLaunchesPayload | null,
    ];

    // Soft read — gh-events-stream's absence MUST NOT block the composite
    // (it's a new component as of 2026-06-15 and may not have written yet
    // on cold start). We try once, log on failure, and treat null as
    // "ghEvents contributes 0 for every repo this tick".
    let ghEventsStream: GhEventsStreamPayload | null = null;
    try {
      ghEventsStream = await readDataStore<GhEventsStreamPayload>('gh-events-stream');
    } catch (err) {
      ctx.log.warn(
        { err: err instanceof Error ? err.message : String(err) },
        'engagement-composite: gh-events-stream read failed; treating as missing',
      );
    }

    const accum = emptyAccum();

    // Seed with canonical full names from tracked repos so casing is
    // preserved consistently when downstream slugs only have a lowercase
    // mention key.
    for (const [lower, canonical] of tracked.entries()) {
      accum.canonicalByLower.set(lower, canonical);
    }

    // ---- HN -----------------------------------------------------------------
    let hnRepoCount = 0;
    for (const [fullName, bucket] of Object.entries(hnMentions?.mentions ?? {})) {
      if (!fullName.includes('/')) continue;
      const row = ensureRow(accum, fullName);
      row.hn = nonNegative(safeNumber(bucket?.scoreSum7d));
      hnRepoCount += 1;
    }

    // ---- Bluesky ------------------------------------------------------------
    let blueskyRepoCount = 0;
    for (const [fullName, bucket] of Object.entries(blueskyMentions?.mentions ?? {})) {
      if (!fullName.includes('/')) continue;
      const row = ensureRow(accum, fullName);
      const likes = safeNumber(bucket?.likesSum7d);
      const reposts = safeNumber(bucket?.repostsSum7d);
      row.bluesky = nonNegative(likes + reposts);
      blueskyRepoCount += 1;
    }

    // ---- DEV.to -------------------------------------------------------------
    let devtoRepoCount = 0;
    for (const [fullName, bucket] of Object.entries(devtoMentions?.mentions ?? {})) {
      if (!fullName.includes('/')) continue;
      const row = ensureRow(accum, fullName);
      row.devto = nonNegative(safeNumber(bucket?.reactionsSum7d));
      devtoRepoCount += 1;
    }

    // ---- npm downloads (sum across all matching packages per repo) ---------
    let npmPackageMatches = 0;
    const npmByRepo = new Map<string, number>();
    for (const pkg of npmPackages?.packages ?? []) {
      const linked = pkg?.linkedRepo;
      if (typeof linked !== 'string' || !linked.includes('/')) continue;
      const downloads = nonNegative(safeNumber(pkg.downloads7d));
      if (downloads <= 0) continue;
      const lower = linked.toLowerCase();
      npmByRepo.set(lower, (npmByRepo.get(lower) ?? 0) + downloads);
      npmPackageMatches += 1;
    }
    for (const [lower, total] of npmByRepo.entries()) {
      const row = ensureRow(accum, lower);
      row.npm = total;
    }

    // ---- GH stars velocity --------------------------------------------------
    // Prefer delta_7d (true weekly velocity). Fall back to delta_24h * 7
    // when 7d is missing/null (typical for recently-tracked repos with
    // <7d of history). repo-metadata is read primarily to widen the
    // cohort with full names that may not be in any other slug.
    let ghStarsRepoCount = 0;
    for (const [fullName, entry] of Object.entries(deltas?.repos ?? {})) {
      if (!fullName.includes('/')) continue;
      const d7Raw = entry?.delta_7d?.value;
      const d24Raw = entry?.delta_24h?.value;
      const d7 = typeof d7Raw === 'number' && Number.isFinite(d7Raw) ? d7Raw : null;
      const d24 = typeof d24Raw === 'number' && Number.isFinite(d24Raw) ? d24Raw : null;
      let velocity = 0;
      if (d7 !== null) {
        velocity = d7;
      } else if (d24 !== null) {
        velocity = d24 * 7;
      }
      if (velocity > 0) {
        const row = ensureRow(accum, fullName);
        row.ghStars = velocity;
        ghStarsRepoCount += 1;
      }
    }

    // Widen cohort with repo-metadata names (no signal added — just ensures
    // a row exists so the repo can be ranked even with all-zero components).
    for (const item of repoMetadata?.items ?? []) {
      if (typeof item?.fullName === 'string' && item.fullName.includes('/')) {
        ensureRow(accum, item.fullName);
      }
    }

    // ---- ProductHunt --------------------------------------------------------
    // Aggregate votes across all launches that linkedRepo to a given
    // full name (some repos have multiple PH launches over their lifetime).
    let phRepoCount = 0;
    const phByRepo = new Map<string, number>();
    for (const launch of phLaunches?.launches ?? []) {
      const linked = launch?.linkedRepo;
      if (typeof linked !== 'string' || !linked.includes('/')) continue;
      const votes = nonNegative(safeNumber(launch.votesCount));
      if (votes <= 0) continue;
      const lower = linked.toLowerCase();
      phByRepo.set(lower, (phByRepo.get(lower) ?? 0) + votes);
      phRepoCount += 1;
    }
    for (const [lower, total] of phByRepo.entries()) {
      const row = ensureRow(accum, lower);
      row.ph = total;
    }

    // ---- ghEvents (7d rolling event count from gh-events-stream) -----------
    // no-publicly-stale-batches rule: drop the entire ghEvents block if the
    // snapshot is older than 90 minutes (3x the :15/:45 cadence). Drop is
    // all-or-nothing because the snapshot is a single computedAt anchor —
    // there's no per-repo timestamp to selectively keep "fresh" ones.
    let ghEventsRepoCount = 0;
    let ghEventsStale = false;
    if (ghEventsStream && typeof ghEventsStream.computedAt === 'string') {
      const computedMs = Date.parse(ghEventsStream.computedAt);
      if (Number.isFinite(computedMs)) {
        const ageMs = Date.now() - computedMs;
        if (ageMs <= GH_EVENTS_STALENESS_BUDGET_MS) {
          for (const [fullName, entry] of Object.entries(ghEventsStream.repos ?? {})) {
            if (!fullName.includes('/')) continue;
            const events = nonNegative(safeNumber(entry?.events7d));
            if (events <= 0) continue;
            const row = ensureRow(accum, fullName);
            row.ghEvents = events;
            ghEventsRepoCount += 1;
          }
        } else {
          ghEventsStale = true;
          ctx.log.warn(
            {
              ageMs,
              budgetMs: GH_EVENTS_STALENESS_BUDGET_MS,
              computedAt: ghEventsStream.computedAt,
            },
            'engagement-composite: gh-events-stream stale > 90min; dropping ghEvents component this tick',
          );
        }
      }
    }

    // Resolve canonical fullName casing on every row (in case the row was
    // created from a lowercase mention key but a canonical exists).
    for (const [lower, row] of accum.rows.entries()) {
      const canonical = accum.canonicalByLower.get(lower);
      if (canonical && canonical !== row.fullName) {
        row.fullName = canonical;
      }
    }

    const cohort = Array.from(accum.rows.values());
    const items = scoreCohort(cohort, TOP_LIMIT);
    if (items.length === 0) {
      errors.push({
        stage: 'empty-compute',
        message: 'engagement-composite computed 0 rows; skipped empty publish',
      });
      ctx.log.warn(
        { cohortSize: cohort.length },
        'engagement-composite: empty compute; preserving prior slug',
      );
      return done(startedAt, 0, false, errors);
    }

    const payload: EngagementCompositePayload = {
      computedAt: new Date().toISOString(),
      cohortSize: cohort.length,
      itemCount: items.length,
      weights: WEIGHTS,
      items,
    };

    const result = await writeDataStore('engagement-composite', payload);
    ctx.log.info(
      {
        cohortSize: cohort.length,
        itemCount: items.length,
        coverage: {
          hn: hnRepoCount,
          reddit: 0,
          bluesky: blueskyRepoCount,
          devto: devtoRepoCount,
          npmPackages: npmPackageMatches,
          npmRepos: npmByRepo.size,
          ghStars: ghStarsRepoCount,
          ph: phRepoCount,
          ghEvents: ghEventsRepoCount,
          ghEventsStale,
        },
        redisSource: result.source,
        writtenAt: result.writtenAt,
      },
      'engagement-composite published',
    );

    return done(startedAt, items.length, result.source === 'redis', errors);
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
    fetcher: 'engagement-composite',
    startedAt,
    finishedAt: new Date().toISOString(),
    itemsSeen: items,
    itemsUpserted: 0,
    metricsWritten: 0,
    redisPublished,
    errors,
  };
}
