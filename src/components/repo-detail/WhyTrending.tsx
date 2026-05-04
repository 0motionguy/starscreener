// WhyTrending — renders 1–3 human-readable "why this repo is moving" reasons
// directly above RepoSignalSnapshot on the repo profile page.
//
// Server component. Consumes the `HumanReason[]` produced by
// `getRepoReasons()` and renders a terminal-tone strip; returns `null` when
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
  if (severity === "critical") return "var(--v2-acc)";
  if (severity === "strong") return "var(--v2-sig-green)";
  return "var(--v2-ink-400)";
}

export function WhyTrending({ reasons }: WhyTrendingProps): JSX.Element | null {
  if (!reasons || reasons.length === 0) return null;

  return (
    <section
      aria-label="Why this repo is trending"
      className="v2-card overflow-hidden"
    >
      <div className="v2-term-bar">
        <span aria-hidden className="flex items-center gap-1.5">
          <span className="block h-1.5 w-1.5 rounded-full v2-live-dot" />
          <span
            className="block h-1.5 w-1.5 rounded-full"
            style={{ background: "var(--v2-line-200)" }}
          />
          <span
            className="block h-1.5 w-1.5 rounded-full"
            style={{ background: "var(--v2-line-200)" }}
          />
        </span>
        <span
          className="flex-1 truncate"
          style={{ color: "var(--v2-ink-200)" }}
        >
          {"// WHY TRENDING"}
        </span>
        <span
          className="v2-stat shrink-0"
          style={{ color: "var(--v2-ink-300)" }}
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
                  ? "1px solid var(--v2-line-std)"
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
                  color: "var(--v2-ink-100)",
                }}
              >
                {reason.headline}
              </p>
              {reason.detail ? (
                <p
                  className="mt-1 line-clamp-2 leading-snug"
                  style={{ fontSize: 11, color: "var(--v2-ink-300)" }}
                  title={reason.detail}
                >
                  {reason.detail}
                </p>
              ) : null}
              {reason.sourceHint ? (
                <p
                  className="v2-mono mt-1.5"
                  style={{ fontSize: 9, color: "var(--v2-ink-400)" }}
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
