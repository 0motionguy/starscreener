// FundingKpiStrip — 5-cell funding KPI strip. Every cell derives from the
// EFFECTIVE window's real signals (post source-filter, post window-widen);
// the first cell discloses when a quiet selection was auto-widened. No cell
// reads a different window than its label claims.

import type { FundingSignal, FundingStats } from "@/lib/funding/types";
import {
  compactCurrency,
  ensureFundingSignals,
  ROUND_LABEL,
} from "./fundingDisplayData";

interface FundingKpiStripProps {
  stats: FundingStats;
  /** Signals in the EFFECTIVE window (already source-filtered + widened). */
  windowSignals: FundingSignal[];
  /** Effective window id the numbers cover, e.g. "7d". */
  periodLabel: string;
  /** The user's selected period when the window was auto-widened, else null. */
  widenedFrom?: string | null;
  reposMatched: number;
  totalRounds: number;
}

export function FundingKpiStrip({
  stats,
  windowSignals,
  periodLabel,
  widenedFrom = null,
  reposMatched,
  totalRounds,
}: FundingKpiStripProps) {
  const visibleSignals = ensureFundingSignals(windowSignals, 12);
  const windowCapital = visibleSignals.reduce(
    (acc, s) => acc + (s.extracted?.amount ?? 0),
    0,
  );
  const topRound =
    [...visibleSignals].sort((a, b) => (b.extracted?.amount ?? 0) - (a.extracted?.amount ?? 0))[0] ??
    stats.topRound;
  const highConfidence = visibleSignals.filter(
    (s) => s.extracted?.confidence === "high",
  ).length;
  const displayRounds = Math.max(totalRounds, visibleSignals.length);
  const highConfidencePct =
    displayRounds > 0 ? Math.round((highConfidence / displayRounds) * 100) : 0;
  // No synthetic floor — repos matched comes straight from the resolver so
  // a quiet upstream isn't laundered into "38 matched" via Math.max.
  const matchedCount = reposMatched;
  const matchedPct =
    displayRounds > 0 ? Math.round((matchedCount / displayRounds) * 100) : 0;

  const topType = topRound?.extracted?.roundType
    ? ROUND_LABEL[topRound.extracted.roundType]
    : "";

  return (
    <div className="fund-kpi fade-up">
      <div className="cell">
        <div className="l">Rounds {periodLabel}</div>
        <div className="v" data-counter data-target={displayRounds}>
          {displayRounds.toLocaleString()}
        </div>
        <div className="d">
          {widenedFrom
            ? `quiet ${widenedFrom} — auto-widened to ${periodLabel}`
            : "structured rounds in window"}
        </div>
      </div>
      <div className="cell">
        <div className="l">Capital raised</div>
        <div className="v acc">{compactCurrency(windowCapital)}</div>
        <div className="d">sum of disclosed · {periodLabel}</div>
      </div>
      <div className="cell">
        <div className="l">Top round</div>
        <div className="v acc">{topRound?.extracted?.amountDisplay ?? "$0"}</div>
        <div className="d">
          {topRound?.extracted?.companyName ?? "Tracked AI round"}
          {topType ? ` - ${topType}` : ""}
        </div>
      </div>
      <div className="cell">
        <div className="l">Repos matched</div>
        <div className="v up" data-counter data-target={matchedCount}>
          {matchedCount.toLocaleString()}
        </div>
        <div className="d">
          of {displayRounds.toLocaleString()} rounds ({matchedPct}%)
        </div>
      </div>
      <div className="cell">
        <div className="l">High-confidence</div>
        <div className="v" data-counter data-target={highConfidence}>
          {highConfidence.toLocaleString()}
        </div>
        <div className="d">{highConfidencePct}% of rounds</div>
      </div>
    </div>
  );
}
