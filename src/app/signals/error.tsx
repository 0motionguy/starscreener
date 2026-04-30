"use client";

// TEMP diagnostic error boundary so we can see the actual /signals
// render error on Vercel preview. Next.js auto-captures errors thrown
// from this route's server tree and routes them here. Renders the
// message + digest as plain HTML — visible to curl. Remove once the
// underlying issue is fixed.

import { useEffect } from "react";

export default function SignalsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Also log to console so it lands in Vercel runtime logs.
    console.error("[signals/error.tsx] caught render error:", error);
  }, [error]);

  return (
    <main style={{ padding: 24, fontFamily: "monospace", fontSize: 12 }}>
      <h1 style={{ color: "#ff4d4d", marginBottom: 16 }}>
        SignalsPage render error (diagnostic)
      </h1>
      <div style={{ marginBottom: 8 }}>
        <strong>message:</strong>
      </div>
      <pre
        style={{
          whiteSpace: "pre-wrap",
          color: "#ff8458",
          background: "#0b0d0f",
          padding: 12,
          border: "1px solid #2f3942",
        }}
      >
        {error.message || "(no message)"}
      </pre>
      {error.digest ? (
        <div style={{ marginTop: 12, color: "#84909b" }}>
          digest: <code>{error.digest}</code>
        </div>
      ) : null}
      <pre
        style={{
          whiteSpace: "pre-wrap",
          color: "#84909b",
          fontSize: 11,
          marginTop: 16,
          maxHeight: 400,
          overflow: "auto",
        }}
      >
        {error.stack ?? "(no stack)"}
      </pre>
      <button
        onClick={reset}
        style={{
          marginTop: 16,
          padding: "6px 12px",
          background: "#ff6b35",
          color: "#1a0a04",
          border: "none",
          fontFamily: "monospace",
          cursor: "pointer",
        }}
      >
        retry
      </button>
    </main>
  );
}
