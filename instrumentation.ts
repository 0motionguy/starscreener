import * as Sentry from "@sentry/nextjs";

// Dev-server fix 2026-04-28: Turbopack 15.5 + @sentry/nextjs 10.50 produces
// a MODULE_UNPARSABLE stub for the canonical Sentry register hook (mixed
// `await import()` + named re-export confuses the SWC parser even after the
// "✓ Compiled" log line). Keep register as a no-op; the required Next 15
// error hook is exported below. See `sentry.{server,edge,client}.config.ts`
// for the actual initialization, which fires when SENTRY_DSN is set at runtime.

export const onRequestError = Sentry.captureRequestError;

export function register() {
  // intentionally empty
}
