// FundingTape renders the `.fund-tape` ticker with exactly 12 visible rounds.
// It uses live funding signals first, then seeded funding rows when the
// current accessor window is thin.

import type { FundingSignal } from "@/lib/funding/types";
import { ensureFundingSignals, relAge, ROUND_LABEL } from "./fundingDisplayData";

interface FundingTapeProps {
  signals: FundingSignal[];
  limit?: number;
}

interface TapeItem {
  company: string;
  round: string;
  amountDisplay: string;
  ago: string;
}

function buildItems(signals: FundingSignal[], limit: number): TapeItem[] {
  return ensureFundingSignals(signals, limit)
    .filter((s) => s.extracted && s.extracted.amount && s.extracted.amount > 0)
    .slice(0, limit)
    .map((s) => ({
      company: s.extracted?.companyName ?? "Unknown",
      round: s.extracted ? (ROUND_LABEL[s.extracted.roundType] ?? "Round") : "Round",
      amountDisplay: s.extracted?.amountDisplay ?? "$0",
      ago: relAge(s.publishedAt),
    }));
}

export function FundingTape({ signals, limit = 12 }: FundingTapeProps) {
  const items = buildItems(signals, limit);
  const doubled = [...items, ...items];

  return (
    <div className="fund-tape" aria-label="Live funding tape">
      <div className="lane">
        {doubled.map((it, i) => (
          <span className="ft-item" key={`${it.company}-${i}`}>
            <span className="co">{it.company}</span>
            <span className="rnd">{it.round}</span>
            <span className="amt">{it.amountDisplay}</span>
            <span className="ago">{it.ago}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
