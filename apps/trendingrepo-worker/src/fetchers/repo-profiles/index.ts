// Build durable repo profile snapshots for the hottest repos.
//
// The full original (scripts/enrich-repo-profiles.mjs) drove an AISO website
// scan against each repo's homepage. AISO scans are an operator-side
// enrichment step gated by an external rate limit; the worker port keeps
// the fast surface-resolution path (homepage URL, docs link, npm packages,
// PH launch reference) and emits status="scan_pending" so an out-of-band
// AISO runner can pick up the queue. This keeps the worker tick under
// a few seconds even with 200 candidates.
//
// Slug: `repo-profiles`. Cadence: hourly @ :41 (matches enrich-repo-profiles.yml).

import type { Fetcher, FetcherContext, RunResult } from '../../lib/types.js';
import { writeDataStore, readDataStore } from '../../lib/redis.js';

const TOP_LIMIT = Math.max(
  1,
  Math.min(200, Number.parseInt(process.env.PROFILE_ENRICH_LIMIT ?? '20', 10) || 20),
);

interface TrendingRow {
  repo_name?: string;
}

interface TrendingPayload {
  buckets?: {
    past_24_hours?: {
      All?: TrendingRow[];
    };
  };
}

interface RepoMetadataItem {
  fullName: string;
  url?: string;
  homepageUrl?: string | null;
}

interface RepoMetadataPayload {
  items?: RepoMetadataItem[];
}

interface NpmPackage {
  name: string;
  homepage?: string | null;
  linkedRepo?: string | null;
}

interface NpmPackagesPayload {
  packages?: NpmPackage[];
}

interface PhLaunch {
  id?: string | number;
  votesCount?: number;
  website?: string | null;
  linkedRepo?: string | null;
}

interface PhLaunchesPayload {
  launches?: PhLaunch[];
}

interface RepoProfile {
  fullName: string;
  rank: number | null;
  selectedFrom: string;
  websiteUrl: string | null;
  websiteSource: 'producthunt' | 'github_homepage' | 'npm_homepage' | null;
  status: 'scanned' | 'scan_pending' | 'scan_running' | 'scan_failed' | 'rate_limited' | 'no_website';
  lastProfiledAt: string;
  nextScanAfter: string | null;
  surfaces: {
    githubUrl: string;
    docsUrl: string | null;
    npmPackages: string[];
    productHuntLaunchId: string | number | null;
  };
  aisoScan: unknown | null;
  expertTrendBrief?: {
    provider: 'kimi';
    model: string;
    generatedAt: string;
    headline: string;
    summary: string;
    drivers: string[];
    evidence: string[];
    caveats: string[];
  } | null;
  error: string | null;
}

interface RepoProfilesPayload {
  generatedAt: string;
  version: number;
  selection: {
    source: 'top';
    limit: number;
    scanned: number;
    queued: number;
    noWebsite: number;
    failed: number;
    expertBriefs?: number;
  };
  profiles: RepoProfile[];
}

function normalizeRepoKey(fullName: string): string {
  return fullName.toLowerCase();
}

function cleanUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  if (!/^https?:\/\//i.test(value)) return null;
  try {
    return new URL(value).toString();
  } catch {
    return null;
  }
}

function isGithubUrl(url: string | null): boolean {
  if (!url) return false;
  try {
    return /(^|\.)github\.com$/i.test(new URL(url).hostname);
  } catch {
    return /github\.com/i.test(url);
  }
}

function buildTrendingRankMap(trending: TrendingPayload | null): Map<string, number> {
  const map = new Map<string, number>();
  const rows = trending?.buckets?.past_24_hours?.All ?? [];
  let rank = 0;
  for (const row of rows) {
    const fullName = row?.repo_name;
    if (!fullName || !fullName.includes('/')) continue;
    const key = normalizeRepoKey(fullName);
    if (map.has(key)) continue;
    rank += 1;
    map.set(key, rank);
  }
  return map;
}

