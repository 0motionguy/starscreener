// Discover top GitHub-linked npm packages and snapshot their daily download
// telemetry. Ports scripts/scrape-npm.mjs (the daily ranked-list job) — the
// scrape-npm-daily.mjs script writes a separate JSONL log used by sparklines;
// that's a downstream concern and not in this fetcher's slug.
//
// Slug: `npm-packages`. Cadence: daily @ 09:17 UTC (matches scrape-npm.yml).

import type { Fetcher, FetcherContext, RunResult } from '../../lib/types.js';
import { writeDataStore } from '../../lib/redis.js';
import { fetchJsonWithRetry, HttpStatusError, sleep } from '../../lib/util/http-helpers.js';
import {
  WINDOWS,
  parseDiscoveryQueries,
  encodePackageName,
  normalizeSearchObject,
  mergeCandidate,
  computeDownloadStats,
  resolveDownloadRange,
  normalizeRangePayload,
  sortByWindow,
  type DownloadStat,
  type NpmCandidate,
} from '../../lib/sources/npm.js';

const USER_AGENT = 'TrendingRepo/1.0 (+https://trendingrepo.com)';
const SEARCH_SIZE = clampInt(process.env.NPM_SEARCH_SIZE, 10, 1, 100);
const CANDIDATE_LIMIT = clampInt(process.env.NPM_CANDIDATE_LIMIT, 50, 1, 250);
const TOP_LIMIT = clampInt(process.env.NPM_TOP_LIMIT, 75, 1, 250);
const SEARCH_DELAY_MS = clampInt(process.env.NPM_SEARCH_DELAY_MS, 750, 0, 60_000);
const DOWNLOAD_RANGE_DELAY_MS = clampInt(process.env.NPM_DOWNLOAD_RANGE_DELAY_MS, 650, 0, 60_000);
const DOWNLOAD_LAG_DAYS = clampInt(process.env.NPM_DOWNLOAD_LAG_DAYS, 2, 1, 7);
const RANGE_DAYS = 60;

