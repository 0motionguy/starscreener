// Bucket the cached TrustMRR catalog into (category, star-band, ph-launch?)
// benchmark bands. Pure derivation — no external network. Reads:
//   - trustmrr-startups   (catalog from trustmrr fetcher)
//   - revenue-overlays    (slug -> repo fullName matches)
//   - repo-metadata       (stars per repo)
//   - producthunt-launches (which repos have a PH launch)
// and writes:
//   - revenue-benchmarks  ({ buckets: [{ category, starBand, phLaunched, n,
//                          p25, p50, p75 }, ...], starBands, ... })
//
// Cadence: 30 min after the trustmrr full sweep (02:27 UTC) so the catalog
// is fresh when we bucket. Runs once per day.

import type { Fetcher, FetcherContext, RunResult } from '../../lib/types.js';
import { writeDataStore, readDataStore } from '../../lib/redis.js';

const MIN_BUCKET_SIZE = 5;

const STAR_BANDS = [
  { label: '0-100', min: 0, max: 100 },
  { label: '100-500', min: 100, max: 500 },
  { label: '500-2K', min: 500, max: 2_000 },
  { label: '2K-10K', min: 2_000, max: 10_000 },
  { label: '10K-50K', min: 10_000, max: 50_000 },
  { label: '50K+', min: 50_000, max: Number.POSITIVE_INFINITY },
] as const;

function bandFor(stars: number | null | undefined): typeof STAR_BANDS[number] | null {
  if (typeof stars !== 'number' || !Number.isFinite(stars)) return null;
  return STAR_BANDS.find((b) => stars >= b.min && stars < b.max) ?? null;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0]!;
  const pos = (sorted.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const frac = pos - lo;
  return Math.round(sorted[lo]! + (sorted[hi]! - sorted[lo]!) * frac);
}

interface CatalogStartup {
  slug: string;
  category?: string | null;
  revenue?: { mrr?: number | null } | null;
}

interface CatalogPayload {
  startups: CatalogStartup[];
}

interface OverlayEntry {
  trustmrrSlug: string;
}

interface OverlaysPayload {
  overlays?: Record<string, OverlayEntry>;
}

interface RepoMetadataPayload {
  items?: Array<{ fullName: string; stars: number }>;
}

interface PhLaunch {
  repoFullName?: string | null;
  linkedRepo?: string | null;
  githubFullName?: string | null;
}

interface PhLaunchesPayload {
  launches?: PhLaunch[];
}

interface BenchmarkRow {
  category: string;
  starBand: string;
  phLaunched: boolean;
  n: number;
  p25: number;
  p50: number;
  p75: number;
}

interface RevenueBenchmarksPayload {
  generatedAt: string;
  version: number;
  totalStartups: number;
  totalBuckets: number;
  minBucketSize: number;
  starBands: string[];
  buckets: BenchmarkRow[];
}

