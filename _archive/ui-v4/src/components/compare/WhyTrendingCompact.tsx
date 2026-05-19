"use client";

// Compact "why is this moving" list. Reuses HumanReason — shows up to 2
// reasons (critical > strong > info), one-line each. Empty state is a
// muted placeholder so the column height stays consistent across repos.

import { Zap } from "lucide-react";
import type { HumanReason, ReasonSeverity } from "@/lib/repo-reasons";

interface WhyTrendingCompactProps {
  reasons: HumanReason[];
}

const SEVERITY_RANK: Record<ReasonSeverity, number> = {
  critical: 3,
  strong: 2,
  info: 1,
};

const SEVERITY_DOT: Record<ReasonSeverity, string> = {
  critical: "bg-accent-red",
  strong: "bg-accent-amber",
  info: "bg-accent-blue",
};

export function WhyTrendingCompact({ reasons }: WhyTrendingCompactProps) {
  const top = [...reasons]
    .sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity])
    .slice(0, 2);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Zap size={12} className="text-accent-amber shrink-0" />
        <span className="text-xs font-mono uppercase tracking-wider text-text-tertiary">
          Why Trending
        </span>
      </div>
      {top.length === 0 ? (
        <p className="text-xs text-text-tertiary italic">No signals yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {top.map((r, i) => (
            <li key={`${r.code}-${i}`} className="flex items-start gap-1.5">
              <span
                className={`size-1.5 rounded-full shrink-0 mt-1.5 ${SEVERITY_DOT[r.severity]}`}
                aria-hidden="true"
              />
              <span className="text-xs text-text-secondary leading-snug">
                {r.headline}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
