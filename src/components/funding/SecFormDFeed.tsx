// SecFormDFeed — `.sec-feed` recent SEC Form D rows.
// Reads SEC-only signals from getSecFormDSignals(). When the slug is empty
// (cold start), falls back gracefully to the main funding pool filtered by
// sourcePlatform / headline match.

import type { FundingSignal } from "@/lib/funding/types";

interface SecFormDFeedProps {
  signals: FundingSignal[];
  thisWeekCount: number;
  limit?: number;
}

function relAge(publishedAt: string): string {
  const ms = Date.now() - Date.parse(publishedAt);
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  if (hours < 48) return "today";
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export function SecFormDFeed({
  signals,
  thisWeekCount,
  limit = 6,
}: SecFormDFeedProps) {
  const rows = signals
    .filter((s) => s.extracted?.amount && s.extracted.amount > 0)
    .slice(0, limit);

  return (
    <div className="panel fade-up" style={{ marginBottom: 14 }}>
      <div className="panel-head">
        <span className="ph-eyebrow">▌ SEC FORM D</span>
        <span className="ph-title">
          Just filed · {thisWeekCount} this week
        </span>
        <span className="ph-meta">EDGAR · 1m polling</span>
      </div>
      <div className="sec-feed">
        {rows.length === 0 ? (
          <div style={{ padding: 12, color: "var(--fg-faint)", fontSize: 11 }}>
            No SEC filings parsed in this window.
          </div>
        ) : (
          rows.map((s) => (
            <div className="sec-row" key={s.id}>
              <span className="co">{s.extracted?.companyName ?? "—"}</span>
              <span className="amt">{s.extracted?.amountDisplay ?? "—"}</span>
              <span className="when">{relAge(s.publishedAt)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
