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

/** Tailwind color for the leading severity dot — uses existing tokens only. */
function dotColorClass(severity: ReasonSeverity): string {
  if (severity === "critical") return "bg-brand";
  if (severity === "strong") return "bg-up";
  return "bg-text-tertiary";
}

export function WhyTrending({ reasons }: WhyTrendingProps): JSX.Element | null {
  if (!reasons || reasons.length === 0) return null;

  return (
    <section
      aria-label="Why this repo is trending"
      className="rounded-card border border-border-primary bg-bg-primary p-3 sm:p-4"
    >
      <header className="flex items-center justify-between gap-3">
        <span className="font-mono text-[10px] uppercase tracking-wider text-text-tertiary">
          Why trending
        </span>
        <span className="font-mono text-[10px] uppercase tracking-wider text-text-tertiary">
          {reasons.length} signal{reasons.length === 1 ? "" : "s"}
        </span>
      </header>

      <ul className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
        {reasons.map((reason) => (
          <li
            key={reason.code}
            className="flex items-start gap-2.5 border-l-2 border-border-primary pl-3 lg:border-l-2"
          >
            <span
              className={`mt-1.5 size-2 shrink-0 rounded-full ${dotColorClass(reason.severity)}`}
              aria-label={SEVERITY_LABEL[reason.severity]}
              role="img"
            />
            <div className="min-w-0 flex-1">
              <p className="font-mono text-[12px] leading-snug text-text-primary">
                {reason.headline}
              </p>
              {reason.detail ? (
                <p
                  className="mt-1 line-clamp-2 text-[11px] leading-snug text-text-tertiary"
                  title={reason.detail}
                >
                  {reason.detail}
                </p>
              ) : null}
              {reason.sourceHint ? (
                <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-text-tertiary">
                  via {reason.sourceHint}
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
