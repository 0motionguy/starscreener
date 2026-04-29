// npm-downloads fetcher.
//
//   API           https://api.npmjs.org/downloads/point/last-week/<pkg>
//                 https://registry.npmjs.org/<pkg>          (for time.modified, see C7)
//   Auth          none
//   Rate limit    npm registry is generous; we throttle to ~10 req/s
//   Cache TTL     24h per-package (mcp-downloads:<pkg>)
//   Aggregate key mcp-downloads  (full summary, no TTL — overwritten each run)
//   Cadence       6h (refresh-npm-downloads.yml)
//
// What it does
//   1. Read the trending-mcp roster from Redis. Extract every npm package
//      name we know about (via raw.package_name where package_registry === 'npm',
//      plus URL fallbacks for npm registry links).
//   2. For each package: hit the downloads endpoint AND the registry (for
//      time.modified — Chunk C7's lastReleaseAt). Result is stored at
//      `mcp-downloads:<pkg>` with 24h TTL: { npm7d, lastChecked, lastReleaseAt }.
//      pypi7d will be merged in by the sister fetcher (C2).
//   3. Build an aggregate summary keyed by qualified name (the slug used by
//      buildMcpItem) for app consumption.

import type { Fetcher, FetcherContext, RunResult } from '../../lib/types.js';
import { writeDataStore, readDataStore } from '../../lib/redis.js';
import { fetchJsonWithRetry, HttpStatusError, sleep } from '../../lib/util/http-helpers.js';

const USER_AGENT = 'TrendingRepo-NPM-Downloads/1.0 (+https://trendingrepo.com)';
const REQ_INTERVAL_MS = 100; // ~10 req/s
const CACHE_TTL_SECONDS = 24 * 60 * 60; // 24h
const FRESH_THRESHOLD_MS = 23 * 60 * 60 * 1000; // skip refetch if cached < 23h

interface CachedEntry {
  npm7d?: number;
  pypi7d?: number;
  lastChecked: string;
  lastReleaseAt: string | null;
}

interface NpmDownloadsResponse {
  downloads?: number;
  start?: string;
  end?: string;
  package?: string;
}

interface NpmRegistryResponse {
  time?: { modified?: string; created?: string; [version: string]: string | undefined };
}

interface RosterMcpItem {
  slug?: string;
  id?: string;
  url?: string;
  raw?: Record<string, unknown> & {
    package_name?: string;
    package_registry?: string;
    npm?: { package_name?: string };
    smithery?: { qualifiedName?: string };
    [k: string]: unknown;
  };
}

interface AggregateSummaryEntry {
  npm7d?: number;
  lastReleaseAt?: string;
  packageName?: string;
}

interface AggregatePayload {
  fetchedAt: string;
  summary: Record<string, AggregateSummaryEntry>;
  counts: { roster: number; npmPackages: number; ok: number; failed: number; cacheHit: number };
}