function clampInt(raw: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

interface NpmSearchResponse {
  objects?: unknown[];
}

async function fetchSearchResults(query: string): Promise<NpmSearchResponse> {
  const url = new URL('https://registry.npmjs.org/-/v1/search');
  url.searchParams.set('text', query);
  url.searchParams.set('size', String(SEARCH_SIZE));
  url.searchParams.set('from', '0');
  url.searchParams.set('quality', '0.2');
  url.searchParams.set('popularity', '0.6');
  url.searchParams.set('maintenance', '0.2');
  return fetchJsonWithRetry<NpmSearchResponse>(url.toString(), {
    attempts: 4,
    retryDelayMs: 5_000,
    timeoutMs: 20_000,
    headers: { 'User-Agent': USER_AGENT },
  });
}

interface NpmRangeResponse {
  downloads?: Array<{ day?: string; downloads?: number }>;
}

async function fetchPackageDownloadRange(
  name: string,
  range: { start: string; end: string },
): Promise<Array<{ day: string; downloads: number }>> {
  const url =
    `https://api.npmjs.org/downloads/range/${range.start}:${range.end}/` +
    encodePackageName(name);
  try {
    const payload = await fetchJsonWithRetry<NpmRangeResponse>(url, {
      attempts: 4,
      retryDelayMs: 5_000,
      timeoutMs: 30_000,
      headers: { 'User-Agent': USER_AGENT },
    });
    return normalizeRangePayload(payload);
  } catch (err) {
    if (err instanceof HttpStatusError && err.status === 404) return [];
    throw err;
  }
}

interface NpmHydratedRow extends NpmCandidate, DownloadStat {
  status: 'ok';
  downloads: Array<{ day: string; downloads: number }>;
  error: string | null;
}

interface NpmPackagesPayload {
  fetchedAt: string;
  source: 'npm';
  sourceUrl: string;
  registrySearchUrl: string;
  windowDays: number;
  windows: readonly string[];
  activeWindowDefault: '24h';
  downloadRange: string;
  lagHint: string;
  discovery: {
    mode: 'registry-search-with-github-repo-filter';
    searchSize: number;
    topLimit: number;
    candidateLimit: number;
    downloadRangeDelayMs: number;
    downloadLagDays: number;
    queries: string[];
    candidatesFound: number;
    failures: Array<{ query?: string; package?: string; error: string }>;
  };
  counts: {
    total: number;
    ok: number;
    missing: number;
    error: number;
    linkedRepos: number;
  };
  top: Record<string, string[]>;
  packages: NpmHydratedRow[];
}

const fetcher: Fetcher = {
  name: 'npm-packages',
  schedule: '17 9 * * *', // matches scrape-npm.yml
  async run(ctx: FetcherContext): Promise<RunResult> {
    const startedAt = new Date().toISOString();

    if (ctx.dryRun) {
      ctx.log.info('npm-packages dry-run');
      return done(startedAt, 0, false);
    }

    const queries = parseDiscoveryQueries(process.env.NPM_DISCOVERY_QUERIES);
    const fetchedAt = new Date().toISOString();
    ctx.log.info(
      { queries: queries.length, searchSize: SEARCH_SIZE },
      'npm-packages discovery start',
    );

    const byName = new Map<string, NpmCandidate>();
    const failures: NpmPackagesPayload['discovery']['failures'] = [];

    for (const query of queries) {
      try {
        const payload = await fetchSearchResults(query);
        const objects = Array.isArray(payload?.objects) ? payload.objects : [];
        let linked = 0;
        for (const object of objects) {
          const candidate = normalizeSearchObject(object as never, query);
          if (!candidate) continue;
          linked += 1;
          const key = candidate.name.toLowerCase();
          byName.set(key, mergeCandidate(byName.get(key), candidate));
        }
        ctx.log.info({ query, total: objects.length, linked }, 'npm search');
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        failures.push({ query, error: message });
        ctx.log.warn({ query, message }, 'npm search failed');
      }
      if (SEARCH_DELAY_MS > 0) await sleep(SEARCH_DELAY_MS);
    }

    const candidates = Array.from(byName.values()).sort((a, b) =>
      b.discovery.finalScore - a.discovery.finalScore || a.name.localeCompare(b.name),
    );
    const candidatesForDownloads = candidates
      .slice()
      .sort((a, b) => {
        const byMonthly =
          (b.discovery.monthlyDownloads ?? 0) - (a.discovery.monthlyDownloads ?? 0);
        if (byMonthly !== 0) return byMonthly;
        return (b.discovery.finalScore ?? 0) - (a.discovery.finalScore ?? 0);
      })
      .slice(0, CANDIDATE_LIMIT);

    const range = resolveDownloadRange({
      days: RANGE_DAYS,
      lagDays: DOWNLOAD_LAG_DAYS,
      endDate: process.env.NPM_DOWNLOAD_END_DATE,
    });
    const matrix = new Map<string, { downloads: Array<{ day: string; downloads: number }>; stats: DownloadStat; error: string | null }>();
    for (const [index, candidate] of candidatesForDownloads.entries()) {
      const key = candidate.name.toLowerCase();
      try {
        const downloads = await fetchPackageDownloadRange(candidate.name, range);
        matrix.set(key, { downloads, stats: computeDownloadStats(downloads), error: null });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        failures.push({ package: candidate.name, error: message });
        matrix.set(key, {
          downloads: [],
          stats: computeDownloadStats([]),
          error: message,
        });
        ctx.log.warn({ pkg: candidate.name, message }, 'npm range fetch failed');
      }
      if (DOWNLOAD_RANGE_DELAY_MS > 0 && index < candidatesForDownloads.length - 1) {
        await sleep(DOWNLOAD_RANGE_DELAY_MS);
      }
    }

    const hydrated: NpmHydratedRow[] = candidatesForDownloads
      .map((candidate) => {
        const fetched = matrix.get(candidate.name.toLowerCase());
        const stats = fetched?.stats ?? computeDownloadStats([]);
        return {
          ...candidate,
          status: 'ok' as const,
          downloads: fetched?.downloads ?? [],
          error: fetched?.error ?? null,
          ...stats,
        };
      })
      .filter((row) => row.downloads30d > 0);

    const topNameSet = new Set<string>();
    for (const window of WINDOWS) {
      for (const row of sortByWindow(hydrated, window).slice(0, TOP_LIMIT)) {
        topNameSet.add(row.name.toLowerCase());
      }
    }
    const rows = sortByWindow(
      hydrated.filter((row) => topNameSet.has(row.name.toLowerCase())),
      '24h',
    );
    const top: Record<string, string[]> = {};
    for (const window of WINDOWS) {
      top[window] = sortByWindow(rows, window)
        .slice(0, TOP_LIMIT)
        .map((row) => row.name);
    }

    const payload: NpmPackagesPayload = {
      fetchedAt,
      source: 'npm',
      sourceUrl: 'https://api.npmjs.org/downloads/',
      registrySearchUrl: 'https://registry.npmjs.org/-/v1/search',
      windowDays: RANGE_DAYS,
      windows: WINDOWS,
      activeWindowDefault: '24h',
      downloadRange: `range:${range.start}:${range.end}`,
      lagHint:
        'npm public download stats usually lag by 24-48 hours; the default range ends two days back',
      discovery: {
        mode: 'registry-search-with-github-repo-filter',
        searchSize: SEARCH_SIZE,
        topLimit: TOP_LIMIT,
        candidateLimit: CANDIDATE_LIMIT,
        downloadRangeDelayMs: DOWNLOAD_RANGE_DELAY_MS,
        downloadLagDays: DOWNLOAD_LAG_DAYS,
        queries,
        candidatesFound: candidates.length,
        failures,
      },
      counts: {
        total: rows.length,
        ok: rows.length,
        missing: 0,
        error: failures.filter((f) => f.package).length,
        linkedRepos: rows.filter((row) => row.linkedRepo).length,
      },
      top,
      packages: rows,
    };
    const result = await writeDataStore('npm-packages', payload);
    ctx.log.info(
      { rows: rows.length, queries: queries.length, redisSource: result.source },
      'npm-packages published',
    );
    return done(startedAt, rows.length, result.source === 'redis');
  },
};

export default fetcher;

function done(startedAt: string, items: number, redisPublished: boolean): RunResult {
  return {
    fetcher: 'npm-packages',
    startedAt,
    finishedAt: new Date().toISOString(),
    itemsSeen: items,
    itemsUpserted: 0,
    metricsWritten: 0,
    redisPublished,
    errors: [],
  };
}