const fetcher: Fetcher = {
  name: 'repo-profiles',
  schedule: '41 * * * *', // matches enrich-repo-profiles.yml
  async run(ctx: FetcherContext): Promise<RunResult> {
    const startedAt = new Date().toISOString();

    if (ctx.dryRun) {
      ctx.log.info('repo-profiles dry-run');
      return done(startedAt, 0, false);
    }

    // AUDIT-2026-05-04: allSettled so a single Redis flake degrades to
    // null instead of crashing the whole fetcher. Same fix as f39cd09d.
    const READ_KEYS = [
      'trending',
      'repo-metadata',
      'npm-packages',
      'producthunt-launches',
      'repo-profiles',
    ] as const;
    const reads = await Promise.allSettled([
      readDataStore<TrendingPayload>('trending'),
      readDataStore<RepoMetadataPayload>('repo-metadata'),
      readDataStore<NpmPackagesPayload>('npm-packages'),
      readDataStore<PhLaunchesPayload>('producthunt-launches'),
      readDataStore<RepoProfilesPayload>('repo-profiles'),
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
        'repo-profiles: some reads failed; degrading those sources to null',
      );
    }
    const [trending, repoMetadata, npmPackages, phLaunches, existingProfiles] = values as [
      TrendingPayload | null,
      RepoMetadataPayload | null,
      NpmPackagesPayload | null,
      PhLaunchesPayload | null,
      RepoProfilesPayload | null,
    ];

    const metadataByRepo = new Map<string, RepoMetadataItem>();
    for (const item of repoMetadata?.items ?? []) {
      if (item?.fullName) metadataByRepo.set(normalizeRepoKey(item.fullName), item);
    }

    const npmByRepo = new Map<string, NpmPackage[]>();
    for (const pkg of npmPackages?.packages ?? []) {
      if (!pkg?.linkedRepo) continue;
      const key = normalizeRepoKey(pkg.linkedRepo);
      const list = npmByRepo.get(key) ?? [];
      if (!list.some((p) => p.name === pkg.name)) list.push(pkg);
      npmByRepo.set(key, list);
    }

    const phByRepo = new Map<string, PhLaunch>();
    for (const launch of phLaunches?.launches ?? []) {
      if (!launch?.linkedRepo) continue;
      const key = normalizeRepoKey(launch.linkedRepo);
      const existing = phByRepo.get(key);
      if (!existing || (launch.votesCount ?? 0) > (existing.votesCount ?? 0)) {
        phByRepo.set(key, launch);
      }
    }

    const rankMap = buildTrendingRankMap(trending);
    const existingByRepo = new Map<string, RepoProfile>();
    for (const profile of existingProfiles?.profiles ?? []) {
      if (profile?.fullName) existingByRepo.set(normalizeRepoKey(profile.fullName), profile);
    }
    const candidates: Array<{ fullName: string; rank: number | null; key: string }> = [];
    for (const [key, rank] of rankMap.entries()) {
      if (candidates.length >= TOP_LIMIT) break;
      candidates.push({
        fullName: metadataByRepo.get(key)?.fullName ?? key,
        rank,
        key,
      });
    }

    const now = new Date().toISOString();
    let scanned = 0;
    let queued = 0;
    let noWebsite = 0;
    let failed = 0;
    const profiles: RepoProfile[] = [];

    for (const candidate of candidates) {
      const meta = metadataByRepo.get(candidate.key) ?? null;
      const phLaunch = phByRepo.get(candidate.key) ?? null;
      const npmPkgs = npmByRepo.get(candidate.key) ?? [];

      let websiteUrl: string | null = null;
      let websiteSource: RepoProfile['websiteSource'] = null;
      const phWebsite = cleanUrl(phLaunch?.website);
      if (phWebsite && !isGithubUrl(phWebsite)) {
        websiteUrl = phWebsite;
        websiteSource = 'producthunt';
      } else {
        const metaWebsite = cleanUrl(meta?.homepageUrl);
        if (metaWebsite && !isGithubUrl(metaWebsite)) {
          websiteUrl = metaWebsite;
          websiteSource = 'github_homepage';
        } else {
          for (const pkg of npmPkgs) {
            const npmHomepage = cleanUrl(pkg.homepage);
            if (npmHomepage && !isGithubUrl(npmHomepage)) {
              websiteUrl = npmHomepage;
              websiteSource = 'npm_homepage';
              break;
            }
          }
        }
      }

      const githubUrl = meta?.url ?? `https://github.com/${candidate.fullName}`;
      const docsUrl =
        npmPkgs
          .map((pkg) => cleanUrl(pkg.homepage))
          .find((url) => url && /docs|documentation|readme/i.test(url)) ?? null;
      const existing = existingByRepo.get(candidate.key) ?? null;
      const preserveExistingEnrichment = Boolean(
        existing && existing.websiteUrl === websiteUrl,
      );
      const status = preserveExistingEnrichment && existing
        ? existing.status
        : websiteUrl
          ? 'scan_pending'
          : 'no_website';
      const profile: RepoProfile = {
        fullName: meta?.fullName ?? candidate.fullName,
        rank: candidate.rank,
        selectedFrom: 'trending_top_24h',
        websiteUrl,
        websiteSource,
        status,
        lastProfiledAt: now,
        nextScanAfter: preserveExistingEnrichment ? existing?.nextScanAfter ?? null : null,
        surfaces: {
          githubUrl,
          docsUrl,
          npmPackages: npmPkgs.map((pkg) => pkg.name),
          productHuntLaunchId: phLaunch?.id ?? null,
        },
        aisoScan: preserveExistingEnrichment ? existing?.aisoScan ?? null : null,
        expertTrendBrief: existing?.expertTrendBrief ?? null,
        error: preserveExistingEnrichment ? existing?.error ?? null : null,
      };
      profiles.push(profile);
      if (profile.status === 'scanned') scanned += 1;
      else if (profile.status === 'scan_failed') failed += 1;
      else if (websiteUrl) queued += 1;
      else noWebsite += 1;
    }

    const payload: RepoProfilesPayload = {
      generatedAt: now,
      version: 1,
      selection: {
        source: 'top',
        limit: TOP_LIMIT,
        scanned,
        queued,
        noWebsite,
        failed,
      },
      profiles,
    };
    const result = await writeDataStore('repo-profiles', payload);
    ctx.log.info(
      {
        profiles: profiles.length,
        queued,
        noWebsite,
        redisSource: result.source,
      },
      'repo-profiles published',
    );
    return done(startedAt, profiles.length, result.source === 'redis');
  },
};

export default fetcher;

function done(startedAt: string, items: number, redisPublished: boolean): RunResult {
  return {
    fetcher: 'repo-profiles',
    startedAt,
    finishedAt: new Date().toISOString(),
    itemsSeen: items,
    itemsUpserted: 0,
    metricsWritten: 0,
    redisPublished,
    errors: [],
  };
}
