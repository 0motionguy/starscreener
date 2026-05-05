import * as Sentry from "@sentry/nextjs";

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

// AGN-851 / OBS-6: dev-only long-task profiler.
// Strictly gated on NODE_ENV === "development" so production bundles never
// register the observer. Warns once per long task that exceeds the local
// performance budget (default 50ms, overridable via
// NEXT_PUBLIC_DEV_LONG_TASK_BUDGET_MS).
if (
  process.env.NODE_ENV === "development" &&
  typeof window !== "undefined" &&
  typeof PerformanceObserver !== "undefined"
) {
  try {
    const supportedTypes = (PerformanceObserver as unknown as {
      supportedEntryTypes?: ReadonlyArray<string>;
    }).supportedEntryTypes;

    if (supportedTypes && supportedTypes.includes("longtask")) {
      const rawBudget = Number(process.env.NEXT_PUBLIC_DEV_LONG_TASK_BUDGET_MS);
      const budgetMs = Number.isFinite(rawBudget) && rawBudget > 0 ? rawBudget : 50;

      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.duration <= budgetMs) continue;
          const route =
            typeof window !== "undefined" && window.location
              ? window.location.pathname
              : "(unknown)";
          // eslint-disable-next-line no-console
          console.warn(
            `[OBS-6][long-task][budget-exceeded] ${Math.round(entry.duration)}ms at +${Math.round(
              entry.startTime,
            )}ms (budget ${budgetMs}ms) route=${route}`,
          );
        }
      });

      observer.observe({ type: "longtask", buffered: true });
      // eslint-disable-next-line no-console
      console.info(`[OBS-6][long-task][profiler-started] budget=${budgetMs}ms`);
    }
  } catch {
    // Profiler is best-effort dev tooling; never let it break the page.
  }
}

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
