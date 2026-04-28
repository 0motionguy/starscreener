// Engagement composite scoring fetcher.
//
// Hourly @ :45 — runs after every upstream signal slug has had time to
// flush. Pulls 7 upstream payloads, aggregates per-repo signals, runs
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

interface RedditMentionsBucket {
  count7d?: number;
  upvotes7d?: number;
}
interface RedditMentionsPayload {
  mentions?: Record<string, RedditMentionsBucket>;
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

    if (ctx.dryRun) {
      ctx.log.info('engagement-composite dry-run');
      return done(startedAt, 0, false);
    }

    const [
      tracked,
      hnMentions,
      redditMentions,
      blueskyMentions,
      devtoMentions,
      npmPackages,
      deltas,
      repoMetadata,
      phLaunches,
    ] = await Promise.all([
      loadTrackedRepos({ log: ctx.log }),
      readDataStore<HnMentionsPayload>('hackernews-repo-mentions'),
      readDataStore<RedditMentionsPayload>('reddit-mentions'),
      readDataStore<BlueskyMentionsPayload>('bluesky-mentions'),
      readDataStore<DevtoMentionsPayload>('devto-mentions'),
      readDataStore<NpmPackagesPayload>('npm-packages'),
      readDataStore<DeltasPayload>('deltas'),
      readDataStore<RepoMetadataPayload>('repo-metadata'),
      readDataStore<PhLaunchesPayload>('producthunt-launches'),
    ]);

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

    // ---- Reddit -------------------------------------------------------------
    let redditRepoCount = 0;
    for (const [fullName, bucket] of Object.entries(redditMentions?.mentions ?? {})) {
      if (!fullName.includes('/')) continue;
      const row = ensureRow(accum, fullName);
      row.reddit = nonNegative(safeNumber(bucket?.upvotes7d));
      redditRepoCount += 1;
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
          reddit: redditRepoCount,
          bluesky: blueskyRepoCount,
          devto: devtoRepoCount,
          npmPackages: npmPackageMatches,
          npmRepos: npmByRepo.size,
          ghStars: ghStarsRepoCount,
          ph: phRepoCount,
        },
        redisSource: result.source,
        writtenAt: result.writtenAt,
      },
      'engagement-composite published',
    );

    return done(startedAt, items.length, result.source === 'redis');
  },
};

export default fetcher;

function done(startedAt: string, items: number, redisPublished: boolean): RunResult {
  return {
    fetcher: 'engagement-composite',
    startedAt,
    finishedAt: new Date().toISOString(),
    itemsSeen: items,
    itemsUpserted: 0,
    metricsWritten: 0,
    redisPublished,
    errors: [],
  };
}
