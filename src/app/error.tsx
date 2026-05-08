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
    // Sentry capture if available - feature-detect on window so we
    // don't take a hard dep on @sentry/nextjs from this boundary.
    if (typeof window !== "undefined") {
      const sentry = (
        window as unknown as {
          Sentry?: { captureException: (e: Error) => void };
        }
      ).Sentry;
      if (sentry?.captureException) sentry.captureException(error);
    }
    // eslint-disable-next-line no-console
    console.error("[app/error] unhandled render error", error);
  }, [error]);

  return <ErrorPanel error={error} reset={reset} />;
}
