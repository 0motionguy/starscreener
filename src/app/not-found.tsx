import Link from "next/link";
import { ROUTES } from "@/lib/constants";

export default function NotFound() {
  return (
    <div
      className="v2-frame"
      style={{
        minHeight: "70vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 24,
      }}
    >
      <p className="v2-mono" style={{ color: "var(--v2-ink-300)" }}>
        <span aria-hidden>{"// "}</span>
        NO SIGNAL · 404 · PATH NOT IN REGISTRY
      </p>

      <p
        className="v2-display"
        style={{
          fontSize: "clamp(96px, 18vw, 240px)",
          color: "var(--v2-ink-500)",
          letterSpacing: "var(--v2-tracking-display)",
          fontWeight: 300,
          lineHeight: 1,
          userSelect: "none",
        }}
      >
        404
      </p>

      <pre
        aria-hidden
        className="v2-ascii"
        style={{
          color: "var(--v2-ink-400)",
          fontSize: 11,
          lineHeight: 1.2,
          margin: 0,
          textAlign: "center",
          opacity: 0.6,
        }}
      >
{`░ ░ ░  ░  ░░░ ░ ░    ░ ░ ░░ ░  ░░░░ ░ ░
  ░░ ░ ░ ░░  ░ ░  ░ ░ ░░ ░ ░ ░░ ░░ ░  ░
░  ░  ░░ ░░  ░ ░ ░░  ░  ░ ░░ ░  ░  ░ ░░░`}
      </pre>

      <p
        style={{
          color: "var(--v2-ink-200)",
          fontSize: 14,
          textAlign: "center",
          maxWidth: 480,
        }}
      >
        The path you requested does not resolve in the trendingrepo registry.
        Either it was never indexed or it has been retired.
      </p>

      <Link href={ROUTES.HOME} className="v2-btn v2-btn-primary">
        <span aria-hidden>{"→ "}</span>
        back to terminal
      </Link>
    </div>
  );
}
