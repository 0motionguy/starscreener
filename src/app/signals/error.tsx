"use client";

import { useEffect } from "react";

export default function SignalsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[/signals error.tsx]", error);
  }, [error]);

  return (
    <main style={{ padding: 24, fontFamily: "monospace", fontSize: 12 }}>
      <h1 style={{ color: "#ff4d4d" }}>signals render error (diagnostic)</h1>
      <pre style={{ whiteSpace: "pre-wrap", color: "#ff8458" }}>
        {error.message || "(no message)"}
      </pre>
      {error.digest ? (
        <p style={{ color: "#84909b" }}>
          digest: <code>{error.digest}</code>
        </p>
      ) : null}
      <pre
        style={{
          whiteSpace: "pre-wrap",
          color: "#84909b",
          fontSize: 11,
          marginTop: 16,
          maxHeight: 500,
          overflow: "auto",
        }}
      >
        {error.stack ?? "(no stack)"}
      </pre>
      <button onClick={reset} style={{ marginTop: 12 }}>
        retry
      </button>
    </main>
  );
}