const fetcher: Fetcher = {
  name: 'revenue-benchmarks',
  // 30 min after trustmrr full-sweep tick (02:27 UTC).
  schedule: '57 2 * * *',
  async run(ctx: FetcherContext): Promise<RunResult> {
    const startedAt = new Date().toISOString();

    if (ctx.dryRun) {
      ctx.log.info('revenue-benchmarks dry-run');
      return done(startedAt, 0, false);
    }

    // AUDIT-2026-05-04: per-source allSettled so a single Redis flake
    // doesn't crash the whole fetcher. Same fix as f39cd09d.
    const READ_KEYS = [
      'trustmrr-startups',
      'revenue-overlays',
      'repo-metadata',
      'producthunt-launches',
    ] as const;
    const reads = await Promise.allSettled([
      readDataStore<CatalogPayload>('trustmrr-startups'),
      readDataStore<OverlaysPayload>('revenue-overlays'),
      readDataStore<RepoMetadataPayload>('repo-metadata'),
      readDataStore<PhLaunchesPayload>('producthunt-launches'),
    ]);
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
      ctx.log.warn(
        { failures: readFailures },
        'revenue-benchmarks: some reads failed; degrading those sources to null',
      );
    }
    const [catalog, overlays, metadata, ph] = values as [
      CatalogPayload | null,
      OverlaysPayload | null,
      RepoMetadataPayload | null,
      PhLaunchesPayload | null,
    ];

    if (!catalog || !Array.isArray(catalog.startups) || catalog.startups.length === 0) {
      const msg = 'no trustmrr-startups in Redis - run trustmrr fetcher first';
      ctx.log.warn(msg);
      return {
        fetcher: 'revenue-benchmarks',
        startedAt,
        finishedAt: new Date().toISOString(),
        itemsSeen: 0,
        itemsUpserted: 0,
        metricsWritten: 0,
        redisPublished: false,
        errors: [{ stage: 'inputs', message: msg }],
      };
    }

    const slugToFullName = new Map<string, string>();
    for (const [fullName, overlay] of Object.entries(overlays?.overlays ?? {})) {
      if (overlay && typeof overlay.trustmrrSlug === 'string') {
        slugToFullName.set(overlay.trustmrrSlug, fullName);
      }
    }

    const starsByFullName = new Map<string, number>();
    for (const item of metadata?.items ?? []) {
      if (item && typeof item.fullName === 'string' && typeof item.stars === 'number') {
        starsByFullName.set(item.fullName, item.stars);
      }
    }

    const phLaunchedFullNames = new Set<string>();
    for (const launch of ph?.launches ?? []) {
      const candidates = [launch?.repoFullName, launch?.linkedRepo, launch?.githubFullName].filter(
        (v): v is string => typeof v === 'string' && v.length > 0,
      );
      for (const c of candidates) phLaunchedFullNames.add(c);
    }

    interface BucketAccumulator {
      category: string;
      starBand: string;
      phLaunched: boolean;
      values: number[];
    }
    const buckets = new Map<string, BucketAccumulator>();

    function push(category: string, starBand: string, phLaunched: boolean, mrrCents: number): void {
      const key = `${category}||${starBand}||${phLaunched ? 'ph' : 'noph'}`;
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { category, starBand, phLaunched, values: [] };
        buckets.set(key, bucket);
      }
      bucket.values.push(mrrCents);
    }

    for (const s of catalog.startups) {
      if (!s || typeof s !== 'object') continue;
      const category =
        (typeof s.category === 'string' && s.category.trim()) || 'uncategorized';
      const mrrDollars = s.revenue?.mrr;
      if (typeof mrrDollars !== 'number' || !Number.isFinite(mrrDollars) || mrrDollars <= 0) {
        continue;
      }
      const mrrCents = Math.round(mrrDollars * 100);
      const fullName = slugToFullName.get(s.slug);
      const stars = fullName ? starsByFullName.get(fullName) : null;
      const band = bandFor(stars);
      const starBand = band ? band.label : 'unmatched';
      const phLaunched = fullName ? phLaunchedFullNames.has(fullName) : false;
      push(category, starBand, phLaunched, mrrCents);
    }

    const serialized: BenchmarkRow[] = [];
    for (const bucket of buckets.values()) {
      if (bucket.values.length < MIN_BUCKET_SIZE) continue;
      const sorted = [...bucket.values].sort((a, b) => a - b);
      serialized.push({
        category: bucket.category,
        starBand: bucket.starBand,
        phLaunched: bucket.phLaunched,
        n: bucket.values.length,
        p25: percentile(sorted, 0.25),
        p50: percentile(sorted, 0.5),
        p75: percentile(sorted, 0.75),
      });
    }
    serialized.sort((a, b) => {
      const cat = a.category.localeCompare(b.category);
      if (cat !== 0) return cat;
      const ai = STAR_BANDS.findIndex((b2) => b2.label === a.starBand);
      const bi = STAR_BANDS.findIndex((b2) => b2.label === b.starBand);
      if (ai !== bi) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      return Number(b.phLaunched) - Number(a.phLaunched);
    });

    const out: RevenueBenchmarksPayload = {
      generatedAt: new Date().toISOString(),
      version: 1,
      totalStartups: catalog.startups.length,
      totalBuckets: serialized.length,
      minBucketSize: MIN_BUCKET_SIZE,
      starBands: STAR_BANDS.map((b) => b.label),
      buckets: serialized,
    };
    const result = await writeDataStore('revenue-benchmarks', out);
    ctx.log.info(
      {
        buckets: serialized.length,
        startups: catalog.startups.length,
        redisSource: result.source,
      },
      'revenue-benchmarks published',
    );
    return done(startedAt, serialized.length, result.source === 'redis');
  },
};

export default fetcher;

function done(startedAt: string, items: number, redisPublished: boolean): RunResult {
  return {
    fetcher: 'revenue-benchmarks',
    startedAt,
    finishedAt: new Date().toISOString(),
    itemsSeen: items,
    itemsUpserted: 0,
    metricsWritten: 0,
    redisPublished,
    errors: [],
  };
}
