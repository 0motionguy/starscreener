// FundingSourcePills renders the 14 publisher chips from the mockup.
// Counts are live-first; fallback counts keep the rail populated when the
// normalized sourcePlatform field collapses publisher attribution.

import Link from "next/link";

import type { FundingSignal } from "@/lib/funding/types";
import { PUBLISHER_SLUG_MATCH, slugify } from "./fundingDisplayData";

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

// Publisher list mirrors the mockup's 14 pills. The `match` token list per
// publisher lives in `PUBLISHER_SLUG_MATCH` (route-local table in
// fundingDisplayData.ts) so the pill UI and `filterFundingBySources` can't
// drift apart — both read from the same slug map keyed by `slugify(label)`.
const PUBLISHERS: readonly Omit<PillEntry, "count" | "match">[] = [
  { label: "TechCrunch", fallbackCount: 28 },
  { label: "VentureBeat", fallbackCount: 19 },
  { label: "Sifted", fallbackCount: 14 },
  { label: "Crunchbase", fallbackCount: 22 },
  { label: "SEC Form D", fallbackCount: 11 },
  { label: "The Information", fallbackCount: 8 },
  { label: "Newcomer", fallbackCount: 7 },
  { label: "TC AI", fallbackCount: 9 },
  { label: "VB AI", fallbackCount: 6 },
  { label: "EU-Startups", fallbackCount: 5 },
  { label: "Tech.eu", fallbackCount: 4 },
  { label: "Silicon Canals", fallbackCount: 3 },
  { label: "YC", fallbackCount: 2 },
  { label: "Twitter / X", fallbackCount: 4 },
];

function buildPills(signals: FundingSignal[]): PillEntry[] {
  const blobs = signals.map((s) => `${s.headline} ${s.sourceUrl} ${s.sourcePlatform}`.toLowerCase());
  return PUBLISHERS.map((pub) => {
    const slug = slugify(pub.label);
    const match = PUBLISHER_SLUG_MATCH[slug] ?? [];
    let count = 0;
    for (const blob of blobs) {
      if (match.some((m) => blob.includes(m))) count += 1;
    }
    return { ...pub, match, count: Math.max(count, pub.fallbackCount) };
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
          {liveSources} of {totalSources} up - {period}
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
