/**
 * One-shot seed script for the C-CAT classifier.
 *
 * Operators run this manually after deploy to seed the
 * `repo-categories` redis key without waiting for the daily cron tick
 * (worker schedule: '17 3 * * *' UTC). Calls the same fetcher.run()
 * with a no-op FetcherContext.
 *
 * Usage:
 *   NANOGPT_API_KEY=... pnpm tsx scripts/classify-categories.ts
 */

import categoryClassify from '../apps/trendingrepo-worker/src/fetchers/category-classify/index.js';
import type { FetcherContext } from '../apps/trendingrepo-worker/src/lib/types.js';

type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

function makeLog(): FetcherContext['log'] {
  const print = (level: LogLevel) => (...args: unknown[]) => {
    const ts = new Date().toISOString();
    const [first, ...rest] = args;
    const obj = typeof first === 'object' && first !== null ? first : undefined;
    const msg = obj ? rest[0] : first;
    const tail = obj ? JSON.stringify(obj) : '';
    console.log(`${ts} [${level}] ${String(msg ?? '')} ${tail}`);
  };
  return {
    trace: print('trace'),
    debug: print('debug'),
    info: print('info'),
    warn: print('warn'),
    error: print('error'),
    fatal: print('fatal'),
    child: () => makeLog(),
  } as unknown as FetcherContext['log'];
}

async function main() {
  const ctx: FetcherContext = {
    log: makeLog(),
    dryRun: false,
    runId: `seed-${Date.now()}`,
  } as unknown as FetcherContext;

  const result = await categoryClassify.run(ctx);
  console.log('\nResult:', JSON.stringify(result, null, 2));
  process.exit(result.errors.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('classify-categories seed failed:', err);
  process.exit(1);
});
