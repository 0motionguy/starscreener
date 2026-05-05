import * as Sentry from "@sentry/nextjs";

// Dev-server fix 2026-04-28: Turbopack 15.5 + @sentry/nextjs 10.50 produces
// a MODULE_UNPARSABLE stub for the canonical Sentry register hook (mixed
// `await import()` + named re-export confuses the SWC parser even after the
// "✓ Compiled" log line). Keep register as a no-op; the required Next 15
// error hook is exported below. See `sentry.{server,edge,client}.config.ts`
// for the actual initialization, which fires when SENTRY_DSN is set at runtime.

// AGN-70 / AGN-803: operator-friendly soft-warn at module load if Sentry is
// unconfigured in a real production runtime. NO-OP in dev/test/preview to
// avoid log spam — Vercel preview deployments often legitimately skip Sentry.
if (process.env.NODE_ENV === "production" && !process.env.SENTRY_DSN) {
  console.warn(
    "[sentry] SENTRY_DSN missing in production runtime — error reporting disabled. AGN-70: set in Vercel env vars.",
  );
}

export const onRequestError = Sentry.captureRequestError;

let startupLogged = false;

export function register() {
  if (startupLogged) return;
  startupLogged = true;

  const dsn = process.env.SENTRY_DSN;
  if (!dsn || dsn.length === 0) {
    console.error(
      "[STARTUP] SENTRY_DSN not configured - runtime errors will not be reported",
    );
    return;
  }

  console.log("[STARTUP] Sentry DSN present (length:", dsn.length, ")");
}
