// FundingTape — `.fund-tape` ticker with last 10-12 rounds.
// shell.css `.lane` provides the auto-scroll loop animation; we render two
// copies of the same items back-to-back so the marquee never shows a seam.

import type { FundingSignal } from "@/lib/funding/types";

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

const ROUND_LABEL: Record<string, string> = {
  "pre-seed": "Pre-seed",
  seed: "Seed",
  "series-a": "Series A",
  "series-b": "Series B",
  "series-c": "Series C",
  "series-d-plus": "Series D+",
  growth: "Growth",
  ipo: "IPO",
  acquisition: "Acquired",
  undisclosed: "Undisclosed",
};

function relAge(publishedAt: string): string {
  const ms = Date.now() - Date.parse(publishedAt);
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function buildItems(signals: FundingSignal[], limit: number): TapeItem[] {
  return signals
    .filter((s) => s.extracted && s.extracted.amount && s.extracted.amount > 0)
    .slice(0, limit)
    .map((s) => ({
      company: s.extracted?.companyName ?? "Unknown",
      round: s.extracted ? (ROUND_LABEL[s.extracted.roundType] ?? "Round") : "Round",
      amountDisplay: s.extracted?.amountDisplay ?? "$—",
      ago: relAge(s.publishedAt),
    }));
}

export function FundingTape({ signals, limit = 12 }: FundingTapeProps) {
  const items = buildItems(signals, limit);
  if (items.length === 0) return null;

  // Render the items twice so shell.css `.lane` (CSS marquee) loops seamlessly.
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
