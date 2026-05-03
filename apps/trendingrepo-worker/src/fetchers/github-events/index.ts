// Phase 3.3 — GitHub Events firehose for the top-N watchlist.
//
// Polls /repos/{owner}/{name}/events for the top WATCHLIST_TARGET (default
// 50) repos every 5 minutes, normalizes the events down to the relevant
// types (Watch/Fork/Issues/PullRequest/Push/Release), and writes one Redis
// slug per repo: `github-events:<repoId>`. Also publishes a watchlist
// roster slug `github-events:_index` so the consumer route can validate
// a repo is being polled before reading.
//
// Auth: GH_TOKEN_POOL (10 PATs) round-robin via `pickGithubToken()`. With
// the default cadence (50 repos × 12 ticks/hr = 600 calls/hr) and 5K/hr
// per PAT, the pool absorbs ~83x headroom. Per-repo errors are aggregated
// into RunResult.errors so one bad repo can't take down the other 49.
//
// ETag caching: handled transparently by `ctx.http.json` — every URL has
// its ETag stored under tr:etag:<url> and the body under tr:etag-body:<url>
// in Redis. A 304 response replays the cached body, so a "no new events"
// tick costs ~one HEAD-equivalent of bandwidth.
//
// Latency: 5 min is the realistic floor given 50 sequential calls + GH's
// per-IP rate windows. The operator brief targets sub-minute latency for
// the FIRST event after a star — the watchlist polling cadence pluses GH's
// own ~10s ingestion delay defines the lower bound.

import type { Fetcher, FetcherContext, RunResult } from '../../lib/types.js';
import { writeDataStore, readDataStore } from '../../lib/redis.js';
import { pickGithubToken } from '../../lib/util/github-token-pool.js';
import { normalizeEvents } from './parser.js';
import { deriveWatchlist } from './watchlist.js';
import type {
  GithubEventsIndexEntry,
  GithubEventsIndexPayload,
  GithubEventsPayload,
} from './types.js';

const GITHUB_API = 'https://api.github.com';
const GITHUB_API_VERSION = '2022-11-28';
const PER_PAGE = 100;

// 50 repos × 12 ticks/hr = 600 calls/hr against ~50K/hr pool capacity.
// Override via env if pool grows or contracts.
const WATCHLIST_TARGET = Math.max(
  1,
  Math.min(
    200,
    Number.parseInt(process.env.GITHUB_EVENTS_WATCHLIST_TARGET ?? '50', 10) || 50,
  ),
);

// Small concurrency cap to overlap network latency without thundering
// the GH API. 5 in-flight is comfortable for a single-core Railway box.
const FETCH_CONCURRENCY = Math.max(
  1,
  Math.min(
    20,
    Number.parseInt(process.env.GITHUB_EVENTS_CONCURRENCY ?? '5', 10) || 5,
  ),
);

// Slug helpers — colon-typed namespace so the consumer can do O(1) repo
// lookups by ID. Keep these in lockstep with src/lib/github-events.ts.
function repoSlug(repoId: number): string {
  return `github-events:${repoId}`;
}

const INDEX_SLUG = 'github-events:_index';

// ---- Watchlist source loaders --------------------------------------------

interface UnknownPayload {
  [key: string]: unknown;
}

async function loadWatchlistSources(): Promise<{
  engagement: UnknownPayload | null;
  trending: UnknownPayload | null;
  repoMetadata: UnknownPayload | null;
}> {
  // AUDIT-2026-05-04: allSettled so a single Redis flake degrades to
  // null instead of crashing the whole fetcher. Same fix as f39cd09d.
  const reads = await Promise.allSettled([
    readDataStore<UnknownPayload>('engagement-composite'),
    readDataStore<UnknownPayload>('trending'),
    readDataStore<UnknownPayload>('repo-metadata'),
  ]);
  const engagement = reads[0].status === 'fulfilled' ? reads[0].value : null;
  const trending = reads[1].status === 'fulfilled' ? reads[1].value : null;
  const repoMetadata = reads[2].status === 'fulfilled' ? reads[2].value : null;
  if (reads.some((r) => r.status === 'rejected')) {
    const reasonOf = (r: PromiseSettledResult<unknown> | undefined) =>
      r && r.status === 'rejected'
        ? r.reason instanceof Error
          ? r.reason.message
          : String(r.reason)
        : null;
    console.warn(
      '[github-events] watchlist-source read failed; degrading to null',
      JSON.stringify({
        engagement: reasonOf(reads[0]),
        trending: reasonOf(reads[1]),
        repoMetadata: reasonOf(reads[2]),
      }),
    );
  }
  return { engagement, trending, repoMetadata };
}

// ---- Per-repo polling ----------------------------------------------------

interface FetchResult {
  ok: boolean;
  payload?: GithubEventsPayload;
  errorStage?: string;
  errorMessage?: string;
}

