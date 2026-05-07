import { initSentry } from './lib/sentry.js';
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

  // --since=<iso> enables one-shot backfill mode (e.g. --since=2026-02-01).
  // Scheduler / cron mode never uses this — see schedule.ts's runFetcher call.
  const sinceArg = args.find((a) => a.startsWith('--since='));
  let sinceOverride: Date | undefined;
  if (sinceArg) {
    const raw = sinceArg.slice('--since='.length);
    const parsed = Date.parse(raw);
    if (!Number.isFinite(parsed)) {
      // eslint-disable-next-line no-console
      console.error(
        `Invalid --since value: "${raw}". Expected an ISO 8601 date (e.g. 2026-02-01 or 2026-02-01T00:00:00Z).`,
      );
      return 2;
    }
    sinceOverride = new Date(parsed);
  }

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
      `Usage: worker <fetcher>|--cron|--healthcheck [--dry-run] [--since=<iso>]\nKnown fetchers: ${listFetcherNames().join(', ')}`,
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
    await runFetcher(fetcher, { dryRun, since: sinceOverride });
    return 0;
  } catch {
    return 1;
  }
}

main(process.argv).then(
  (code) => process.exit(code),
  (err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  },
);
