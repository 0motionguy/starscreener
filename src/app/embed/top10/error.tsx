"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

// Embed surface — kept ultra-minimal so the iframe degrades cleanly.
// No site chrome, no home link (host page provides nav).
export default function EmbedTop10Error({ error, reset }: ErrorProps) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div
      style={{
        padding: 16,
        fontFamily: "ui-monospace, monospace",
        fontSize: 12,
        color: "var(--v2-ink-300)",
      }}
    >
      <p style={{ color: "var(--v2-sig-red)", marginBottom: 8 }}>
        {"// EMBED · ERROR"}
      </p>
      <p style={{ marginBottom: 8 }}>Failed to render embed.</p>
      {error.digest && (
        <p style={{ fontSize: 10, color: "var(--v2-ink-400)" }}>
          {"// DIGEST: "}
          {error.digest}
        </p>
      )}
      <button
        type="button"
        onClick={reset}
        style={{
          marginTop: 8,
          padding: "4px 8px",
          border: "1px solid var(--v2-line-200)",
          background: "transparent",
          color: "var(--v2-ink-000)",
          fontFamily: "inherit",
          fontSize: 11,
          textTransform: "uppercase",
          cursor: "pointer",
        }}
      >
        Retry
      </button>
    </div>
  );
}
