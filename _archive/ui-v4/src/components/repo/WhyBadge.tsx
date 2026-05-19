// WhyBadge — terse "why it's trending" caption rendered on /top10 rows
// and /repo/[owner]/[name] pages. Server component. No client JS.
//
// The badge is a small inline strip: a coloured signal pip plus the
// 1-2 sentence narrative. Renders nothing when no narrative is
// available so cold caches degrade silently.

import type { JSX } from "react";

import type { WhyNarrative } from "@/lib/why-narrative";

interface WhyBadgeProps {
  narrative: WhyNarrative | null | undefined;
  /**
   * Visual size. `compact` matches the row-density of /top10 leaderboard
   * cells; `full` matches the wider strips on the repo detail page.
   * Default: `compact`.
   */
  variant?: "compact" | "full";
  /** Override className on the outer element (callers rarely need this). */
  className?: string;
}

const SIGNAL_COLOR: Record<WhyNarrative["signal"], string> = {
  release: "var(--v4-acc, #ff5e1a)",
  "stars-velocity": "var(--v4-acc, #ff5e1a)",
  "cross-signal": "var(--v4-money, #22c55e)",
  "weekly-momentum": "var(--v4-amber, #f59e0b)",
  "contributor-surge": "var(--v4-money, #22c55e)",
  "social-buzz": "var(--v4-amber, #f59e0b)",
  organic: "var(--v4-ink-400, #94a3b8)",
};

const SIGNAL_LABEL: Record<WhyNarrative["signal"], string> = {
  release: "RELEASE",
  "stars-velocity": "24H SPIKE",
  "cross-signal": "CROSS-SIGNAL",
  "weekly-momentum": "7D CLIMB",
  "contributor-surge": "ADOPTION",
  "social-buzz": "BUZZ",
  organic: "ORGANIC",
};

export function WhyBadge({
  narrative,
  variant = "compact",
  className,
}: WhyBadgeProps): JSX.Element | null {
  if (!narrative || !narrative.text) return null;

  const color = SIGNAL_COLOR[narrative.signal] ?? SIGNAL_COLOR.organic;
  const label = SIGNAL_LABEL[narrative.signal] ?? SIGNAL_LABEL.organic;

  if (variant === "full") {
    return (
      <section
        className={className}
        aria-label="Why this repo is trending"
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
          padding: "10px 14px",
          borderLeft: `3px solid ${color}`,
          background: "var(--v4-bg-100, transparent)",
          fontSize: 13,
          lineHeight: 1.5,
          color: "var(--v4-ink-100)",
        }}
      >
        <span
          aria-hidden="true"
          style={{
            fontFamily: "var(--v4-mono, ui-monospace, monospace)",
            fontSize: 10,
            letterSpacing: "0.14em",
            color,
            flexShrink: 0,
            marginTop: 2,
          }}
        >
          {`// WHY · ${label}`}
        </span>
        <p style={{ margin: 0 }}>{narrative.text}</p>
      </section>
    );
  }

  return (
    <span
      className={className}
      aria-label="Why this repo is trending"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        marginTop: 4,
        fontSize: 12,
        lineHeight: 1.45,
        color: "var(--v4-ink-200, #cbd5e1)",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: color,
          flexShrink: 0,
        }}
      />
      <span
        style={{
          fontFamily: "var(--v4-mono, ui-monospace, monospace)",
          fontSize: 10,
          letterSpacing: "0.12em",
          color,
          flexShrink: 0,
          textTransform: "uppercase",
        }}
      >
        {label}
      </span>
      <span style={{ color: "var(--v4-ink-200)" }}>{narrative.text}</span>
    </span>
  );
}

export default WhyBadge;
