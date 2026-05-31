// In-process cron scheduler for the HOSTUP worker.
//
// Each Fetcher in registry.ts declares a 5-field UTC cron expression in its
// `schedule` field. We instantiate one croner job per fetcher; jobs share
// the worker process, share the http+redis singletons, and protect against
// overruns via croner's `protect: true` (a tick fired while the previous
// run is still active is skipped, not queued).
//
// Errors inside a job are caught + Sentry-reported + logged, but they
// never crash the worker. A single fetcher failure should not take down
// the other jobs. Container restarts stay reserved for actual process-level
// failures.

import { Cron } from 'croner';
import { FETCHERS } from './registry.js';
import { runFetcher } from './run.js';
import { getLogger } from './lib/log.js';
import { captureException } from './lib/sentry.js';
import {
  applyOverrides,
  loadOverrides,
  startOverrideRefresh,
  summarizeOverrides,
  type SourceOverride,
} from './platform/overrides.js';
import type { Fetcher } from './lib/types.js';
import { diffScheduledFetchers } from './scheduler-reconcile.js';
import { publishSchedulerRuntimeState } from './scheduler-state.js';

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

export async function startScheduler(): Promise<Scheduler> {
  const log = getLogger();
  const jobs = new Map<string, { name: string; schedule: string; cron: Cron }>();
  let stopped = false;
  let reconciliationErrors = 0;

  function refreshRuntimeState(overrides: Map<string, SourceOverride>): void {
    const active = new Set(jobs.keys());
    publishSchedulerRuntimeState({
      activeJobs: active,
      skippedJobs: FETCHERS.filter((fetcher) => !active.has(fetcher.name)).map(
        (fetcher) => fetcher.name,
      ),
      overrides: summarizeOverrides(overrides),
      lastReconciledAt: new Date().toISOString(),
      reconciliationErrors,
    });
  }

  function createJob(fetcher: Fetcher): void {
    if (jobs.has(fetcher.name)) return;
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
    jobs.set(fetcher.name, { name: fetcher.name, schedule: fetcher.schedule, cron });
    log.info(
      {
        fetcher: fetcher.name,
        schedule: fetcher.schedule,
        nextRun: cron.nextRun()?.toISOString() ?? null,
      },
      'fetcher scheduled',
    );
  }

  function stopJob(name: string, reason: string): void {
    const job = jobs.get(name);
    if (!job) return;
    job.cron.stop();
    jobs.delete(name);
    log.info({ fetcher: name, reason }, 'fetcher unscheduled');
  }

  function reconcile(overrides: Map<string, SourceOverride>, reason: string): void {
    if (stopped) return;
    try {
      const desired = applyOverrides(FETCHERS, overrides);
      const diff = diffScheduledFetchers(jobs.keys(), desired);
      for (const name of diff.toStop) stopJob(name, reason);
      for (const fetcher of diff.toStart) createJob(fetcher);
      reconciliationErrors = 0;
      refreshRuntimeState(overrides);
      if (diff.toStart.length > 0 || diff.toStop.length > 0) {
        log.info(
          {
            reason,
            started: diff.toStart.map((fetcher) => fetcher.name),
            stopped: diff.toStop,
            active: jobs.size,
          },
          'source overrides reconciled scheduler jobs',
        );
      }
    } catch (err) {
      reconciliationErrors += 1;
      log.error(
        { err: (err as Error).message, reason },
        'source overrides scheduler reconciliation failed',
      );
      refreshRuntimeState(overrides);
    }
  }

  // Move 1, Phase 2 — apply runtime source overrides at boot. Loader is
  // tolerant: DB outage falls back to .cache/source-overrides.json, missing
  // cache falls back to "all sources active". Never refuses to start. Refresh
  // every 60s and reconcile live so a paused source stops without a restart.
  const overrides = await loadOverrides();
  const filtered = applyOverrides(FETCHERS, overrides);
  const skipped = FETCHERS.filter((f) => !filtered.includes(f));
  const summary = summarizeOverrides(overrides);
  log.info(
    {
      registered: FETCHERS.length,
      activated: filtered.length,
      skipped: skipped.length,
      skippedNames: skipped.map((f) => f.name),
      overrides: summary,
    },
    'source overrides applied to fetcher registry',
  );
  reconcile(overrides, 'boot');
  const stopOverrideRefresh = startOverrideRefresh(60_000, (nextOverrides) =>
    reconcile(nextOverrides, 'refresh'),
  );

  return {
    stop() {
      stopped = true;
      stopOverrideRefresh();
      for (const j of jobs.values()) j.cron.stop();
      jobs.clear();
      refreshRuntimeState(overrides);
    },
    status() {
      return [...jobs.values()].map((j) => ({
        name: j.name,
        schedule: j.schedule,
        nextRun: j.cron.nextRun()?.toISOString() ?? null,
        isRunning: j.cron.isRunning(),
      }));
    },
  };
}
