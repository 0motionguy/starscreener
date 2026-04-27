import { flushSentry, initSentry } from './lib/sentry.js';
import { getLogger } from './lib/log.js';
import { loadEnv } from './lib/env.js';
import { getFetcher, listFetcherNames } from './registry.js';
import { startHealthServer, oneShotHealthcheck } from './server.js';
import { installShutdownHandlers } from './shutdown.js';
import { runFetcher } from './run.js';
import { startScheduler } from './schedule.js';

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
    const scheduler = startScheduler();
    installShutdownHandlers({
      server,
      onClose: async () => {
        scheduler.stop();
      },
    });
    log.info(
      { fetchers: listFetcherNames().length, jobs: scheduler.status() },
      'worker --cron mode (in-process scheduler running)',
    );
    // Process stays alive on the event loop because croner keeps timers
    // armed. The shutdown handlers exit cleanly on SIGTERM/SIGINT.
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

  installShutdownHandlers();

  try {
    await runFetcher(fetcher, { dryRun });
    return 0;
  } catch {
    await flushSentry();
    return 1;
  }
}

main(process.argv).then(
  (code) => process.exit(code),
  (err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    flushSentry().finally(() => process.exit(1));
  },
);
