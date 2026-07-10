// RepoFundingStrip — funding events matched to this repo's company,
// rendered as a compact strip on the repo detail page.
//
// The funding→repo matcher (src/lib/funding/repo-events.ts:
// getFundingEventsForRepo — domain > alias > company-name > fuzzy) was
// fully built and consumed NOWHERE in the UI until Wave 7. This is its
// first surface: when the matcher resolves at least one event, show the
// latest round inline and link into /funding for the full radar.
//
// Server Component — the matcher is memoized sync file-backed, same
// pattern as the other repo-detail strips. Renders null for the (vast)
// majority of repos with no matched funding.

import Link from "next/link";

import type { RepoFundingEvent } from "@/lib/funding/repo-events";

interface RepoFundingStripProps {
  events: RepoFundingEvent[];
}

function roundLabel(roundType: string | undefined): string {
  if (!roundType || roundType === "undisclosed") return "";
  return ` ${roundType.replace(/-/g, " ").toUpperCase()}`;
}

export function RepoFundingStrip({ events }: RepoFundingStripProps) {
  if (events.length === 0) return null;
  const latest = events[0];
  const x = latest.signal.extracted;
  if (!x) return null;

  const more = events.length - 1;

  return (
    <section
      className="repo-funding-strip"
      aria-label="Funding signals for this repo"
      style={{
        display: "flex",
        alignItems: "baseline",
        flexWrap: "wrap",
        gap: 8,
        padding: "10px 14px",
        margin: "0.5rem 0",
        border: "1px solid var(--v4-line-100, rgba(255,255,255,0.1))",
        borderLeft: "3px solid var(--v4-money, #ffc85e)",
        background: "var(--v4-bg-100, transparent)",
        fontSize: 13,
      }}
    >
      <span aria-hidden="true">💰</span>
      <span style={{ color: "var(--v4-ink-100)" }}>
        {x.companyName} raised{" "}
        <strong>{x.amountDisplay}</strong>
        {roundLabel(x.roundType)}
        {more > 0 ? ` (+${more} more event${more === 1 ? "" : "s"})` : ""}
      </span>
      <span
        style={{
          fontFamily: "var(--v4-mono, ui-monospace, monospace)",
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "var(--v4-ink-400)",
        }}
      >
        match: {latest.match.reason.replace(/_/g, " ")} (
        {Math.round(latest.match.confidence * 100)}%)
      </span>
      <Link
        href="/funding"
        style={{
          marginLeft: "auto",
          color: "var(--v4-acc)",
          textDecoration: "underline",
          fontSize: 12,
        }}
      >
        Funding radar →
      </Link>
    </section>
  );
}

export default RepoFundingStrip;
