// pypi-downloads fetcher.
//
//   API           https://pypistats.org/api/packages/<pkg>/recent
//   Auth          none
//   Rate limit    pypistats.org asks ≤ 1 req/s — we sleep 1100ms between calls
//   Cache TTL     24h per-package (mcp-downloads:<pkg> — SAME key as C1, merged)
//   Aggregate key mcp-downloads-pypi  (delta summary, app reads with C1)
//   Cadence       6h (refresh-pypi-downloads.yml)
//
// What it does
//   1. Read trending-mcp roster, extract every pypi package name (raw.pypi or
//      raw.package_name where raw.package_registry === 'pypi').
//   2. Hit pypistats.org `/recent` per package (returns { last_day, last_week,
//      last_month }). We use last_week.
//   3. Merge into the SAME per-package cache key (`mcp-downloads:<pkg>`) that
//      npm-downloads writes — when a package is both npm-and-pypi (rare, but
//      e.g. tools published to both), both fields end up present. We preserve
//      whichever fields the other fetcher wrote.
//   4. Publish a slim aggregate at `mcp-downloads-pypi` for the app to merge
//      with `mcp-downloads`. Keeping them separate avoids races: each fetcher
//      owns one key, and the consumer reads both.

import type { Fetcher, FetcherContext, RunResult } from '../../lib/types.js';
import { writeDataStore, readDataStore } from '../../lib/redis.js';
import { fetchJsonWithRetry, HttpStatusError, sleep } from '../../lib/util/http-helpers.js';

const USER_AGENT = 'TrendingRepo-PyPI-Downloads/1.0 (+https://trendingrepo.com)';
const REQ_INTERVAL_MS = 1100; // ≤ 1 req/s
const CACHE_TTL_SECONDS = 24 * 60 * 60;
const FRESH_THRESHOLD_MS = 23 * 60 * 60 * 1000;

interface CachedEntry {
  npm7d?: number;
  pypi7d?: number;
  lastChecked: string;
  lastReleaseAt: string | null;
}

interface PyPiStatsRecentResponse {
  data?: { last_day?: number; last_week?: number; last_month?: number };
  package?: string;
}

interface RosterMcpItem {
  slug?: string;
  id?: string;
  url?: string;
  raw?: Record<string, unknown>;
}

interface AggregateSummaryEntry {
  pypi7d?: number;
  packageName?: string;
}

interface AggregatePayload {
  fetchedAt: string;
  summary: Record<string, AggregateSummaryEntry>;
  counts: { roster: number; pypiPackages: number; ok: number; failed: number; cacheHit: number };
}

