import { initSentry, captureException } from './lib/sentry.js';
import { getLogger } from './lib/log.js';
import { loadEnv } from './lib/env.js';
import { getRedis } from './lib/redis.js';
import { getDb } from './lib/db.js';
import { createHttpClient } from './lib/http.js';
import type { FetcherContext, RedisHandle, RunResult } from './lib/types.js';
import { getFetcher, listFetcherNames } from './registry.js';
import { startHealthServer, oneShotHealthcheck, recordRun } from './server.js';
import { installShutdownHandlers } from './shutdown.js';

async function main(argv: string[]): Promise<number> {
  initSentry();
  loadEnv();
  const log = getLogger();

  const args = argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const cronMode = args.includes('--cron');
  const healthOnly = args.includes('--healthcheck') || args.includes('--health');
  const positional = args.filter((a) => !a.startsWith('--'));
  const fetcherName = positional[0];

  if (healthOnly) {
    return oneShotHealthcheck();
  }

  if (cronMode) {
    const server = startHealthServer();
    installShutdownHandlers({ server });
    log.info({ fetchers: listFetcherNames() }, 'worker --cron mode (idle, awaiting external scheduler)');
    await new Promise(() => {});
    return 0;
  }

  if (!fetcherName) {
    // eslint-disable-next-line no-console
    console.error(
      `Usage: worker <fetcher>|--cron|--healthcheck [--dry-run]\nKnown fetchers: ${listFetcherNames().join(', ')}`,
    );
    return 2;
  }

  const fetcher = getFetcher(fetcherName);
  if (!fetcher) {
    // eslint-disable-next-line no-console
    console.error(`Unknown fetcher "${fetcherName}". Known: ${listFetcherNames().join(', ')}`);
    return 2;
  }

  if (fetcher.requiresFirecrawl && !process.env.FIRECRAWL_API_KEY) {
    log.warn({ fetcher: fetcher.name }, 'fetcher requires FIRECRAWL_API_KEY but env is empty - skipping');
    return 0;
  }

  installShutdownHandlers();

  const startedAt = new Date().toISOString();
  let result: RunResult = {
    fetcher: fetcher.name,
    startedAt,
    finishedAt: startedAt,
    itemsSeen: 0,
    itemsUpserted: 0,
    metricsWritten: 0,
    redisPublished: false,
    errors: [],
  };

  try {
    const redis = dryRun ? null : await getRedis();
    let db: import('@supabase/supabase-js').SupabaseClient;
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
    const httpClient = createHttpClient({ redis, log });
    const ctx: FetcherContext = {
      db,
      redis: redis ?? throwOnUseRedisHandle(),
      http: httpClient,
      log: log.child({ fetcher: fetcher.name }),
      dryRun,
      since: new Date(Date.now() - 24 * 60 * 60 * 1000),
      signalRunComplete: async () => {
        recordRun();
      },
    };
    log.info({ fetcher: fetcher.name, dryRun }, 'fetcher start');
    result = await fetcher.run(ctx);
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
    recordRun();
  } catch (err) {
    captureException(err, { fetcher: fetcher.name });
    log.error({ err: (err as Error).message, fetcher: fetcher.name }, 'fetcher failed');
    return 1;
  }

  return 0;
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
      throw new Error('Supabase is not configured (dry-run only allows db-free fetchers)');
    },
  });
}

main(process.argv).then(
  (code) => process.exit(code),
  (err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  },
);
