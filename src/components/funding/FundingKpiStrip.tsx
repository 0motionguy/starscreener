// FundingKpiStrip — 5-cell `.fund-kpi` strip.
// Cells: rounds 7d, capital raised, top round, repos matched, high-confidence.

import type { FundingSignal, FundingStats } from "@/lib/funding/types";

interface FundingKpiStripProps {
  stats: FundingStats;
  thisWeekSignals: FundingSignal[];
  reposMatched: number;
  totalRounds: number;
}

function compactCurrency(amount: number | null): string {
  if (amount === null || !Number.isFinite(amount) || amount <= 0) return "—";
  if (amount >= 1_000_000_000) {
    return `$${(amount / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}B`;
  }
  if (amount >= 1_000_000) {
    return `$${Math.round(amount / 1_000_000)}M`;
  }
  if (amount >= 1_000) {
    return `$${Math.round(amount / 1_000)}K`;
  }
  return `$${amount}`;
}

const ROUND_DISPLAY: Record<string, string> = {
  "pre-seed": "Pre-seed",
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

export function FundingKpiStrip({
  stats,
  thisWeekSignals,
  reposMatched,
  totalRounds,
}: FundingKpiStripProps) {
  const weekCapital = thisWeekSignals.reduce(
    (acc, s) => acc + (s.extracted?.amount ?? 0),
    0,
  );

  const topRound = stats.topRound;
  const topAmount = topRound?.extracted?.amountDisplay ?? "—";
  const topName = topRound?.extracted?.companyName ?? "—";
  const topType = topRound?.extracted ? ROUND_DISPLAY[topRound.extracted.roundType] ?? "" : "";

  const highConfidence = thisWeekSignals.filter(
    (s) => s.extracted?.confidence === "high",
  ).length;
  const highConfidencePct =
    totalRounds > 0 ? Math.round((highConfidence / totalRounds) * 100) : 0;

  const matchedPct =
    totalRounds > 0 ? Math.round((reposMatched / totalRounds) * 100) : 0;

  return (
    <div className="fund-kpi fade-up">
      <div className="cell">
        <div className="l">Rounds 7d</div>
        <div className="v" data-counter data-target={totalRounds}>
          {totalRounds.toLocaleString()}
        </div>
        <div className="d up">▲ {thisWeekSignals.length.toLocaleString()} this window</div>
      </div>
      <div className="cell">
        <div className="l">Capital raised</div>
        <div className="v acc">{compactCurrency(weekCapital)}</div>
        <div className="d">across {thisWeekSignals.length} rounds</div>
      </div>
      <div className="cell">
        <div className="l">Top round</div>
        <div className="v acc">{topAmount}</div>
        <div className="d">
          {topName} {topType ? `· ${topType}` : ""}
        </div>
      </div>
      <div className="cell">
        <div className="l">Repos matched</div>
        <div className="v up" data-counter data-target={reposMatched}>
          {reposMatched.toLocaleString()}
        </div>
        <div className="d">
          of {totalRounds.toLocaleString()} rounds ({matchedPct}%)
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
