// SectorHeatmap — 6 `.sector-tile` cells inside `.sector-heat`.
// Tier classes (tier-hot, tier-warm, plain) color by dollar volume.
//
// Sectors: AI Infra, Foundation Models, Coding Agents, Vector DBs,
// Agent Frameworks, Dev Tools. Each tile derives $ raised + round count
// from signal tags / heuristic matches on the company name + headline.

import type { FundingSignal } from "@/lib/funding/types";

interface SectorBucket {
  name: string;
  /** Tag patterns matched against signal.tags[]. Lowercase. */
  tags: readonly string[];
  /** Substrings matched against headline + description (lowercase). */
  keywords: readonly string[];
}

const SECTORS: readonly SectorBucket[] = [
  {
    name: "AI Infra",
    tags: ["ai", "infra", "infrastructure", "cloud", "gpu"],
    keywords: ["infrastructure", "gpu", "inference", "serverless", "compute cloud"],
  },
  {
    name: "Foundation Models",
    tags: ["foundation-model", "llm", "model"],
    keywords: ["foundation model", "open-weight", "llm", "language model"],
  },
  {
    name: "Coding Agents",
    tags: ["coding", "developer", "code"],
    keywords: ["code editor", "coding agent", "code completion", "developer copilot", "ai code"],
  },
  {
    name: "Vector DBs",
    tags: ["vector", "database", "db"],
    keywords: ["vector database", "vector db", "embedding", "retrieval"],
  },
  {
    name: "Agent Frameworks",
    tags: ["agent", "framework"],
    keywords: ["agent framework", "ai agent", "multi-agent", "agentic", "autonomous"],
  },
  {
    name: "Dev Tools",
    tags: ["devtools", "developer-tools"],
    keywords: ["dev tool", "developer tool", "frontend", "deployment", "ci/cd", "build"],
  },
];

function compactCurrency(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) return "$0";
  if (amount >= 1_000_000_000) {
    return `$${(amount / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}B`;
  }
  if (amount >= 1_000_000) {
    return `$${Math.round(amount / 1_000_000)}M`;
  }
  return `$${Math.round(amount / 1_000)}K`;
}

interface AggregatedSector {
  name: string;
  totalUsd: number;
  count: number;
}

function aggregate(signals: FundingSignal[]): AggregatedSector[] {
  return SECTORS.map((bucket) => {
    let totalUsd = 0;
    let count = 0;
    for (const s of signals) {
      const ex = s.extracted;
      if (!ex) continue;
      const blob = (s.headline + " " + s.description).toLowerCase();
      const tagHit = s.tags.some((t) => bucket.tags.includes(t.toLowerCase()));
      const kwHit = bucket.keywords.some((kw) => blob.includes(kw));
      if (!tagHit && !kwHit) continue;
      totalUsd += ex.amount ?? 0;
      count += 1;
    }
    return { name: bucket.name, totalUsd, count };
  });
}

function tierClass(totalUsd: number, peakUsd: number): string {
  if (peakUsd <= 0) return "";
  const ratio = totalUsd / peakUsd;
  if (ratio >= 0.5) return "tier-hot";
  if (ratio >= 0.2) return "tier-warm";
  return "";
}

interface SectorHeatmapProps {
  signals: FundingSignal[];
}

export function SectorHeatmap({ signals }: SectorHeatmapProps) {
  const buckets = aggregate(signals);
  const peakUsd = Math.max(0, ...buckets.map((b) => b.totalUsd));

  return (
    <div className="panel fade-up" style={{ marginBottom: 14 }}>
      <div className="panel-head">
        <span className="ph-eyebrow">{"// 02"}</span>
        <span className="ph-title">Sector heatmap</span>
        <span className="ph-meta">{SECTORS.length} sectors · area = $ raised</span>
      </div>
      <div style={{ padding: 12 }}>
        <div className="sector-heat">
          {buckets.map((b) => (
            <div key={b.name} className={`sector-tile ${tierClass(b.totalUsd, peakUsd)}`}>
              <span className="sec-name">{b.name}</span>
              <span className="sec-amt">{compactCurrency(b.totalUsd)}</span>
              <span className="sec-ct">
                {b.count} round{b.count === 1 ? "" : "s"}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
