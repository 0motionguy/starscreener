import type {
  ConsensusExternalSource,
} from "@/lib/consensus-trending";

interface SourceMeta {
  key: ConsensusExternalSource;
  name: string;
  shortLabel: string;
  cssDot: string;
  weight: number;
}

const SOURCES: SourceMeta[] = [
  { key: "gh", name: "GITHUB", shortLabel: "GH", cssDot: "sd-gh", weight: 0.20 },
  { key: "hf", name: "HUGGING FACE", shortLabel: "HF", cssDot: "sd-hf", weight: 0.18 },
  { key: "hn", name: "HACKER NEWS", shortLabel: "HN", cssDot: "sd-hn", weight: 0.16 },
  { key: "x", name: "X / TWITTER", shortLabel: "X", cssDot: "sd-x", weight: 0.14 },
  { key: "r", name: "REDDIT", shortLabel: "R", cssDot: "sd-r", weight: 0.10 },
  { key: "pdh", name: "PRODUCT HUNT", shortLabel: "PH", cssDot: "sd-pdh", weight: 0.08 },
  { key: "dev", name: "DEV.TO", shortLabel: "DV", cssDot: "sd-dev", weight: 0.08 },
  { key: "bs", name: "BLUESKY", shortLabel: "BS", cssDot: "sd-bs", weight: 0.06 },
];

interface SourceStripProps {
  stats: Record<ConsensusExternalSource, { count: number; rows: number }>;
}

export function SourceStrip({ stats }: SourceStripProps) {
  // Find the max count to normalize bar widths against the most-active source.
  const maxCount = Math.max(1, ...SOURCES.map((s) => stats[s.key]?.count ?? 0));

  return (
    <div className="src-strip">
      {SOURCES.map((s, i) => {
        const stat = stats[s.key] ?? { count: 0, rows: 0 };
        const fillPct = Math.round((stat.count / maxCount) * 100);
        const isAccent = i % 2 === 0;
        return (
          <div className="src-cell" key={s.key}>
            <div className="src-top">
              <span className={`sd ${s.cssDot}`}>{s.shortLabel}</span>
              <span className="nm">{s.name}</span>
              <span className="wt">w{Math.round(s.weight * 100)}</span>
            </div>
            <div className="ct">{stat.count.toLocaleString()}</div>
            <div className="meta">
              tracked
              <span style={{ marginLeft: 6, color: "var(--ink-500, #6b7280)" }}>
                {stat.rows} rows
              </span>
            </div>
            <span className="bar">
              <i
                style={{
                  width: `${fillPct}%`,
                  background: isAccent ? "var(--acc, #ff6b35)" : "var(--sig-amber, #ffb547)",
                }}
              />
            </span>
          </div>
        );
      })}
    </div>
  );
}
