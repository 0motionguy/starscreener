import { initSentry, flushSentry, captureException } from '../lib/sentry.js';
import { getDb } from '../lib/db.js';
import { getLogger } from '../lib/log.js';

async function main(): Promise<number> {
  initSentry();
  const log = getLogger();
  try {
    const db = getDb();
    const { error } = await db.rpc('refresh_trending_score_history');
    if (error) throw new Error(`refresh_trending_score_history rpc failed: ${error.message}`);
    log.info('recompute-scores done');
    await flushSentry();
    return 0;
  } catch (err) {
    captureException(err);
    log.error({ err: (err as Error).message }, 'recompute-scores failed');
    await flushSentry();
    return 1;
  }
}

main().then((c) => process.exit(c));