const fetcher: Fetcher = {
  name: 'npm-downloads',
  schedule: '23 */6 * * *',
  async run(ctx: FetcherContext): Promise<RunResult> {
    const startedAt = new Date().toISOString();
    if (ctx.dryRun) {
      ctx.log.info('npm-downloads dry-run');
      return done(startedAt, 0, false, []);
    }

    const errors: RunResult['errors'] = [];
    const roster = await readDataStore<{ items?: RosterMcpItem[] }>('trending-mcp');
    const items = Array.isArray(roster?.items) ? roster.items : [];
    if (items.length === 0) {
      ctx.log.warn('trending-mcp roster empty or missing - npm-downloads exiting');
      return done(startedAt, 0, false, []);
    }

    // Discover npm package names per MCP slug. One MCP can map to one
    // package name (the merged Supabase row stores it as raw.npm.package_name
    // via the npm-packages enrichment, or as raw.package_name directly when
    // the registry sources [glama/pulsemcp/official] surface it).
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
    ctx.log.info({ roster: items.length, npmPackages: seenPkgs.size }, 'npm-downloads targets resolved');

    const summary: Record<string, AggregateSummaryEntry> = {};
    let ok = 0;
    let failed = 0;
    let cacheHit = 0;

    // Fetch per unique package, merge into summary keyed by every slug that
    // maps to it.
    const pkgResults = new Map<string, CachedEntry>();
    const uniquePackages = Array.from(seenPkgs);
    for (let i = 0; i < uniquePackages.length; i += 1) {
      const pkg = uniquePackages[i]!;
      try {
        const cached = await readDataStore<CachedEntry>(`mcp-downloads:${pkg}`);
        const cachedFresh = cached && Date.now() - Date.parse(cached.lastChecked) < FRESH_THRESHOLD_MS;
        if (cached && cachedFresh) {
          pkgResults.set(pkg, cached);
          cacheHit += 1;
          continue;
        }

        const [npm7d, lastReleaseAt] = await Promise.all([
          fetchNpmWeekly(pkg),
          fetchNpmLastRelease(pkg),
        ]);

        const entry: CachedEntry = {
          // preserve any pypi7d that the pypi-downloads sister already wrote
          ...(cached?.pypi7d !== undefined ? { pypi7d: cached.pypi7d } : {}),
          npm7d: npm7d ?? undefined,
          lastChecked: new Date().toISOString(),
          lastReleaseAt: lastReleaseAt,
        };
        await writeDataStore(`mcp-downloads:${pkg}`, entry, { ttlSeconds: CACHE_TTL_SECONDS });
        pkgResults.set(pkg, entry);
        ok += 1;
      } catch (err) {
        failed += 1;
        errors.push({ stage: 'fetch', message: (err as Error).message, itemSourceId: pkg });
      }

      if (i < uniquePackages.length - 1 && REQ_INTERVAL_MS > 0) await sleep(REQ_INTERVAL_MS);
    }

    for (const { slug, pkg } of targets) {
      const r = pkgResults.get(pkg);
      if (!r) continue;
      summary[slug] = {
        ...(r.npm7d !== undefined ? { npm7d: r.npm7d } : {}),
        ...(r.lastReleaseAt ? { lastReleaseAt: r.lastReleaseAt } : {}),
        packageName: pkg,
      };
    }

    const aggregate: AggregatePayload = {
      fetchedAt: new Date().toISOString(),
      summary,
      counts: { roster: items.length, npmPackages: seenPkgs.size, ok, failed, cacheHit },
    };
    const result = await writeDataStore('mcp-downloads', aggregate);
    ctx.log.info(
      { slugs: Object.keys(summary).length, ok, failed, cacheHit, redisSource: result.source },
      'npm-downloads published',
    );

    return {
      fetcher: 'npm-downloads',
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
  // Direct field
  const direct = typeof raw.package_name === 'string' ? raw.package_name : null;
  const registry = typeof raw.package_registry === 'string' ? raw.package_registry : null;
  if (direct && (registry === 'npm' || registry === null || registry === undefined)) {
    return normalizePkg(direct);
  }
  // Per-source nested
  for (const sourceKey of ['glama', 'pulsemcp', 'official', 'smithery', 'npm'] as const) {
    const inner = raw[sourceKey];
    if (inner && typeof inner === 'object') {
      const nested = inner as Record<string, unknown>;
      const name = nested.package_name ?? nested.npmName ?? nested.npm_name;
      if (typeof name === 'string') return normalizePkg(name);
    }
  }
  // URL fallback: https://www.npmjs.com/package/<pkg>
  const url = typeof it.url === 'string' ? it.url : null;
  if (url && /https?:\/\/(www\.)?npmjs\.com\/package\//i.test(url)) {
    const m = url.match(/npmjs\.com\/package\/(@?[^?#/]+(?:\/[^?#/]+)?)/i);
    if (m && m[1]) return normalizePkg(decodeURIComponent(m[1]));
  }
  return null;
}

function normalizePkg(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // npm package names: lowercase, may contain @scope/name
  if (!/^@?[a-z0-9._-]+(\/[a-z0-9._-]+)?$/i.test(trimmed)) return null;
  return trimmed.toLowerCase();
}

function encodePkg(pkg: string): string {
  // npm scoped packages need URL-encoding of the slash for the downloads
  // endpoint: @scope/name → @scope%2Fname.
  if (pkg.startsWith('@')) {
    return encodeURIComponent(pkg);
  }
  return pkg;
}

async function fetchNpmWeekly(pkg: string): Promise<number | null> {
  const url = `https://api.npmjs.org/downloads/point/last-week/${encodePkg(pkg)}`;
  try {
    const data = await fetchJsonWithRetry<NpmDownloadsResponse>(url, {
      attempts: 3,
      retryDelayMs: 1500,
      timeoutMs: 15_000,
      headers: { 'User-Agent': USER_AGENT },
    });
    return typeof data.downloads === 'number' && Number.isFinite(data.downloads) ? data.downloads : null;
  } catch (err) {
    if (err instanceof HttpStatusError && err.status === 404) return null;
    throw err;
  }
}

async function fetchNpmLastRelease(pkg: string): Promise<string | null> {
  // Standard npm registry GET. Includes time.modified and time.created.
  const url = `https://registry.npmjs.org/${pkg.startsWith('@') ? pkg : encodeURIComponent(pkg)}`;
  try {
    const data = await fetchJsonWithRetry<NpmRegistryResponse>(url, {
      attempts: 3,
      retryDelayMs: 1500,
      timeoutMs: 15_000,
      headers: { 'User-Agent': USER_AGENT, accept: 'application/vnd.npm.install-v1+json' },
    });
    const modified = data.time?.modified;
    return typeof modified === 'string' ? modified : null;
  } catch (err) {
    if (err instanceof HttpStatusError && err.status === 404) return null;
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
    fetcher: 'npm-downloads',
    startedAt,
    finishedAt: new Date().toISOString(),
    itemsSeen: items,
    itemsUpserted: 0,
    metricsWritten: 0,
    redisPublished,
    errors,
  };
}
