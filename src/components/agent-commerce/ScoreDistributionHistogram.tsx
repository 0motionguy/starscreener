import type { AgentCommerceItem } from "@/lib/agent-commerce/types";
import { getScoreSample } from "./displayData";

interface ScoreDistributionHistogramProps {
  items: AgentCommerceItem[];
  displayItemCount?: number;
}

export function ScoreDistributionHistogram({
  items,
  displayItemCount,
}: ScoreDistributionHistogramProps) {
  const buckets = new Array<number>(10).fill(0);
  const sample = getScoreSample(items);
  const itemCountLabel = displayItemCount ?? sample.length;

  for (const score of sample) {
    const s = Math.max(0, Math.min(100, score));
    const idx = Math.min(9, Math.floor(s / 10));
    buckets[idx] += 1;
  }

  const max = Math.max(...buckets, 1);
  const sorted = [...sample].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="ph-eyebrow">{"// 06"}</span>
        <span className="ph-title">Score distribution - {itemCountLabel} items</span>
        <span className="ph-meta">bucket = composite 0-10</span>
      </div>
      <div className="score-dist" style={scoreDistStyle}>
        {buckets.map((count, i) => {
          const pct = (count / max) * 100;
          const intensity = Math.min(1, count / max);
          const useAccent = intensity > 0.4;
          return (
            <div
              key={i}
              className={`bar b${i + 1}`}
              title={`${i * 10}-${i * 10 + 10}: ${count} items`}
              style={{
                height: `${Math.max(2, pct)}%`,
                background: useAccent ? "var(--accent)" : "var(--surface-3)",
                opacity: useAccent ? 0.4 + intensity * 0.6 : 1,
                borderRadius: "1px 1px 0 0",
              }}
            />
          );
        })}
      </div>
      <div className="row between" style={legendStyle}>
        <span>0</span>
        <span>median {median.toFixed(1)}</span>
        <span>100</span>
      </div>
    </div>
  );
}

const scoreDistStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(10, 1fr)",
  gap: 2,
  padding: "14px 16px",
  height: 80,
  alignItems: "end",
};

const legendStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  padding: "0 16px 14px",
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  color: "var(--fg-faint)",
};
