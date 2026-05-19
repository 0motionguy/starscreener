"use client";

// Route-level error boundary — catches errors thrown inside any
// src/app/<route>/page.tsx that wasn't caught by a more specific boundary.
// Renders inside the shell layout so the sidebar + topbar still show.

import { useEffect } from "react";
import Link from "next/link";

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function RouteErrorBoundary({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    // Surface to PostHog/Sentry if either is wired — silent fail otherwise.
    if (typeof window !== "undefined") {
      const w = window as unknown as {
        Sentry?: { captureException?: (e: unknown) => void };
        posthog?: { capture?: (n: string, p: unknown) => void };
      };
      try {
        w.Sentry?.captureException?.(error);
      } catch {
        /* swallow — error boundary must not throw */
      }
      try {
        w.posthog?.capture?.("route_error", { digest: error.digest });
      } catch {
        /* swallow */
      }
    }
  }, [error]);

  return (
    <div style={{ padding: "60px 22px", maxWidth: 720, margin: "0 auto" }}>
      <div className="card">
        <div className="card-head">
          <h1 className="card-title">
            <span style={{ color: "var(--down)" }}>●</span>{" "}
            <b>This page hit a snag</b>
          </h1>
        </div>
        <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <p style={{ color: "var(--fg-muted)", fontSize: 13, lineHeight: 1.55, margin: 0 }}>
            Something blew up while rendering this surface. The data spine is alive — we can probably get
            you back on track.
          </p>
          {error.digest && (
            <p
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                color: "var(--fg-faint)",
                margin: 0,
                letterSpacing: "0.04em",
              }}
            >
              error digest · {error.digest}
            </p>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            <button
              type="button"
              onClick={() => reset()}
              style={{
                padding: "8px 14px",
                background: "var(--accent)",
                color: "#0a0a0a",
                fontWeight: 600,
                fontSize: 12,
                border: 0,
                borderRadius: 4,
                cursor: "pointer",
              }}
            >
              Try again
            </button>
            <Link
              href="/"
              style={{
                padding: "8px 14px",
                background: "var(--surface-2)",
                color: "var(--fg)",
                border: "1px solid var(--border-subtle)",
                fontWeight: 600,
                fontSize: 12,
                borderRadius: 4,
                textDecoration: "none",
              }}
            >
              Go home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
