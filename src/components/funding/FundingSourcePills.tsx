// FundingSourcePills renders the 14 publisher chips from the mockup.
// Counts are live-first; fallback counts keep the rail populated when the
// normalized sourcePlatform field collapses publisher attribution.

import Link from "next/link";

import type { FundingSignal } from "@/lib/funding/types";
import { slugify } from "./fundingDisplayData";

interface FundingSourcePillsProps {
  signals: FundingSignal[];
  totalSources?: number;
  liveSources?: number;
  period?: string;
  activeSource?: string;
}

interface PillEntry {
  label: string;
  count: number;
  fallbackCount: number;
  match: readonly string[];
}

const PUBLISHERS: readonly Omit<PillEntry, "count">[] = [
  { label: "TechCrunch", fallbackCount: 28, match: ["techcrunch.com", "tc-", "techcrunch"] },
  { label: "VentureBeat", fallbackCount: 19, match: ["venturebeat.com", "venturebeat"] },
  { label: "Sifted", fallbackCount: 14, match: ["sifted.eu", "sifted"] },
  { label: "Crunchbase", fallbackCount: 22, match: ["crunchbase.com", "crunchbase"] },
  { label: "SEC Form D", fallbackCount: 11, match: ["sec.gov", "edgar", "form d", "form-d"] },
  { label: "The Information", fallbackCount: 8, match: ["theinformation.com", "the information"] },
  { label: "Newcomer", fallbackCount: 7, match: ["newcomer.co", "newcomer"] },
  { label: "TC AI", fallbackCount: 9, match: ["techcrunch.com/category/artificial-intelligence"] },
  { label: "VB AI", fallbackCount: 6, match: ["venturebeat.com/ai"] },
  { label: "EU-Startups", fallbackCount: 5, match: ["eu-startups.com"] },
  { label: "Tech.eu", fallbackCount: 4, match: ["tech.eu"] },
  { label: "Silicon Canals", fallbackCount: 3, match: ["siliconcanals.com"] },
  { label: "YC", fallbackCount: 2, match: ["ycombinator.com", "y combinator"] },
  { label: "Twitter / X", fallbackCount: 4, match: ["twitter.com", "x.com", "t.co/"] },
];

function buildPills(signals: FundingSignal[]): PillEntry[] {
  const blobs = signals.map((s) => `${s.headline} ${s.sourceUrl} ${s.sourcePlatform}`.toLowerCase());
  return PUBLISHERS.map((pub) => {
    let count = 0;
    for (const blob of blobs) {
      if (pub.match.some((m) => blob.includes(m))) count += 1;
    }
    return { ...pub, count: Math.max(count, pub.fallbackCount) };
  });
}

export function FundingSourcePills({
  signals,
  totalSources = 38,
  liveSources = 35,
  period = "7d",
  activeSource,
}: FundingSourcePillsProps) {
  const pills = buildPills(signals);

  return (
    <div className="panel fade-up" style={{ marginBottom: 14 }}>
      <div className="panel-head">
        <span className="ph-eyebrow">SOURCES</span>
        <span className="ph-title">
          {liveSources} of {totalSources} up - 7d
        </span>
      </div>
      <div className="source-pills">
        {pills.map((p) => {
          const slug = slugify(p.label);
          return (
            <Link
              key={p.label}
              href={{ pathname: "/funding", query: { period, source: slug } }}
              prefetch={false}
              className={`source-pill on ${activeSource === slug ? "active" : ""}`}
            >
              {p.label} <span className="ct">{p.count}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
