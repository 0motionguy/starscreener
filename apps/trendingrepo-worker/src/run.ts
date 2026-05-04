// Reusable per-fetcher runner. Used by both the one-shot CLI path
// (`worker <fetcher>`) and the in-process scheduler (`worker --cron`).
//
// Provides the FetcherContext: redis (or null in dry-run), supabase (only
// when fetcher.requiresDb=true; a throw-on-access proxy otherwise), an
// undici-backed http client with ETag cache, a child logger, and a
// recordRun() callback for the healthcheck.
//
// Errors are reported to Sentry + logged, then re-thrown so the caller
// (CLI / scheduler) can decide how to respond.

import { captureException } from './lib/sentry.js';
import { getLogger } from './lib/log.js';
import { getRedis, setCurrentFetcherName } from './lib/redis.js';
import { getDb } from './lib/db.js';
import { createHttpClient } from './lib/http.js';
import type { Fetcher, FetcherContext, RedisHandle, RunResult } from './lib/types.js';
import { recordRun } from './server.js';

export interface RunOptions {
  dryRun?: boolean;
  /**
   * Caller-supplied `since` override (one-shot CLI backfill mode). Wins
   * over `Fetcher.defaultLookbackHours`. The scheduler does NOT pass this,
   * so cron ticks always use the rolling 24h (or per-fetcher) window.
   */
  since?: Date;
}

export async function runFetcher(
  fetcher: Fetcher,
  opts: RunOptions = {},
): Promise<RunResult> {
  const log = getLogger();
  const dryRun = opts.dryRun === true;
  const startedAt = new Date().toISOString();

  if (fetcher.requiresFirecrawl && !process.env.FIRECRAWL_API_KEY) {
    log.warn(
      { fetcher: fetcher.name },
      'fetcher requires FIRECRAWL_API_KEY but env is empty - skipping',
    );
    return emptyResult(fetcher.name, startedAt);
  }

  // Set the writer-provenance slot so any writeDataStore() call inside the
  // fetcher attributes itself to `worker:<name>` in the meta JSON. Cleared
  // in finally so concurrent (or subsequent) calls can't mistakenly inherit
  // a stale name.
  setCurrentFetcherName(fetcher.name);
  try {
    const redis = dryRun ? null : await getRedis();

    let db: import('@supabase/supabase-js').SupabaseClient;
    if (fetcher.requiresDb) {
      try {
        db = getDb();
      } catch (err) {
        if (!dryRun) throw err;
        log.warn(
          { err: (err as Error).message },
          'db unavailable - proceeding in dry-run; any db call will throw',
        );
        db = throwOnUseDb();
      }
    } else {
      // Redis-only fetcher (the StarScreener default). Hand a proxy so any
      // accidental ctx.db access surfaces a clear error instead of pulling
      // Supabase env at a surprising time.
      db = throwOnUseDb();
    }

    const httpClient = createHttpClient({ redis, log });
    const sinceDate =
      opts.since ??
      new Date(Date.now() - (fetcher.defaultLookbackHours ?? 24) * 3600_000);
    const sinceSource: 'cli' | 'fetcher' | 'default' = opts.since
      ? 'cli'
      : fetcher.defaultLookbackHours
        ? 'fetcher'
        : 'default';
    const ctx: FetcherContext = {
      db,
      redis: redis ?? throwOnUseRedisHandle(),
      http: httpClient,
      log: log.child({ fetcher: fetcher.name }),
      dryRun,
      since: sinceDate,
      signalRunComplete: async () => {
        recordRun();
      },
    };

    log.info(
      { since: ctx.since.toISOString(), source: sinceSource },
      'fetcher since window',
    );
    log.info(
      { fetcher: fetcher.name, dryRun, requiresDb: fetcher.requiresDb === true },
      'fetcher start',
    );
    // AUDIT-2026-05-04 §B2 — surface fetcher.name to writeDataStore so
    // the WriterMeta envelope records "worker:<service>:<fetcher>".
    const prevFetcherEnv = process.env.FETCHER_NAME;
    process.env.FETCHER_NAME = fetcher.name;
    let result: RunResult;
    try {
      result = await fetcher.run(ctx);
    } finally {
      if (prevFetcherEnv === undefined) delete process.env.FETCHER_NAME;
      else process.env.FETCHER_NAME = prevFetcherEnv;
    }
    log.info(
      {
        fetcher: fetcher.name,
        itemsSeen: result.itemsSeen,
        itemsUpserted: result.itemsUpserted,
        metricsWritten: result.metricsWritten,
        redisPublished: result.redisPublished,
        errors: result.errors.length,
      },
      'fetcher complete',
    );
    // Diagnostic for AUDIT-2026-05-04: trending_items.last_seen_at lagged
    // for sources like `glama` while worker lastRunAt was fresh. Surfaces
    // requiresDb fetchers that ran but wrote zero rows so they're easy to
    // spot in Sentry / log search instead of hiding behind aggregate health.
    if (fetcher.requiresDb === true && result.itemsUpserted === 0) {
      log.warn(
        { fetcher: fetcher.name, itemsSeen: result.itemsSeen },
        'requiresDb fetcher wrote zero rows — check trending_items.last_seen_at',
      );
    }
    recordRun();
    return result;
  } catch (err) {
    captureException(err, { fetcher: fetcher.name });
    log.error({ err: (err as Error).message, fetcher: fetcher.name }, 'fetcher failed');
    throw err;
  } finally {
    setCurrentFetcherName(null);
  }
}

function emptyResult(name: string, startedAt: string): RunResult {
  return {
    fetcher: name,
    startedAt,
    finishedAt: new Date().toISOString(),
    itemsSeen: 0,
    itemsUpserted: 0,
    metricsWritten: 0,
    redisPublished: false,
    errors: [],
  };
}

function throwOnUseRedisHandle(): RedisHandle {
  return {
    async get() {
      throw new Error('Redis is not configured');
    },
    async set() {
      throw new Error('Redis is not configured');
    },
    async del() {
      throw new Error('Redis is not configured');
    },
    async quit() {
      // no-op
    },
  };
}

function throwOnUseDb(): import('@supabase/supabase-js').SupabaseClient {
  return new Proxy({} as import('@supabase/supabase-js').SupabaseClient, {
    get() {
      throw new Error(
        'Supabase is not configured for this fetcher. Set requiresDb=true on the Fetcher to opt in.',
      );
    },
  });
}
