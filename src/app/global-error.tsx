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
    if (typeof window !== "undefined") {
      const sentry = (
        window as unknown as {
          Sentry?: { captureException: (e: Error) => void };
        }
      ).Sentry;
      if (sentry?.captureException) sentry.captureException(error);
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
