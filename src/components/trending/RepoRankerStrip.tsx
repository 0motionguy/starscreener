// RepoRankerStrip — three-way sub-tab (Top / Gainer / Trend) that re-ranks
// the trending repo table. Mirrors the `.period-switcher` shape in
// TrendingTable.tsx so the styling stays consistent without new tokens.

import Link from "next/link";

interface RepoRankerStripProps {
  activeRank: "top" | "gainer" | "trend";
  category: string;
  window: string;
  language: string;
  sort: string;
}

const RANKERS = [
  { id: "top", label: "Top", hint: "Composite (stars × mentions × freshness)" },
  { id: "gainer", label: "Gainer", hint: "OSSInsight 24h velocity" },
  { id: "trend", label: "Trend", hint: "TrendShift / OSSInsight 30d" },
] as const;

export function RepoRankerStrip({
  activeRank,
  category,
  window: timeWindow,
  language,
  sort,
}: RepoRankerStripProps) {
  return (
    <div className="repo-ranker-strip" role="tablist" aria-label="Repo ranker">
      <span className="ranker-label">Ranker:</span>
      {RANKERS.map((r) => (
        <Link
          key={r.id}
          href={{
            query: cleanQuery({
              cat: category,
              window: timeWindow,
              lang: language,
              sort,
              rank: r.id,
            }),
          }}
          className={`ranker-tab${r.id === activeRank ? " active" : ""}`}
          role="tab"
          aria-selected={r.id === activeRank}
          prefetch={false}
        >
          {r.label}
          <span className="ranker-hint">{r.hint}</span>
        </Link>
      ))}
    </div>
  );
}

function cleanQuery(input: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(input).filter(([, v]) => v !== "all" && v !== "" && v !== "top"),
  );
}
