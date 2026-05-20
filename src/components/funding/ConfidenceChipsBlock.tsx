// ConfidenceChipsBlock renders high / medium / low extraction confidence rows.

import type { FundingSignal } from "@/lib/funding/types";
import { ensureFundingSignals } from "./fundingDisplayData";

interface ConfidenceChipsBlockProps {
  signals: FundingSignal[];
}

interface Bucket {
  high: number;
  med: number;
  low: number;
  total: number;
}

function bucketByConfidence(signals: FundingSignal[]): Bucket {
  const visibleSignals = ensureFundingSignals(signals, 12);
  const b: Bucket = { high: 0, med: 0, low: 0, total: visibleSignals.length };
  for (const s of visibleSignals) {
    const c = s.extracted?.confidence ?? "low";
    if (c === "high") b.high += 1;
    else if (c === "medium") b.med += 1;
    else b.low += 1;
  }
  return b;
}

export function ConfidenceChipsBlock({ signals }: ConfidenceChipsBlockProps) {
  const b = bucketByConfidence(signals);

  return (
    <div className="panel fade-up">
      <div className="panel-head">
        <span className="ph-eyebrow">EXTRACTION</span>
        <span className="ph-title">Confidence - {b.total} signals</span>
      </div>
      <div className="confidence-stack">
        <div className="row between">
          <span className="confidence-chip high">High - {b.high}</span>
          <span className="mono confidence-note">exact match domain or name</span>
        </div>
        <div className="row between">
          <span className="confidence-chip med">Medium - {b.med}</span>
          <span className="mono confidence-note">alias or fuzzy match</span>
        </div>
        <div className="row between">
          <span className="confidence-chip low">Low - {b.low}</span>
          <span className="mono confidence-note">needs manual review</span>
        </div>
      </div>
    </div>
  );
}
