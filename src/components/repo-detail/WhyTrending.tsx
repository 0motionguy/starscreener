// WhyTrending — renders 1–3 human-readable "why this repo is moving" reasons
// directly above RepoSignalSnapshot on the repo profile page.
//
// Server component. Consumes the `HumanReason[]` produced by
// `getRepoReasons()` and renders a V4 strip; returns `null` when
// no reasons are available (the common case for repos that didn't trigger
// any detector during the last pipeline recompute).

import type { JSX } from "react";
import type { HumanReason, ReasonSeverity } from "@/lib/repo-reasons";

interface WhyTrendingProps {
  reasons: HumanReason[];
}

const SEVERITY_LABEL: Record<ReasonSeverity, string> = {
  critical: "Main driver",
  strong: "Strong signal",
  info: "Context",
};

// Long-form copy surfaced via `title` on the severity dot so sighted
// hover users get the same explanation screen-reader users get via
// aria-label. Keep in sync with the rubric we show in CrossSignalBreakdown
// so a repo's "why" and its scoring rubric tell the same story.
const SEVERITY_EXPLANATION: Record<ReasonSeverity, string> = {
  critical:
    "Main driver — the most important reason this repo is moving right now.",
  strong: "Strong signal — a notable contributor to the trend.",
  info: "Context — supporting but secondary information.",
};

function dotColor(severity: ReasonSeverity): string {
  if (severity === "critical") return "var(--v4-acc)";
  if (severity === "strong") return "var(--v4-money)";
  return "var(--v4-ink-400)";
}

export function WhyTrending({ reasons }: WhyTrendingProps): JSX.Element | null {
  if (!reasons || reasons.length === 0) return null;

  return (
    <section
      aria-label="Why this repo is trending"
      style={{
        border: "1px solid var(--v4-line-200)",
        background: "var(--v4-bg-025)",
        borderRadius: 2,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "10px 12px",
          borderBottom: "1px solid var(--v4-line-200)",
          background: "var(--v4-bg-050)",
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontFamily: "var(--font-geist-mono), monospace",
        }}
      >
        <span
          className="flex-1 truncate"
          style={{
            fontSize: 11,
            color: "var(--v4-ink-200)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          {"// WHY TRENDING"}
        </span>
        <span
          className="shrink-0"
          style={{
            padding: "1px 6px",
            border: "1px solid var(--v4-line-200)",
            borderRadius: 2,
            fontSize: 10,
            color: "var(--v4-ink-300)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          {reasons.length} SIGNAL{reasons.length === 1 ? "" : "S"}
        </span>
      </div>

      <ul className="grid grid-cols-1 lg:grid-cols-3">
        {reasons.map((reason, i) => (
          <li
            key={reason.code}
            className="flex items-start gap-2.5 p-3 sm:p-4"
            style={{
              borderRight:
                i < reasons.length - 1
                  ? "1px solid var(--v4-line-200)"
                  : "none",
            }}
          >
            <span
              className="mt-1.5 size-2 shrink-0 rounded-full"
              style={{ background: dotColor(reason.severity) }}
              aria-label={SEVERITY_LABEL[reason.severity]}
              title={SEVERITY_EXPLANATION[reason.severity]}
              role="img"
            />
            <div className="min-w-0 flex-1">
              <p
                className="leading-snug"
                style={{
                  fontFamily: "var(--font-geist), Inter, sans-serif",
                  fontSize: 13,
                  color: "var(--v4-ink-100)",
                }}
              >
                {reason.headline}
              </p>
              {reason.detail ? (
                <p
                  className="mt-1 line-clamp-2 leading-snug"
                  style={{ fontSize: 11, color: "var(--v4-ink-300)" }}
                  title={reason.detail}
                >
                  {reason.detail}
                </p>
              ) : null}
              {reason.sourceHint ? (
                <p
                  className="mt-1.5"
                  style={{
                    fontFamily: "var(--font-geist-mono), monospace",
                    fontSize: 9,
                    color: "var(--v4-ink-400)",
                  }}
                >
                  {`// VIA ${reason.sourceHint.toUpperCase()}`}
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default WhyTrending;
