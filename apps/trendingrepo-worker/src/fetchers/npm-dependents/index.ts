// npm-dependents fetcher.
//
//   API           https://libraries.io/api/<platform>/<package>?api_key=...
//                 (the package GET returns `dependent_repos_count` directly,
//                 saving a paginated dependents call. We verified this against
//                 a known package — see plan notes.)
//   Auth          LIBRARIES_IO_API_KEY (libraries.io free tier; 60 req/min)
//   Rate limit    Free tier ~60 req/min; we sleep 1100ms between calls
//   Cache TTL     7 days per-package (mcp-dependents:<pkg>)
//   Aggregate key mcp-dependents
//   Cadence       24h (refresh-mcp-dependents.yml)
//
// If LIBRARIES_IO_API_KEY is missing the fetcher logs a warning and exits
// cleanly — the scorer drops the term via existing renormalization.

import type { Fetcher, FetcherContext, RunResult } from '../../lib/types.js';
import { writeDataStore, readDataStore } from '../../lib/redis.js';
import { fetchJsonWithRetry, HttpStatusError, sleep } from '../../lib/util/http-helpers.js';

const USER_AGENT = 'TrendingRepo-NPM-Dependents/1.0 (+https://trendingrepo.com)';
const REQ_INTERVAL_MS = 1100; // ~55 req/min, under the 60/min free-tier cap
const CACHE_TTL_SECONDS = 7 * 24 * 60 * 60; // 7d
const FRESH_THRESHOLD_MS = 6.5 * 24 * 60 * 60 * 1000;

interface CachedDependents {
  count: number;
  sampledAt: string;
  packageName: string;
}

interface LibrariesIoPackage {
  dependent_repos_count?: number;
  dependents_count?: number;
  name?: string;
  platform?: string;
}

interface RosterMcpItem {
  slug?: string;
  id?: string;
  url?: string;
  raw?: Record<string, unknown> & { package_name?: string; package_registry?: string };
}

interface AggregateSummaryEntry {
  count: number;
  packageName: string;
}

interface AggregatePayload {
  fetchedAt: string;
  summary: Record<string, AggregateSummaryEntry>;
  counts: { roster: number; npmPackages: number; ok: number; failed: number; cacheHit: number };
}

const fetcher: Fetcher = {
  name: 'npm-dependents',
  schedule: '53 4 * * *',
  async run(ctx: FetcherContext): Promise<RunResult> {
    const startedAt = new Date().toISOString();
    if (ctx.dryRun) {
      ctx.log.info('npm-dependents dry-run');
      return done(startedAt, 0, false, []);
    }

    const apiKey = process.env.LIBRARIES_IO_API_KEY?.trim();
    if (!apiKey) {
      ctx.log.warn('LIBRARIES_IO_API_KEY not set - npm-dependents skipped (scorer drops term)');
      return done(startedAt, 0, false, []);
    }

    const errors: RunResult['errors'] = [];
    const roster = await readDataStore<{ items?: RosterMcpItem[] }>('trending-mcp');
    const items = Array.isArray(roster?.items) ? roster.items : [];
    if (items.length === 0) {
      ctx.log.warn('trending-mcp empty - npm-dependents exiting');
      return done(startedAt, 0, false, []);
    }

    // Map slug -> npm package name (npm only — libraries.io supports pypi too,
    // but we keep this fetcher npm-scoped to match the field name `npmDependents`).
    const targets: Array<{ slug: string; pkg: string }> = [];
    const seenPkgs = new Set<string>();
    for (const it of items) {
      const slug = String(it.slug ?? it.id ?? '').trim();
      if (!slug) continue;
      const pkg = extractNpmPackage(it);
      if (!pkg) continue;
      targets.push({ slug, pkg });
      seenPkgs.add(pkg);
    }
    ctx.log.info({ roster: items.length, npmPackages: seenPkgs.size }, 'npm-dependents targets resolved');

    const pkgResults = new Map<string, number>();
    let ok = 0;
    let failed = 0;
    let cacheHit = 0;

    const uniquePackages = Array.from(seenPkgs);
    for (let i = 0; i < uniquePackages.length; i += 1) {
      const pkg = uniquePackages[i]!;
      try {
        const cached = await readDataStore<CachedDependents>(`mcp-dependents:${pkg}`);
        const fresh = cached && Date.now() - Date.parse(cached.sampledAt) < FRESH_THRESHOLD_MS;
        if (fresh && cached) {
          pkgResults.set(pkg, cached.count);
          cacheHit += 1;
          continue;
        }

        const count = await fetchDependentCount(apiKey, pkg);
        if (count === null) continue;

        const entry: CachedDependents = { count, sampledAt: new Date().toISOString(), packageName: pkg };
        await writeDataStore(`mcp-dependents:${pkg}`, entry, { ttlSeconds: CACHE_TTL_SECONDS });
        pkgResults.set(pkg, count);
        ok += 1;
      } catch (err) {
        failed += 1;
        errors.push({ stage: 'fetch', message: (err as Error).message, itemSourceId: pkg });
      }

      if (i < uniquePackages.length - 1 && REQ_INTERVAL_MS > 0) await sleep(REQ_INTERVAL_MS);
    }

    const summary: Record<string, AggregateSummaryEntry> = {};
    for (const { slug, pkg } of targets) {
      const c = pkgResults.get(pkg);
      if (c === undefined) continue;
      summary[slug] = { count: c, packageName: pkg };
    }

    const aggregate: AggregatePayload = {
      fetchedAt: new Date().toISOString(),
      summary,
      counts: { roster: items.length, npmPackages: seenPkgs.size, ok, failed, cacheHit },
    };
    const result = await writeDataStore('mcp-dependents', aggregate);
    ctx.log.info(
      { slugs: Object.keys(summary).length, ok, failed, cacheHit, redisSource: result.source },
      'npm-dependents published',
    );

    return {
      fetcher: 'npm-dependents',
      startedAt,
      finishedAt: new Date().toISOString(),
      itemsSeen: items.length,
      itemsUpserted: 0,
      metricsWritten: Object.keys(summary).length,
      redisPublished: result.source === 'redis',
      errors,
    };
  },
};

