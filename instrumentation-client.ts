import * as Sentry from "@sentry/nextjs";

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;
const DEV_LONG_TASK_BUDGET_MS = Number(process.env.NEXT_PUBLIC_DEV_LONG_TASK_BUDGET_MS ?? "50");

let longTaskProfilerStarted = false;

function initDevLongTaskProfiler() {
  if (process.env.NODE_ENV !== "development") return;
  if (typeof window === "undefined") return;
  if (longTaskProfilerStarted) return;
  if (typeof PerformanceObserver === "undefined") return;

  longTaskProfilerStarted = true;

  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.entryType !== "longtask") continue;
        if (entry.duration <= DEV_LONG_TASK_BUDGET_MS) continue;

        const start = Math.round(entry.startTime);
        const duration = Math.round(entry.duration);

        console.warn(
          `[OBS-6][long-task][budget-exceeded] ${duration}ms at +${start}ms (budget ${DEV_LONG_TASK_BUDGET_MS}ms)`,
        );
      }
    });

    observer.observe({ type: "longtask", buffered: true });

    console.info(`[OBS-6][long-task][profiler-started] budget=${DEV_LONG_TASK_BUDGET_MS}ms`);
  } catch {
    // Keep startup safe on unsupported/browser-restricted contexts.
  }
}

initDevLongTaskProfiler();

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
