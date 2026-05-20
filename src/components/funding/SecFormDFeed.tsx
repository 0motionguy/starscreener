// SecFormDFeed renders the 6-row SEC Form D rail.

import type { FundingSignal } from "@/lib/funding/types";
import { ensureSecFundingSignals, relAge } from "./fundingDisplayData";

interface SecFormDFeedProps {
  signals: FundingSignal[];
  thisWeekCount: number;
  limit?: number;
}

export function SecFormDFeed({
  signals,
  thisWeekCount,
  limit = 6,
}: SecFormDFeedProps) {
  const rows = ensureSecFundingSignals(signals, limit);
  const displayCount = Math.max(thisWeekCount, rows.length);

  return (
    <div className="panel fade-up" style={{ marginBottom: 14 }}>
      <div className="panel-head">
        <span className="ph-eyebrow">SEC FORM D</span>
        <span className="ph-title">Just filed - {displayCount} this week</span>
        <span className="ph-meta">EDGAR - 1m polling</span>
      </div>
      <div className="sec-feed">
        {rows.map((s) => (
          <div className="sec-row" key={s.id}>
            <span className="co">{s.extracted?.companyName ?? "Tracked filing"}</span>
            <span className="amt">{s.extracted?.amountDisplay ?? "$0"}</span>
            <span className="when">{relAge(s.publishedAt)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