export default fetcher;

function extractNpmPackage(it: RosterMcpItem): string | null {
  const raw = (it.raw ?? {}) as Record<string, unknown>;
  const direct = typeof raw.package_name === 'string' ? raw.package_name : null;
  const registry = typeof raw.package_registry === 'string' ? raw.package_registry : null;
  if (direct && (registry === 'npm' || registry === null || registry === undefined)) {
    return normalizePkg(direct);
  }
  for (const sourceKey of ['glama', 'pulsemcp', 'official', 'smithery', 'npm'] as const) {
    const inner = raw[sourceKey];
    if (inner && typeof inner === 'object') {
      const nested = inner as Record<string, unknown>;
      const name = nested.package_name ?? nested.npmName ?? nested.npm_name;
      if (typeof name === 'string') return normalizePkg(name);
    }
  }
  return null;
}

function normalizePkg(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (!/^@?[a-z0-9._-]+(\/[a-z0-9._-]+)?$/i.test(trimmed)) return null;
  return trimmed.toLowerCase();
}

async function fetchDependentCount(apiKey: string, pkg: string): Promise<number | null> {
  // libraries.io path encodes scoped packages as @scope%2Fname.
  const platformPkg = pkg.startsWith('@') ? encodeURIComponent(pkg) : pkg;
  const url = `https://libraries.io/api/npm/${platformPkg}?api_key=${encodeURIComponent(apiKey)}`;
  try {
    const data = await fetchJsonWithRetry<LibrariesIoPackage>(url, {
      attempts: 3,
      retryDelayMs: 2500,
      timeoutMs: 20_000,
      headers: { 'User-Agent': USER_AGENT, accept: 'application/json' },
    });
    const repos = typeof data.dependent_repos_count === 'number' ? data.dependent_repos_count : 0;
    const pkgs = typeof data.dependents_count === 'number' ? data.dependents_count : 0;
    return repos + pkgs;
  } catch (err) {
    if (err instanceof HttpStatusError && (err.status === 404 || err.status === 422)) return null;
    throw err;
  }
}

function done(
  startedAt: string,
  items: number,
  redisPublished: boolean,
  errors: RunResult['errors'],
): RunResult {
  return {
    fetcher: 'npm-dependents',
    startedAt,
    finishedAt: new Date().toISOString(),
    itemsSeen: items,
    itemsUpserted: 0,
    metricsWritten: 0,
    redisPublished,
    errors,
  };
}
