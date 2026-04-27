"use client";

import { useEffect } from "react";
import Link from "next/link";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function RootError({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error("[app/error] unhandled render error", error);
  }, [error]);

  return (
    <div className="v2-frame py-16">
      <div
        className="v2-card"
        style={{
          padding: 32,
          borderColor: "var(--v2-sig-red)",
          maxWidth: 640,
        }}
      >
        <p className="v2-mono mb-3" style={{ color: "var(--v2-sig-red)" }}>
          <span aria-hidden>{"// "}</span>
          ERROR · RUNTIME · STACK OVERFLOW
        </p>

        <h1 className="v2-h2 mb-3" style={{ color: "var(--v2-ink-000)" }}>
          Something broke while rendering this surface.
        </h1>

        <p
          className="mb-5"
          style={{ color: "var(--v2-ink-200)", fontSize: 14, lineHeight: 1.55 }}
        >
          The firehose is still running — this is a client-side render fault,
          not stale data. Retry the view; the homepage usually survives.
        </p>

        {error.digest && (
          <p
            className="v2-mono-tight mb-5"
            style={{ color: "var(--v2-ink-300)" }}
          >
            digest{" "}
            <span style={{ color: "var(--v2-ink-200)" }}>{error.digest}</span>
          </p>
        )}

        <div className="flex flex-wrap items-center" style={{ gap: 8 }}>
          <button
            type="button"
            onClick={reset}
            className="v2-btn v2-btn-primary"
          >
            <span aria-hidden>{"→ "}</span>
            retry render
          </button>
          <Link href="/" className="v2-btn v2-btn-ghost">
            <span aria-hidden>{"← "}</span>
            back to terminal
          </Link>
        </div>
      </div>
    </div>
  );
}
