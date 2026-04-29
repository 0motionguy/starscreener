import { initSentry, flushSentry, captureException } from '../lib/sentry.js';
import { getDb } from '../lib/db.js';
import { getLogger } from '../lib/log.js';
import { publishLeaderboard } from '../lib/publish.js';
import { TRENDING_ITEM_TYPES } from '../lib/types.js';

async function main(): Promise<number> {
  initSentry();
  const log = getLogger();
  const db = getDb();
  let exitCode = 0;
  for (const type of TRENDING_ITEM_TYPES) {
    try {
      const result = await publishLeaderboard(db, type);
      log.info(
        { type, items: result.items, redisPublished: result.redisPublished },
        'published leaderboard',
      );
    } catch (err) {
      captureException(err, { type });
      log.error({ err: (err as Error).message, type }, 'publish failed');
      exitCode = 1;
    }
  }
  await flushSentry();
  return exitCode;
}

main().then((c) => process.exit(c));
