// InvestorChips — top 12 investors with `.av` initial avatars.
// Derives counts from signals[].extracted.investors[]. Known-investor canonical
// names take precedence over raw extracted strings — falls back to raw name
// when no canonical match is found.

import type { FundingSignal } from "@/lib/funding/types";
import { KNOWN_INVESTORS, normalizeInvestorName } from "@/lib/funding/known-investors";

interface InvestorChipsProps {
  signals: FundingSignal[];
  limit?: number;
}

interface Chip {
  name: string;
  initial: string;
  count: number;
}

function canonicalize(raw: string): string {
  const norm = normalizeInvestorName(raw);
  if (!norm) return raw.trim();
  for (const inv of KNOWN_INVESTORS) {
    for (const alias of inv.aliases) {
      const a = normalizeInvestorName(alias);
      if (!a) continue;
      if (a === norm || a.includes(norm) || norm.includes(a)) {
        return inv.name;
      }
    }
  }
  return raw.trim();
}

function buildChips(signals: FundingSignal[], limit: number): Chip[] {
  const counts = new Map<string, number>();
  for (const s of signals) {
    const investors = s.extracted?.investors ?? [];
    for (const raw of investors) {
      const name = canonicalize(raw);
      if (!name) continue;
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, count]) => ({
      name,
      initial: name.trim().charAt(0).toUpperCase() || "·",
      count,
    }));
}

export function InvestorChips({ signals, limit = 12 }: InvestorChipsProps) {
  const chips = buildChips(signals, limit);

  return (
    <div className="panel fade-up" style={{ marginBottom: 14 }}>
      <div className="panel-head">
        <span className="ph-eyebrow">▌ INVESTORS</span>
        <span className="ph-title">Top {chips.length} · 7d</span>
      </div>
      <div className="investors">
        {chips.length === 0 ? (
          <span style={{ color: "var(--fg-faint)", fontSize: 11, padding: "0 4px" }}>
            No structured investor data in this window yet.
          </span>
        ) : (
          chips.map((c) => (
            <span key={c.name} className="investor-chip">
              <span className="av">{c.initial}</span>
              {c.name}
              <span className="ct">{c.count}</span>
            </span>
          ))
        )}
      </div>
    </div>
  );
}
