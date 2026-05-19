"use client";

// global-error.tsx replaces the entire layout chain when the root
// layout itself throws. Next 15 requires it to render its own
// <html> and <body> tags - layout.tsx is NOT in the tree at this
// point. See https://nextjs.org/docs/app/api-reference/file-conventions/error#global-errorjs.

import { useEffect } from "react";
import { ErrorPanel } from "@/components/ui/ErrorPanel";

export default function GlobalError({
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
  }, [error]);

  return (
    <html lang="en">
      <body>
        <ErrorPanel error={error} reset={reset} />
      </body>
    </html>
  );
}
