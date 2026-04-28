// Dev-server fix 2026-04-28: Turbopack 15.5 + @sentry/nextjs 10.50 produces
// a MODULE_UNPARSABLE stub for the canonical Sentry instrumentation hook
// (mixed `await import()` + named re-export confuses the SWC parser even
// after the "✓ Compiled" log line). The hook is a no-op until Sentry/Next
// ship a fix; production builds run via webpack on Vercel and aren't
// affected. See `sentry.{server,edge,client}.config.ts` for the actual
// initialization, which fires when SENTRY_DSN is set at runtime.

export function register() {
  // intentionally empty
}
