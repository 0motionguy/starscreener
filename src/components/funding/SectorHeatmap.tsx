// SectorHeatmap renders the 6-tile funding heatmap from the mockup.
// Each tile links into a URL-addressable sector drilldown.

import Link from "next/link";

import type { FundingSignal } from "@/lib/funding/types";
import {
  compactCurrency,
  ensureFundingSignals,
  slugify,
} from "./fundingDisplayData";

interface SectorBucket {
  name: string;
  tags: readonly string[];
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
    tags: ["coding", "developer", "developer-tools", "code"],
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

interface AggregatedSector {
  name: string;
  totalUsd: number;
  count: number;
}

function aggregate(signals: FundingSignal[]): AggregatedSector[] {
  const visibleSignals = ensureFundingSignals(signals, 12);
  return SECTORS.map((bucket) => {
    let totalUsd = 0;
    let count = 0;
    for (const s of visibleSignals) {
      const ex = s.extracted;
      if (!ex) continue;
      const blob = `${s.headline} ${s.description}`.toLowerCase();
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
  period?: string;
  activeSector?: string;
}

export function SectorHeatmap({
  signals,
  period = "7d",
  activeSector,
}: SectorHeatmapProps) {
  const buckets = aggregate(signals);
  const peakUsd = Math.max(0, ...buckets.map((b) => b.totalUsd));

  return (
    <div className="panel fade-up" style={{ marginBottom: 14 }}>
      <div className="panel-head">
        <span className="ph-eyebrow">{"// 02"}</span>
        <span className="ph-title">Sector heatmap</span>
        <span className="ph-meta">6 sectors - area = $ raised - tile click drills in</span>
      </div>
      <div style={{ padding: 12 }}>
        <div className="sector-heat">
          {buckets.map((b) => {
            const slug = slugify(b.name);
            return (
              <Link
                key={b.name}
                href={{ pathname: "/funding", query: { period, sector: slug } }}
                prefetch={false}
                className={`sector-tile ${tierClass(b.totalUsd, peakUsd)} ${
                  activeSector === slug ? "on" : ""
                }`}
              >
                <span className="sec-name">{b.name}</span>
                <span className="sec-amt">{compactCurrency(b.totalUsd)}</span>
                <span className="sec-ct">
                  {b.count} round{b.count === 1 ? "" : "s"}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
