"use client";

import type { Repo } from "@/lib/types";
import { COMPARE_PALETTE } from "@/components/compare/palette";
import { cn, formatNumber } from "@/lib/utils";

interface CompareStatStripProps {
  repos: Repo[];
  /**
   * Per-repo crossSignalScore mindshare-percent. Computed externally (in
   * the page that owns CompareChart) so this component stays presentational.
   * Order matches `repos`. Key = repo.fullName.
   */
  mindsharePctByFullName?: Record<string, number>;
  className?: string;
}

function shortName(fullName: string): string {
  const idx = fullName.indexOf("/");
  return idx >= 0 ? fullName.slice(idx + 1) : fullName;
}

function formatDelta24h(n: number): string {
  if (n === 0) return "+0";
  const sign = n > 0 ? "+" : "-";
  return `${sign}${formatNumber(Math.abs(n))}`;
}

export function CompareStatStrip({
  repos,
  mindsharePctByFullName,
  className,
}: CompareStatStripProps) {
  if (repos.length === 0) return null;

  return (
    <div
      className={cn(
        "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3",
        className,
      )}
    >
      {repos.map((repo, i) => {
        const dotColor = COMPARE_PALETTE[i] ?? COMPARE_PALETTE[0];
        const short = shortName(repo.fullName);
        const delta = repo.starsDelta24h ?? 0;
        const deltaColor =
          delta > 0
            ? "var(--color-up)"
            : delta < 0
              ? "var(--color-down)"
              : "var(--color-text-tertiary)";
        const ms = mindsharePctByFullName?.[repo.fullName];
        const msLabel =
          typeof ms === "number" && Number.isFinite(ms)
            ? `MS ${ms.toFixed(0)}%`
            : "MS —";
        const rankLabel =
          typeof repo.rank === "number" && repo.rank > 0
            ? `#${repo.rank}`
            : "—";

        return (
          <div
            key={repo.fullName}
            className={cn(
              "flex flex-col gap-1.5 rounded-md border bg-bg-secondary border-border-primary",
              "px-3 py-2.5",
            )}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span
                aria-hidden="true"
                className="inline-block h-2 w-2 rounded-full shrink-0"
                style={{ backgroundColor: dotColor }}
              />
              <span
                title={repo.fullName}
                className="font-mono uppercase tracking-wide text-[11px] text-text-secondary truncate"
              >
                {short}
              </span>
            </div>

            <div className="font-mono font-semibold text-text-primary text-[22px] leading-tight tabular-nums">
              {formatNumber(repo.stars)}
            </div>

            <div className="font-mono uppercase tracking-wide text-[10px] text-text-tertiary flex items-center gap-1.5 flex-wrap">
              <span style={{ color: deltaColor }} className="tabular-nums">
                {formatDelta24h(delta)} 24H
              </span>
              <span aria-hidden="true">&middot;</span>
              <span className="tabular-nums">{rankLabel}</span>
              <span aria-hidden="true">&middot;</span>
              <span className="tabular-nums">{msLabel}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
