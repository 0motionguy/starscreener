// FundingSourcePills — pills showing each funding feed up + per-source count.
// Reads sourcePlatform counts from signals; the universe of "expected" sources
// is wider than what raw `sourcePlatform` exposes (which is normalized into a
// few buckets), so we layer human-friendly publication names on top.

import type { FundingSignal } from "@/lib/funding/types";

interface FundingSourcePillsProps {
  signals: FundingSignal[];
  totalSources?: number;
  liveSources?: number;
}

interface PillEntry {
  label: string;
  count: number;
  /** Substring patterns used to count from headline/sourceUrl when the */
  /** sourcePlatform field collapses several publishers into "newsapi". */
  match: readonly string[];
}

const PUBLISHERS: readonly Omit<PillEntry, "count">[] = [
  { label: "TechCrunch", match: ["techcrunch.com", "tc-", "techcrunch"] },
  { label: "VentureBeat", match: ["venturebeat.com", "venturebeat"] },
  { label: "Sifted", match: ["sifted.eu", "sifted"] },
  { label: "Crunchbase", match: ["crunchbase.com", "crunchbase"] },
  { label: "SEC Form D", match: ["sec.gov", "edgar", "form d", "form-d"] },
  { label: "The Information", match: ["theinformation.com"] },
  { label: "Newcomer", match: ["newcomer.co", "newcomer"] },
  { label: "TC · AI", match: ["techcrunch.com/category/artificial-intelligence"] },
  { label: "VB · AI", match: ["venturebeat.com/ai"] },
  { label: "EU-Startups", match: ["eu-startups.com"] },
  { label: "Tech.eu", match: ["tech.eu"] },
  { label: "Silicon Canals", match: ["siliconcanals.com"] },
  { label: "YC", match: ["ycombinator.com", "y combinator"] },
  { label: "Twitter / X", match: ["twitter.com", "x.com", "t.co/"] },
];

function buildPills(signals: FundingSignal[]): PillEntry[] {
  // Pre-build a per-signal blob (headline + source url) for matching.
  const blobs = signals.map((s) =>
    `${s.headline} ${s.sourceUrl} ${s.sourcePlatform}`.toLowerCase(),
  );
  return PUBLISHERS.map((pub) => {
    let count = 0;
    for (const blob of blobs) {
      if (pub.match.some((m) => blob.includes(m))) {
        count += 1;
      }
    }
    return { ...pub, count };
  });
}

export function FundingSourcePills({
  signals,
  totalSources = 38,
  liveSources = 35,
}: FundingSourcePillsProps) {
  const pills = buildPills(signals)
    .filter((p) => p.count > 0)
    .sort((a, b) => b.count - a.count);

  return (
    <div className="panel fade-up" style={{ marginBottom: 14 }}>
      <div className="panel-head">
        <span className="ph-eyebrow">▌ SOURCES</span>
        <span className="ph-title">
          {liveSources} of {totalSources} up · 7d
        </span>
      </div>
      <div className="source-pills">
        {pills.length === 0 ? (
          <span style={{ color: "var(--fg-faint)", fontSize: 11, padding: "0 4px" }}>
            No publisher attribution available in this window.
          </span>
        ) : (
          pills.map((p) => (
            <span key={p.label} className="source-pill on">
              {p.label} <span className="ct">{p.count}</span>
            </span>
          ))
        )}
      </div>
    </div>
  );
}