async function fetchOneRepo(
  ctx: FetcherContext,
  entry: GithubEventsIndexEntry,
  fetchedAt: string,
): Promise<FetchResult> {
  const token = pickGithubToken();
  if (!token) {
    return {
      ok: false,
      errorStage: `repo:${entry.fullName}`,
      errorMessage: 'no GH PAT available (token pool empty)',
    };
  }

  const url = `${GITHUB_API}/repos/${entry.fullName}/events?per_page=${PER_PAGE}`;

  try {
    // ctx.http.json transparently handles ETag caching: a 304 reply
    // (no new events) is replayed from tr:etag-body:<url> in Redis,
    // costing ~zero bandwidth. We trust the worker's own client to
    // surface 4xx/5xx as thrown errors.
    const { data, etag } = await ctx.http.json<unknown>(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'User-Agent': 'starscreener-worker/github-events',
        'X-GitHub-Api-Version': GITHUB_API_VERSION,
      },
      timeoutMs: 20_000,
      maxRetries: 2,
    });

    const events = normalizeEvents(data);
    const payload: GithubEventsPayload = {
      fetchedAt,
      repoId: entry.repoId,
      fullName: entry.fullName,
      eventCount: events.length,
      events,
      etag: etag ?? null,
    };
    return { ok: true, payload };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      errorStage: `repo:${entry.fullName}`,
      errorMessage: message,
    };
  }
}

/**
 * Poll the watchlist with a small concurrency cap. Settled-style — a
 * single bad repo doesn't poison the batch.
 */
async function pollWatchlist(
  ctx: FetcherContext,
  entries: GithubEventsIndexEntry[],
  fetchedAt: string,
): Promise<FetchResult[]> {
  const results = new Array<FetchResult>(entries.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < entries.length) {
      const idx = cursor++;
      const entry = entries[idx];
      if (!entry) continue;
      results[idx] = await fetchOneRepo(ctx, entry, fetchedAt);
    }
  }

  const workers = Array.from({ length: Math.min(FETCH_CONCURRENCY, entries.length) }, () =>
    worker(),
  );
  await Promise.all(workers);
  return results;
}

// ---- Fetcher entry point -------------------------------------------------

const fetcher: Fetcher = {
  name: 'github-events',
  // Every 5 minutes — the realistic floor for a 50-repo polling cycle on a
  // single PAT pool. Tighter cadences (1-2 min) would either need a larger
  // pool or risk per-PAT secondary rate-limit kicks.
  schedule: '*/5 * * * *',
  async run(ctx: FetcherContext): Promise<RunResult> {
    const startedAt = new Date().toISOString();
    const errors: RunResult['errors'] = [];

    if (ctx.dryRun) {
      ctx.log.info('github-events dry-run');
      return done(startedAt, 0, false, errors);
    }

    if (!pickGithubToken()) {
      const msg = 'GH_TOKEN_POOL / GITHUB_TOKEN not configured — skipping github-events';
      ctx.log.warn(msg);
      return done(startedAt, 0, false, [{ stage: 'auth', message: msg }]);
    }

    // Resolve the watchlist from upstream signal slugs.
    const sources = await loadWatchlistSources();
    const { entries, drivers, available } = deriveWatchlist({
      target: WATCHLIST_TARGET,
      engagement: sources.engagement as Parameters<typeof deriveWatchlist>[0]['engagement'],
      trending: sources.trending as Parameters<typeof deriveWatchlist>[0]['trending'],
      repoMetadata: sources.repoMetadata as Parameters<typeof deriveWatchlist>[0]['repoMetadata'],
    });

    if (entries.length === 0) {
      const msg = `watchlist empty — no upstream slug returned candidates (available: ${available.join(', ') || 'none'})`;
      ctx.log.warn(msg);
      // Still publish the index slug so the route returns a clean 404 for
      // unknown repos rather than a 503-by-omission.
      await writeDataStore(INDEX_SLUG, {
        fetchedAt: new Date().toISOString(),
        watchlistSize: 0,
        repos: [],
      } satisfies GithubEventsIndexPayload).catch(() => undefined);
      return done(startedAt, 0, false, [{ stage: 'watchlist', message: msg }]);
    }

    const fetchedAt = new Date().toISOString();
    const results = await pollWatchlist(ctx, entries, fetchedAt);

    let written = 0;
    let redisOk = false;
    for (let i = 0; i < results.length; i += 1) {
      const r = results[i]!;
      const entry = entries[i]!;
      if (!r.ok || !r.payload) {
        errors.push({
          stage: r.errorStage ?? `repo:${entry.fullName}`,
          message: r.errorMessage ?? 'unknown failure',
        });
        continue;
      }
      try {
        const wr = await writeDataStore(repoSlug(entry.repoId), r.payload);
        if (wr.source === 'redis') redisOk = true;
        written += 1;
      } catch (err) {
        errors.push({
          stage: `write:${entry.fullName}`,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Publish the index roster LAST so a partial-success tick still yields
    // a route-validatable list (consumers prefer "503 — no payload yet"
    // over "404 — never heard of this repo").
    const indexPayload: GithubEventsIndexPayload = {
      fetchedAt,
      watchlistSize: entries.length,
      repos: entries,
    };
    try {
      const wr = await writeDataStore(INDEX_SLUG, indexPayload);
      if (wr.source === 'redis') redisOk = true;
    } catch (err) {
      errors.push({
        stage: 'write:_index',
        message: err instanceof Error ? err.message : String(err),
      });
    }

    ctx.log.info(
      {
        watchlist: entries.length,
        written,
        errors: errors.length,
        drivers,
        available,
      },
      'github-events published',
    );

    return done(startedAt, written, redisOk, errors);
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
    fetcher: 'github-events',
    startedAt,
    finishedAt: new Date().toISOString(),
    itemsSeen: items,
    itemsUpserted: 0,
    metricsWritten: 0,
    redisPublished,
    errors,
  };
}