const fetcher: Fetcher = {
  name: 'pypi-downloads',
  schedule: '37 */6 * * *',
  async run(ctx: FetcherContext): Promise<RunResult> {
    const startedAt = new Date().toISOString();
    if (ctx.dryRun) {
      ctx.log.info('pypi-downloads dry-run');
      return done(startedAt, 0, false, []);
    }

    const errors: RunResult['errors'] = [];
    const roster = await readDataStore<{ items?: RosterMcpItem[] }>('trending-mcp');
    const items = Array.isArray(roster?.items) ? roster.items : [];
    if (items.length === 0) {
      ctx.log.warn('trending-mcp roster empty - pypi-downloads exiting');
      return done(startedAt, 0, false, []);
    }

    const targets: Array<{ slug: string; pkg: string }> = [];
    const seenPkgs = new Set<string>();
    for (const it of items) {
      const slug = String(it.slug ?? it.id ?? '').trim();
      if (!slug) continue;
      const pkg = extractPypiPackage(it);
      if (!pkg) continue;
      targets.push({ slug, pkg });
      seenPkgs.add(pkg);
    }
    ctx.log.info({ roster: items.length, pypiPackages: seenPkgs.size }, 'pypi-downloads targets resolved');

    const pkgResults = new Map<string, number>();
    let ok = 0;
    let failed = 0;
    let cacheHit = 0;

    const uniquePackages = Array.from(seenPkgs);
    for (let i = 0; i < uniquePackages.length; i += 1) {
      const pkg = uniquePackages[i]!;
      try {
        const cached = await readDataStore<CachedEntry>(`mcp-downloads:${pkg}`);
        const fresh =
          cached && typeof cached.pypi7d === 'number' &&
          Date.now() - Date.parse(cached.lastChecked) < FRESH_THRESHOLD_MS;
        if (fresh && cached) {
          pkgResults.set(pkg, cached.pypi7d!);
          cacheHit += 1;
          continue;
        }

        const pypi7d = await fetchPypiWeekly(pkg);
        if (pypi7d === null) {
          // 404 — not on pypi or removed. Don't write a cache entry.
          continue;
        }

        const merged: CachedEntry = {
          ...(cached?.npm7d !== undefined ? { npm7d: cached.npm7d } : {}),
          pypi7d,
          lastChecked: new Date().toISOString(),
          lastReleaseAt: cached?.lastReleaseAt ?? null,
        };
        await writeDataStore(`mcp-downloads:${pkg}`, merged, { ttlSeconds: CACHE_TTL_SECONDS });
        pkgResults.set(pkg, pypi7d);
        ok += 1;
      } catch (err) {
        failed += 1;
        errors.push({ stage: 'fetch', message: (err as Error).message, itemSourceId: pkg });
      }

      if (i < uniquePackages.length - 1 && REQ_INTERVAL_MS > 0) await sleep(REQ_INTERVAL_MS);
    }

    const summary: Record<string, AggregateSummaryEntry> = {};
    for (const { slug, pkg } of targets) {
      const v = pkgResults.get(pkg);
      if (v === undefined) continue;
      summary[slug] = { pypi7d: v, packageName: pkg };
    }

    const aggregate: AggregatePayload = {
      fetchedAt: new Date().toISOString(),
      summary,
      counts: { roster: items.length, pypiPackages: seenPkgs.size, ok, failed, cacheHit },
    };
    const result = await writeDataStore('mcp-downloads-pypi', aggregate);
    ctx.log.info(
      { slugs: Object.keys(summary).length, ok, failed, cacheHit, redisSource: result.source },
      'pypi-downloads published',
    );

    return {
      fetcher: 'pypi-downloads',
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

function extractPypiPackage(it: RosterMcpItem): string | null {
  const raw = (it.raw ?? {}) as Record<string, unknown>;
  const direct = typeof raw.package_name === 'string' ? raw.package_name : null;
  const registry = typeof raw.package_registry === 'string' ? raw.package_registry : null;
  if (direct && registry === 'pypi') {
    return normalizePkg(direct);
  }
  for (const sourceKey of ['pulsemcp', 'glama', 'official', 'pypi'] as const) {
    const inner = raw[sourceKey];
    if (inner && typeof inner === 'object') {
      const nested = inner as Record<string, unknown>;
      const name = nested.pypi_name ?? nested.pypiPackage ?? nested.python_package;
      if (typeof name === 'string') return normalizePkg(name);
    }
  }
  // URL fallback https://pypi.org/project/<pkg>/
  const url = typeof it.url === 'string' ? it.url : null;
  if (url && /https?:\/\/(www\.)?pypi\.org\/project\//i.test(url)) {
    const m = url.match(/pypi\.org\/project\/([^/?#]+)/i);
    if (m && m[1]) return normalizePkg(decodeURIComponent(m[1]));
  }
  return null;
}

function normalizePkg(raw: string): string | null {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;
  // PyPI normalization (PEP 503): replace runs of -, _, . with single -.
  const norm = trimmed.replace(/[-_.]+/g, '-');
  if (!/^[a-z0-9][a-z0-9-]*$/.test(norm)) return null;
  return norm;
}

async function fetchPypiWeekly(pkg: string): Promise<number | null> {
  const url = `https://pypistats.org/api/packages/${encodeURIComponent(pkg)}/recent`;
  try {
    const data = await fetchJsonWithRetry<PyPiStatsRecentResponse>(url, {
      attempts: 3,
      retryDelayMs: 2000,
      timeoutMs: 15_000,
      headers: { 'User-Agent': USER_AGENT, accept: 'application/json' },
    });
    const v = data.data?.last_week;
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
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
    fetcher: 'pypi-downloads',
    startedAt,
    finishedAt: new Date().toISOString(),
    itemsSeen: items,
    itemsUpserted: 0,
    metricsWritten: 0,
    redisPublished,
    errors,
  };
}
