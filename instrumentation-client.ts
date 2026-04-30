import * as Sentry from "@sentry/nextjs";

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env.NODE_ENV,
    release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,

    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 0,

    // Replay integration ships ~50–80 KB to every browser. Gate it behind
    // an opt-in flag so the bytes only land when an active incident wants
    // them. Flip NEXT_PUBLIC_SENTRY_REPLAY=true on the deploy that needs
    // replays, then unset.
    replaysOnErrorSampleRate: process.env.NEXT_PUBLIC_SENTRY_REPLAY === "true" ? 1.0 : 0,
    replaysSessionSampleRate: 0,

    integrations: process.env.NEXT_PUBLIC_SENTRY_REPLAY === "true"
      ? [
          Sentry.replayIntegration({
            maskAllText: false,
            blockAllMedia: false,
          }),
        ]
      : [],

    beforeSend(event, hint) {
      const error = hint.originalException;
      const message = typeof error === "string" ? error : (error as Error)?.message ?? event.message ?? "";

      if (/ResizeObserver|AbortError|Non-Error promise rejection captured/i.test(message)) return null;
      if (event.tags?.["http.status_code"] === "0") return null;

      return event;
    },

    ignoreErrors: [
      "ResizeObserver loop limit exceeded",
      "ResizeObserver loop completed with undelivered notifications",
      "Non-Error promise rejection captured",
      /Loading chunk \d+ failed/,
      "AbortError",
      "Network request failed",
    ],

    initialScope: {
      tags: {
        runtime: "browser",
        product: "trendingrepo",
      },
    },
  });
}
