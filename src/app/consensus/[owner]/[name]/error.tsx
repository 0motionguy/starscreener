"use client";

import { useEffect } from "react";
import { ErrorPanel } from "@/components/ui/ErrorPanel";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function RouteError({ error, reset }: ErrorProps) {
  useEffect(() => {
    if (typeof window !== "undefined") {
      const sentry = (
        window as unknown as { Sentry?: { captureException: (e: Error) => void } }
      ).Sentry;
      if (sentry?.captureException) sentry.captureException(error);
    }
  }, [error]);

  return <ErrorPanel error={error} reset={reset} variant="default" />;
}
