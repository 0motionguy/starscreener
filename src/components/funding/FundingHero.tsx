// FundingHero renders the compact page head and URL-driven period switcher.

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
  /** Window actually rendered when a quiet selection was auto-widened; defaults to `period`. */
  effectivePeriod?: FundingPeriod;
  totalRounds: number;
  liveSources: number;
  totalSources: number;
  fetchedAt: string | null;
}

export function FundingHero({
  period,
  effectivePeriod = period,
  totalRounds,
  liveSources,
  totalSources,
  fetchedAt,
}: FundingHeroProps) {
  // Eyebrow describes the window the numbers actually cover; the segmented
  // switcher below stays on the user's SELECTED period.
  const periodLabel =
    FUNDING_PERIODS.find((p) => p.id === effectivePeriod)?.label.toLowerCase() ?? "7d";
  const widened = effectivePeriod !== period;

  return (
    <div className="fund-head">
      <div>
        <div className="page-eyebrow funding-eyebrow">
          <FreshnessPill source="funding" fetchedAt={fetchedAt} prefix="FUNDING RADAR" />
          <span>
            /funding - {totalRounds.toLocaleString()} rounds - {periodLabel} window
            {widened ? " (auto-widened)" : ""} -{" "}
            {liveSources} of {totalSources} sources up
          </span>
        </div>
        <h1 className="page-title">Capital flows for AI + tech.</h1>
        <p className="page-sub">
          Funding signals extracted from{" "}
          <b>TechCrunch, VentureBeat, Sifted, Crunchbase, SEC Form D, Newcomer, The Information</b>{" "}
          and 28 more. Structured rounds with company / amount / investors / confidence
          scoring. Matched to GitHub repos when found.
        </p>
      </div>
      <div className="segmented" role="group" aria-label="Time window">
        {FUNDING_PERIODS.map((p) => (
          <Link
            key={p.id}
            href={{ pathname: "/funding", query: { period: p.id } }}
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
