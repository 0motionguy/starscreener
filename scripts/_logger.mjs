// Shared structured logger for the standalone scrape scripts (cron-driven,
// run under node by GitHub Actions). Writes to stdout for GHA log capture
// AND mirrors warn/error/fatal events to Sentry when SENTRY_DSN is set so
// incidents survive past GHA's ~3h log retention.
//
// Usage:
//   import { createLogger, captureCircuitBreaker } from "./_logger.mjs";
//   const log = createLogger({ source: "bluesky" });
//   log.info("scrape started", { window: "24h" });
//   log.warn("rate limited", { retryAfter: 5 });
//   log.error("scrape failed", { err });           // → Sentry
//   captureCircuitBreaker({ source: "bluesky", consecutiveFailures: 3 });

import * as Sentry from "@sentry/node";

let initialized = false;
function initSentry() {
  if (initialized) return;
  initialized = true;
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? "production",
    release: process.env.GITHUB_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA,
    tracesSampleRate: 0,
    initialScope: {
      tags: {
        runtime: "scrape-script",
        product: "trendingrepo",
        ghaJob: process.env.GITHUB_JOB,
        ghaRunId: process.env.GITHUB_RUN_ID,
      },
    },
  });
}

function nowIso() {
  return new Date().toISOString();
}

function fmt(level, source, msg, extra) {
  const line = { ts: nowIso(), level, source, msg, ...extra };
  return JSON.stringify(line);
}

export function createLogger({ source }) {
  initSentry();
  return {
    info(msg, extra = {}) {
      console.log(fmt("info", source, msg, extra));
    },
    warn(msg, extra = {}) {
      console.warn(fmt("warn", source, msg, extra));
      Sentry.captureMessage(`[${source}] ${msg}`, {
        level: "warning",
        tags: { source },
        extra,
      });
    },
    error(msg, extra = {}) {
      console.error(fmt("error", source, msg, extra));
      const err = extra?.err instanceof Error ? extra.err : new Error(`[${source}] ${msg}`);
      Sentry.captureException(err, {
        tags: { source },
        extra: { msg, ...extra },
      });
    },
    fatal(msg, extra = {}) {
      console.error(fmt("fatal", source, msg, extra));
      const err = extra?.err instanceof Error ? extra.err : new Error(`[${source}] ${msg}`);
      Sentry.captureException(err, {
        level: "fatal",
        tags: { source },
        extra: { msg, ...extra },
      });
    },
    async flush(timeoutMs = 2000) {
      try {
        await Sentry.flush(timeoutMs);
      } catch {
        /* ignore */
      }
    },
  };
}

// Emit a structured Sentry event when an adapter trips its consecutive-
// failure threshold. Distinct from a single error — this is the alarm
// that should page someone before the 15-min freshness probe surfaces it.
export function captureCircuitBreaker({ source, consecutiveFailures, lastError }) {
  initSentry();
  Sentry.captureMessage(`[circuit-breaker] ${source} tripped (${consecutiveFailures} failures)`, {
    level: "error",
    tags: { source, kind: "circuit-breaker" },
    extra: {
      consecutiveFailures,
      lastError: lastError?.message ?? String(lastError ?? ""),
    },
  });
}

// Convenience for cron scripts that should always flush before exit.
export async function withSentry(source, fn) {
  initSentry();
  const log = createLogger({ source });
  try {
    return await fn(log);
  } catch (err) {
    log.fatal("script crashed", { err });
    throw err;
  } finally {
    await log.flush();
  }
}
