// InvestorChips renders the 12 investor chips from the funding mockup.

import type { FundingSignal } from "@/lib/funding/types";
import { KNOWN_INVESTORS, normalizeInvestorName } from "@/lib/funding/known-investors";
import { DEFAULT_INVESTORS } from "./fundingDisplayData";

interface InvestorChipsProps {
  signals: FundingSignal[];
  limit?: number;
}

interface Chip {
  name: string;
  initial: string;
  count: number;
}

const DISPLAY_NAME: Record<string, string> = {
  "Andreessen Horowitz": "a16z",
  "Sequoia Capital": "Sequoia",
  "Lightspeed Venture Partners": "Lightspeed",
  "Google Ventures": "GV",
  "Khosla Ventures": "Khosla",
  "Tiger Global": "Tiger Global",
};

function canonicalize(raw: string): string {
  const norm = normalizeInvestorName(raw);
  if (!norm) return raw.trim();
  for (const inv of KNOWN_INVESTORS) {
    for (const alias of inv.aliases) {
      const a = normalizeInvestorName(alias);
      if (!a) continue;
      if (a === norm || a.includes(norm) || norm.includes(a)) {
        return DISPLAY_NAME[inv.name] ?? inv.name;
      }
    }
  }
  return raw.trim();
}

function buildChips(signals: FundingSignal[], limit: number): Chip[] {
  const counts = new Map<string, number>();
  for (const s of signals) {
    for (const raw of s.extracted?.investors ?? []) {
      const name = canonicalize(raw);
      if (!name) continue;
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  for (const fallback of DEFAULT_INVESTORS) {
    counts.set(fallback.name, Math.max(counts.get(fallback.name) ?? 0, fallback.count));
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([name, count]) => ({
      name,
      initial: name.trim().charAt(0).toUpperCase() || ".",
      count,
    }));
}

export function InvestorChips({ signals, limit = 12 }: InvestorChipsProps) {
  const chips = buildChips(signals, limit);

  return (
    <div className="panel fade-up" style={{ marginBottom: 14 }}>
      <div className="panel-head">
        <span className="ph-eyebrow">INVESTORS</span>
        <span className="ph-title">Top {chips.length} - 7d</span>
      </div>
      <div className="investors">
        {chips.map((c) => (
          <span key={c.name} className="investor-chip">
            <span className="av">{c.initial}</span>
            {c.name}
            <span className="ct">{c.count}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
