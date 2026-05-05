"use client";

// Sentry's recommended top-level error handler for Next.js App Router.
// Catches React rendering errors that escape per-route error.tsx boundaries
// (e.g. errors in the root layout). Without this file, those crashes do not
// reach Sentry — they just show the default Next.js fallback.
//
// Sentry 10 explicitly nags for this on every build until it exists; see
// https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/#errorjs.

import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { useEffect } from "react";
import { ROUTES } from "@/lib/constants";
import { cn } from "@/lib/utils";

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
        <div className="mx-auto w-full max-w-[760px] px-4 py-16 md:px-6 md:py-24">
          <div
            className="v2-card overflow-hidden"
            style={{ background: "rgba(255, 77, 77, 0.06)", borderColor: "var(--v2-sig-red)" }}
          >
            <div className="v2-term-bar">
              <span aria-hidden className="flex items-center gap-1.5">
                <span className="block h-1.5 w-1.5 rounded-full" style={{ background: "var(--v2-sig-red)" }} />
                <span className="block h-1.5 w-1.5 rounded-full" style={{ background: "var(--v2-line-200)" }} />
                <span className="block h-1.5 w-1.5 rounded-full" style={{ background: "var(--v2-line-200)" }} />
              </span>
              <span className="flex-1 truncate" style={{ color: "var(--v2-sig-red)" }}>
                {"// ERROR 500 - APPLICATION FAILURE"}
              </span>
            </div>

            <div className="p-6 md:p-8">
              <p className={cn("v2-mono text-[11px] tracking-wide")} style={{ color: "var(--v2-ink-400)" }}>
                TERMINAL STATUS: CRITICAL ERROR
              </p>
              <h1
                className="mt-2"
                style={{
                  fontFamily: "var(--font-geist), Inter, sans-serif",
                  fontSize: "clamp(26px, 4vw, 36px)",
                  fontWeight: 510,
                  letterSpacing: "-0.022em",
                  color: "var(--v2-ink-000)",
                  lineHeight: 1.1,
                }}
              >
                The app failed to render this request.
              </h1>

              <p className="mt-3 leading-relaxed" style={{ fontSize: 14, color: "var(--v2-ink-300)" }}>
                This is an internal error. The incident was captured, and you can recover by reloading or returning
                to a stable surface.
              </p>

              {error.digest && (
                <p className="v2-mono mt-4 text-[11px]" style={{ color: "var(--v2-ink-400)" }}>
                  {"// DIGEST: "}
                  <span style={{ color: "var(--v2-ink-300)" }}>{error.digest}</span>
                </p>
              )}

              <div className="mt-5 flex flex-wrap gap-2">
                <button type="button" onClick={() => window.location.reload()} className={cn("v2-btn v2-btn-primary")}>
                  Reload
                </button>
                <Link href={ROUTES.HOME} className={cn("v2-btn v2-btn-ghost")}>
                  Go to Home
                </Link>
              </div>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
