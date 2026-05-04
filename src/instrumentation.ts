import * as Sentry from "@sentry/nextjs";

let startupLogged = false;

export const onRequestError = Sentry.captureRequestError;

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
