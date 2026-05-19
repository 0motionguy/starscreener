// ConfidenceChipsBlock — high/med/low extraction confidence counts.
// Maps `extracted.confidence` to chip variant; "none" rows count as low.

import type { FundingSignal } from "@/lib/funding/types";

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
  const b: Bucket = { high: 0, med: 0, low: 0, total: signals.length };
  for (const s of signals) {
    const c = s.extracted?.confidence ?? "none";
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
        <span className="ph-eyebrow">▌ EXTRACTION</span>
        <span className="ph-title">Confidence · {b.total} signals</span>
      </div>
      <div
        style={{
          padding: "14px 16px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <div className="row between">
          <span className="confidence-chip high">High · {b.high}</span>
          <span
            className="mono"
            style={{ color: "var(--fg-faint)", fontSize: 10.5 }}
          >
            exact match domain or name
          </span>
        </div>
        <div className="row between">
          <span className="confidence-chip med">Medium · {b.med}</span>
          <span
            className="mono"
            style={{ color: "var(--fg-faint)", fontSize: 10.5 }}
          >
            alias or fuzzy match
          </span>
        </div>
        <div className="row between">
          <span className="confidence-chip low">Low · {b.low}</span>
          <span
            className="mono"
            style={{ color: "var(--fg-faint)", fontSize: 10.5 }}
          >
            needs manual review
          </span>
        </div>
      </div>
    </div>
  );
}
