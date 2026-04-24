// FundingPanel — funding & M&A events for a repo detail page.
//
// Server component. Mirrors the chrome of RepoRevenuePanel (font-mono labels,
// border-border-primary, bg-bg-card, getRelativeTime) but leans into a list
// layout: one event per row, badge + amount + date + investors + source.
//
// Confidence badge: hidden on exact-domain matches (implicit trust). Shown as
// a terse tag for alias / exact-name / fuzzy — keeps the VC/founder skimmer
// aware without cluttering the hero rows.

import type { JSX } from "react";
import { ArrowUpRight, Landmark } from "lucide-react";

import { getRelativeTime } from "@/lib/utils";
import type { RepoFundingEvent } from "@/lib/funding/repo-events";
import type { FundingRoundType } from "@/lib/funding/types";

interface FundingPanelProps {
  events: RepoFundingEvent[];
}

const VISIBLE_EVENTS_LIMIT = 5;
const VISIBLE_INVESTORS_LIMIT = 3;

const ROUND_LABELS: Record<FundingRoundType, string> = {
  "pre-seed": "Pre-seed",
  seed: "Seed",
  "series-a": "Series A",
  "series-b": "Series B",
  "series-c": "Series C",
  "series-d-plus": "Series D+",
  growth: "Growth",
  ipo: "IPO",
  acquisition: "Acquisition",
  undisclosed: "Funding",
};

export function FundingPanel({ events }: FundingPanelProps): JSX.Element | null {
  if (events.length === 0) return null;
  const visible = events.slice(0, VISIBLE_EVENTS_LIMIT);
  const hiddenCount = Math.max(0, events.length - visible.length);

  return (
    <section
      aria-label="Funding & M&A"
      className="rounded-card border border-border-primary bg-bg-card p-4 shadow-card"
    >
      <header className="flex items-center gap-2">
        <Landmark className="size-4 text-text-primary" aria-hidden />
        <h3 className="font-mono text-[11px] uppercase tracking-wider text-text-tertiary">
          Funding & M&A
        </h3>
        <span className="ml-auto font-mono text-[10px] uppercase tracking-wider text-text-tertiary">
          {events.length} {events.length === 1 ? "event" : "events"}
        </span>
      </header>

      <ul className="mt-3 divide-y divide-border-primary/60">
        {visible.map((event) => (
          <FundingRow key={event.signal.id} event={event} />
        ))}
      </ul>

      {hiddenCount > 0 ? (
        <footer className="mt-3 font-mono text-[10px] uppercase tracking-wider text-text-tertiary">
          +{hiddenCount} more
        </footer>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

function FundingRow({ event }: { event: RepoFundingEvent }): JSX.Element {
  const { signal, match } = event;
  const extracted = signal.extracted;
  const roundLabel = extracted
    ? (ROUND_LABELS[extracted.roundType] ?? "Funding")
    : "Funding";
  const amount = extracted?.amountDisplay ?? "Undisclosed";
  const investors = extracted?.investors ?? [];
  const visibleInvestors = investors.slice(0, VISIBLE_INVESTORS_LIMIT);
  const extraInvestors = Math.max(
    0,
    investors.length - visibleInvestors.length,
  );
  const announcedAt = signal.publishedAt;

  const showConfidence =
    match.reason !== "domain" || match.confidence < 0.99;
  const confidenceLabel = formatConfidenceLabel(match);

  return (
    <li className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-3 first:pt-0 last:pb-0">
      <span className="inline-flex shrink-0 items-center rounded-full border border-border-primary bg-bg-muted px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-text-secondary">
        {roundLabel}
      </span>

      <span className="font-mono text-sm font-semibold tabular-nums text-text-primary">
        {amount}
      </span>

      <span className="font-mono text-[11px] text-text-tertiary">
        {getRelativeTime(announcedAt)}
      </span>

      {visibleInvestors.length > 0 ? (
        <span className="font-mono text-[11px] text-text-secondary">
          {visibleInvestors.join(", ")}
          {extraInvestors > 0 ? ` and ${extraInvestors} more` : ""}
        </span>
      ) : null}

      {showConfidence && confidenceLabel ? (
        <span
          className="inline-flex shrink-0 items-center rounded-full border border-border-primary/70 bg-bg-muted/60 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-text-tertiary"
          title={`Matched via ${match.reason.replace(/_/g, " ")} — confidence ${match.confidence.toFixed(2)}`}
        >
          {confidenceLabel}
        </span>
      ) : null}

      <a
        href={signal.sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="ml-auto inline-flex items-center gap-1 font-mono text-[11px] text-text-secondary hover:text-text-primary hover:underline"
      >
        source
        <ArrowUpRight className="size-3" aria-hidden />
      </a>
    </li>
  );
}

function formatConfidenceLabel(match: {
  reason: string;
  confidence: number;
}): string | null {
  switch (match.reason) {
    case "alias":
      return "matched · alias";
    case "company_name_exact":
      return "matched · name";
    case "company_name_fuzzy":
      return `matched · fuzzy ${match.confidence.toFixed(2)}`;
    case "domain":
      return "matched · domain";
    default:
      return null;
  }
}

export default FundingPanel;
