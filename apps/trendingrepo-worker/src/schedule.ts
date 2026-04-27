// In-process cron scheduler for the Railway worker.
//
// Each Fetcher in registry.ts declares a 5-field UTC cron expression in its
// `schedule` field. We instantiate one croner job per fetcher; jobs share
// the worker process, share the http+redis singletons, and protect against
// overruns via croner's `protect: true` (a tick fired while the previous
// run is still active is skipped, not queued).
//
// Errors inside a job are caught + Sentry-reported + logged, but they
// never crash the worker. A single fetcher failure should not take down
// the other 11 — Railway restarts on process exit, and we want that
// reserved for actual process-level failures.

import { Cron } from 'croner';
import { FETCHERS } from './registry.js';
import { runFetcher } from './run.js';
import { getLogger } from './lib/log.js';
import { captureException } from './lib/sentry.js';

export interface ScheduledJobStatus {
  name: string;
  schedule: string;
  nextRun: string | null;
  isRunning: boolean;
}

export interface Scheduler {
  /** Stop accepting new ticks; in-flight jobs are NOT interrupted. */
  stop(): void;
  /** Diagnostic snapshot of upcoming next-fire times. */
  status(): ScheduledJobStatus[];
}

export function startScheduler(): Scheduler {
  const log = getLogger();
  const jobs: Array<{ name: string; schedule: string; cron: Cron }> = [];

  for (const fetcher of FETCHERS) {
    const cron = new Cron(
      fetcher.schedule,
      {
        protect: true,
        timezone: 'UTC',
        name: fetcher.name,
        catch: (err: unknown) => {
          // croner's last-resort handler — runFetcher already captures, so
          // this only fires on truly synchronous handler failures.
          captureException(err, { fetcher: fetcher.name, source: 'cron-protect' });
          log.error(
            { fetcher: fetcher.name, err: (err as Error)?.message },
            'cron handler threw synchronously',
          );
        },
      },
      async () => {
        const t0 = Date.now();
        try {
          await runFetcher(fetcher);
          log.info(
            { fetcher: fetcher.name, durationMs: Date.now() - t0 },
            'cron tick complete',
          );
        } catch (err) {
          // runFetcher already captureException'd + logged. Swallow here so
          // the scheduler keeps ticking other fetchers.
          log.error(
            {
              fetcher: fetcher.name,
              durationMs: Date.now() - t0,
              err: (err as Error)?.message,
            },
            'cron tick failed',
          );
        }
      },
    );
    jobs.push({ name: fetcher.name, schedule: fetcher.schedule, cron });
    log.info(
      {
        fetcher: fetcher.name,
        schedule: fetcher.schedule,
        nextRun: cron.nextRun()?.toISOString() ?? null,
      },
      'fetcher scheduled',
    );
  }

  return {
    stop() {
      for (const j of jobs) j.cron.stop();
    },
    status() {
      return jobs.map((j) => ({
        name: j.name,
        schedule: j.schedule,
        nextRun: j.cron.nextRun()?.toISOString() ?? null,
        isRunning: j.cron.isRunning(),
      }));
    },
  };
}
