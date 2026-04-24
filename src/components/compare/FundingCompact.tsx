"use client";

// Funding mini-module. Surfaces the most recent matched funding event
// (announcedAt desc) with its amount + round-type label. `extracted` is
// only populated when the pipeline's regex extractor succeeded; fall back
// to headline otherwise.

import { Banknote } from "lucide-react";
import type { RepoFundingEvent } from "@/lib/funding/repo-events";

interface FundingCompactProps {
  funding: RepoFundingEvent[];
}

const ROUND_LABEL: Record<string, string> = {
  "pre-seed": "Pre-Seed",
  seed: "Seed",
  "series-a": "Series A",
  "series-b": "Series B",
  "series-c": "Series C",
  "series-d-plus": "Series D+",
  growth: "Growth",
  ipo: "IPO",
  acquisition: "Acquisition",
  undisclosed: "Undisclosed",
};

export function FundingCompact({ funding }: FundingCompactProps) {
  const latest = funding[0] ?? null;
  const extracted = latest?.signal.extracted ?? null;
  const amount = extracted?.amountDisplay ?? null;
  const round = extracted?.roundType
    ? ROUND_LABEL[extracted.roundType] ?? extracted.roundType
    : null;

  return (
    <div className="space-y-1.5 min-w-0">
      <div className="flex items-center gap-1.5">
        <Banknote size={12} className="text-accent-amber shrink-0" />
        <span className="text-xs font-mono uppercase tracking-wider text-text-tertiary">
          Funding
        </span>
      </div>
      {latest && (amount || round) ? (
        <div className="flex items-baseline gap-1.5 min-w-0">
          {amount && (
            <span className="text-sm font-mono font-semibold text-text-primary tabular-nums">
              {amount}
            </span>
          )}
          {round && (
            <span className="text-[10px] font-mono uppercase tracking-wider text-text-tertiary shrink-0">
              {round}
            </span>
          )}
        </div>
      ) : (
        <p className="text-xs text-text-tertiary">—</p>
      )}
    </div>
  );
}
