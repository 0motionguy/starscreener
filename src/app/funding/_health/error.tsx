"use client";

// /funding/_health — error boundary.
//
// Diagnostic page; if rendering itself errors we still want to surface the
// digest so the operator can grep logs. Lighter than the public-funding
// error UI — no Sentry capture, no marketing copy.

import { useEffect } from "react";
import Link from "next/link";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function FundingHealthError({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error("[funding/_health] render failed:", error);
  }, [error]);

  return (
    <div
      className="v2-mono"
      style={{
        maxWidth: 720,
        margin: "0 auto",
        padding: "64px 24px",
        textAlign: "center",
        fontSize: 13,
      }}
    >
      <p
        style={{
          fontSize: 11,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          color: "var(--v2-sig-red, #f87171)",
          marginBottom: 12,
        }}
      >
        {"// ERROR · FUNDING · _HEALTH"}
      </p>
      <h1
        style={{
          fontFamily: "var(--font-geist), Inter, sans-serif",
          fontSize: 24,
          fontWeight: 510,
          letterSpacing: "-0.022em",
          marginBottom: 12,
          color: "var(--v2-ink-000, #fff)",
        }}
      >
        Health dashboard failed to render.
      </h1>
      <p
        style={{
          color: "var(--v2-ink-300, rgba(255,255,255,0.75))",
          marginBottom: 16,
        }}
      >
        The diagnostic page itself errored. The four funding slugs in Redis
        may still be healthy — check /funding to confirm.
      </p>
      {error.digest ? (
        <p
          style={{
            fontSize: 11,
            color: "var(--v2-ink-400, rgba(255,255,255,0.55))",
            marginBottom: 16,
          }}
        >
          {"// DIGEST: "}
          <span style={{ color: "var(--v2-ink-300, rgba(255,255,255,0.75))" }}>
            {error.digest}
          </span>
        </p>
      ) : null}
      <div style={{ display: "flex", justifyContent: "center", gap: 12 }}>
        <button
          type="button"
          onClick={reset}
          className="v2-btn v2-btn-primary"
        >
          TRY AGAIN
        </button>
        <Link href="/funding" className="v2-btn v2-btn-ghost">
          BACK TO /FUNDING
        </Link>
      </div>
    </div>
  );
}
