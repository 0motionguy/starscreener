"use client";

// Global error boundary — catches errors thrown in the root layout itself
// (above the regular error.tsx). Must include its own <html> + <body>.
// Also satisfies @sentry/nextjs build-time check for a global-error.tsx.

import { useEffect } from "react";
import Link from "next/link";

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    if (typeof window !== "undefined") {
      const w = window as unknown as {
        Sentry?: { captureException?: (e: unknown) => void };
      };
      try {
        w.Sentry?.captureException?.(error);
      } catch {
        /* swallow */
      }
    }
  }, [error]);

  return (
    <html lang="en" className="dark" data-theme="orange">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          background: "#08090a",
          color: "#eef0f2",
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
          display: "grid",
          placeItems: "center",
          padding: 24,
        }}
      >
        <div
          style={{
            maxWidth: 520,
            width: "100%",
            background: "#101418",
            border: "1px solid #222a32",
            borderRadius: 2,
            padding: 24,
          }}
        >
          <h1
            style={{
              fontSize: 22,
              fontWeight: 700,
              margin: "0 0 12px",
              color: "#ffffff",
              letterSpacing: 0,
            }}
          >
            <span style={{ color: "#ff4d4d" }}>●</span> Application error
          </h1>
          <p style={{ fontSize: 13, lineHeight: 1.55, color: "#b8c0c8", margin: "0 0 14px" }}>
            The root layout itself crashed before any UI could render. Try refreshing — most root errors
            are transient and clear after a clean reload.
          </p>
          {error.digest && (
            <p
              style={{
                fontFamily:
                  'ui-monospace, "Geist Mono", "JetBrains Mono", "Cascadia Code", Menlo, monospace',
                fontSize: 11,
                color: "#909caa",
                margin: "0 0 14px",
                letterSpacing: "0.04em",
              }}
            >
              error digest · {error.digest}
            </p>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={() => reset()}
              style={{
                padding: "8px 14px",
                background: "#ff6b35",
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
                background: "#151a20",
                color: "#eef0f2",
                border: "1px solid #1a2026",
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
      </body>
    </html>
  );
}
