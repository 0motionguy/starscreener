"use client";

// Root-level error boundary. Catches unhandled throws in any route
// segment that doesn't have its own error.tsx. Must be a client
// component; Next.js injects `error` + `reset` props so we can show
// the cause and let the user retry without a full page refresh.
// Renders ErrorPanel for branded refresh / home / report-bug actions.

import { useEffect } from "react";
import { ErrorPanel } from "@/components/ui/ErrorPanel";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Sentry capture via dynamic import (NOT a window.Sentry probe).
    // instrumentation-client.ts lazy-loads Sentry via requestIdleCallback
    // (up to 2500ms), so early-render errors fire BEFORE window.Sentry is
    // populated. Dynamic import guarantees the SDK is available when the
    // error fires. Race condition caught by Codex P2/P3 audit.
    if (typeof window !== "undefined") {
      void import("@sentry/nextjs")
        .then(({ captureException }) => {
          captureException(error, {
            tags: { route: window.location.pathname },
          });
        })
        .catch(() => {
          // Best-effort — UI still renders if Sentry fails to load.
        });
    }
    console.error("[app/error] unhandled render error", error);
  }, [error]);

  return <ErrorPanel error={error} reset={reset} />;
}
