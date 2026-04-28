"use client";

// Sentry's recommended top-level error handler for Next.js App Router.
// Catches React rendering errors that escape per-route error.tsx boundaries
// (e.g. errors in the root layout). Without this file, those crashes do not
// reach Sentry — they just show the default Next.js fallback.
//
// Sentry 10 explicitly nags for this on every build until it exists; see
// https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/#errorjs.

import * as Sentry from "@sentry/nextjs";
import NextError from "next/error";
import { useEffect } from "react";

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body>
        <NextError statusCode={0} />
      </body>
    </html>
  );
}
