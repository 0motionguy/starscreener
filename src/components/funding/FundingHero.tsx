// FundingHero — page-head with eyebrow + segmented time-window switcher.
// URL contract: ?period=24h|7d|30d|90d|ytd (7d default).
//
// Freshness wires through classifyFreshness("repos", fetchedAt). The funding
// slug isn't a NewsSource enum member; "repos" is the closest match (12h
// budget) since funding-news scrapers also run on the slow ~3h cron.

import Link from "next/link";

import { FreshnessPill } from "@/components/shell/FreshnessPill";

export const FUNDING_PERIODS = [
  { id: "24h", label: "24H" },
  { id: "7d", label: "7D" },
  { id: "30d", label: "30D" },
  { id: "90d", label: "90D" },
  { id: "ytd", label: "YTD" },
] as const;

export type FundingPeriod = (typeof FUNDING_PERIODS)[number]["id"];

interface FundingHeroProps {
  period: FundingPeriod;
  totalRounds: number;
  liveSources: number;
  totalSources: number;
  fetchedAt: string | null;
}

export function FundingHero({
  period,
  totalRounds,
  liveSources,
  totalSources,
  fetchedAt,
}: FundingHeroProps) {
  const periodLabel =
    FUNDING_PERIODS.find((p) => p.id === period)?.label.toLowerCase() ?? "7d";

  return (
    <div className="fund-head">
      <div>
        <div
          className="page-eyebrow"
          style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}
        >
          <FreshnessPill source="repos" fetchedAt={fetchedAt} prefix="FUNDING RADAR" />
          <span style={{ color: "var(--fg-faint)" }}>
            · /funding · {totalRounds.toLocaleString()} rounds · {periodLabel} window
            {" "}· {liveSources} of {totalSources} sources up
          </span>
        </div>
        <h1 className="page-title">Capital flows for AI + tech.</h1>
        <p className="page-sub">
          Funding signals extracted from{" "}
          <b>TechCrunch, VentureBeat, Sifted, Crunchbase, SEC Form D, Newcomer, The Information</b>{" "}
          and 28 more. Structured rounds with company / amount / investors / confidence scoring.
          Matched to GitHub repos when found.
        </p>
      </div>
      <div className="segmented" role="group" aria-label="Time window">
        {FUNDING_PERIODS.map((p) => (
          <Link
            key={p.id}
            href={{ query: { period: p.id } }}
            className={p.id === period ? "on" : ""}
            prefetch={false}
          >
            {p.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
