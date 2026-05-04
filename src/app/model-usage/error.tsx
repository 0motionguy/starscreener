"use client";

// Route-segment error boundary for /model-usage.
//
// We deliberately keep this minimal — admin-only surface, internal users,
// raw error text is fine and helpful when something blows up in the
// aggregator pipeline.

import { useEffect } from "react";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ModelUsageError({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error("[model-usage] render error", error);
  }, [error]);

  return (
    <main style={{ padding: 32, fontFamily: "ui-monospace, monospace", fontSize: 13 }}>
      <h1 style={{ fontSize: 18, marginBottom: 8 }}>Model usage failed to render</h1>
      <pre style={{ whiteSpace: "pre-wrap", color: "var(--color-text-secondary, #8b9097)" }}>
        {error.message}
        {error.digest ? `\n\ndigest: ${error.digest}` : null}
      </pre>
      <button
        type="button"
        onClick={() => reset()}
        style={{
          marginTop: 16,
          padding: "8px 14px",
          border: "1px solid var(--color-border-subtle, #1f2329)",
          background: "transparent",
          color: "var(--color-text-default, #eef0f2)",
          fontFamily: "inherit",
          fontSize: 12,
          textTransform: "uppercase",
          letterSpacing: 0.4,
          cursor: "pointer",
        }}
      >
        Try again
      </button>
    </main>
  );
}
