// FundingPanel — funding & M&A events for a repo detail page.
//
// Server component. Mirrors the V4 chrome of MaintainerCard / NpmAdoptionPanel
// (mono header strip, var(--v4-line-200) borders, var(--v4-bg-025) body) but
// leans into a list layout: one event per row, badge + amount + date + investors
// + source.
//
// Confidence badge: hidden on exact-domain matches (implicit trust). Shown as
// a terse tag for alias / exact-name / fuzzy — keeps the VC/founder skimmer
// aware without cluttering the hero rows.

import type { JSX } from "react";
import { ArrowUpRight, Landmark } from "lucide-react";

import { getRelativeTime } from "@/lib/utils";
import type { RepoFundingEvent } from "@/lib/funding/repo-events";
import type { FundingRoundType } from "@/lib/funding/types";
import { EntityLogo } from "@/components/ui/EntityLogo";
import { resolveLogoUrl } from "@/lib/logos";

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
      style={{
        border: "1px solid var(--v4-line-200)",
        background: "var(--v4-bg-025)",
        borderRadius: 2,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "10px 12px",
          borderBottom: "1px solid var(--v4-line-200)",
          background: "var(--v4-bg-050)",
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontFamily: "var(--font-geist-mono), monospace",
        }}
      >
        <Landmark
          size={12}
          style={{ color: "var(--v4-acc)", flexShrink: 0 }}
          aria-hidden
        />
        <span
          style={{
            flex: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            color: "var(--v4-ink-200)",
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          {"// FUNDING · M&A"}
        </span>
        <span
          style={{
            flexShrink: 0,
            color: "var(--v4-ink-300)",
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          {events.length} EVENT{events.length === 1 ? "" : "S"}
        </span>
      </div>

      <ul className="px-4 py-2">
        {visible.map((event, i) => (
          <FundingRow
            key={event.signal.id}
            event={event}
            isLast={i === visible.length - 1 && hiddenCount === 0}
          />
        ))}
      </ul>

      {hiddenCount > 0 ? (
        <footer
          className="px-4 pb-3 pt-1"
          style={{
            fontSize: 10,
            color: "var(--v4-ink-400)",
            fontFamily: "var(--font-geist-mono), monospace",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          {`// +${hiddenCount} MORE EVENT${hiddenCount === 1 ? "" : "S"}`}
        </footer>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

function FundingRow({
  event,
  isLast,
}: {
  event: RepoFundingEvent;
  isLast: boolean;
}): JSX.Element {
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
  const companyName = extracted?.companyName ?? signal.headline;
  const companyLogo = resolveLogoUrl(
    extracted?.companyWebsite ?? extracted?.companyLogoUrl ?? signal.sourceUrl,
    companyName,
    64,
  );

  const showConfidence =
    match.reason !== "domain" || match.confidence < 0.99;
  const confidenceLabel = formatConfidenceLabel(match);

  return (
    <li
      className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-3"
      style={{
        borderBottom: isLast ? "none" : "1px solid var(--v4-line-200)",
      }}
    >
      <EntityLogo
        src={companyLogo}
        name={companyName}
        size={24}
        shape="square"
        alt=""
      />

      <span
        className="shrink-0"
        style={{
          fontFamily: "var(--font-geist-mono), monospace",
          fontSize: 10,
          padding: "2px 6px",
          border: "1px solid var(--v4-line-200)",
          borderRadius: 2,
          color: "var(--v4-ink-200)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        {roundLabel.toUpperCase()}
      </span>

      <span
        className="tabular-nums"
        style={{
          fontFamily: "var(--font-geist-mono), monospace",
          fontSize: 14,
          fontWeight: 510,
          color: amount === "Undisclosed" ? "var(--v4-ink-300)" : "var(--v4-acc)",
        }}
      >
        {amount}
      </span>

      <span
        className="tabular-nums"
        style={{
          fontFamily: "var(--font-geist-mono), monospace",
          fontSize: 11,
          color: "var(--v4-ink-400)",
        }}
      >
        {getRelativeTime(announcedAt)}
      </span>

      {visibleInvestors.length > 0 ? (
        <span
          style={{
            fontSize: 11,
            color: "var(--v4-ink-200)",
            fontFamily: "var(--font-geist-mono), monospace",
          }}
        >
          {visibleInvestors.map((investor, idx) => (
            <span key={`${investor}-${idx}`} className="inline-flex items-center gap-1.5">
              <EntityLogo
                src={resolveLogoUrl(null, investor, 32)}
                name={investor}
                size={16}
                shape="circle"
                alt=""
              />
              {investor}
              {idx < visibleInvestors.length - 1 ? "," : ""}
            </span>
          ))}
          {extraInvestors > 0 ? ` +${extraInvestors}` : ""}
        </span>
      ) : null}

      {showConfidence && confidenceLabel ? (
        <span
          className="shrink-0"
          style={{
            fontFamily: "var(--font-geist-mono), monospace",
            fontSize: 10,
            padding: "2px 6px",
            border: "1px solid var(--v4-line-200)",
            borderRadius: 2,
            color: "var(--v4-ink-400)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
          title={`Matched via ${match.reason.replace(/_/g, " ")} — confidence ${match.confidence.toFixed(2)}`}
        >
          {confidenceLabel.toUpperCase()}
        </span>
      ) : null}

      <a
        href={signal.sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="ml-auto inline-flex items-center gap-1 transition-colors"
        style={{
          fontFamily: "var(--font-geist-mono), monospace",
          fontSize: 10,
          color: "var(--v4-ink-300)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        SOURCE
        <ArrowUpRight size={11} aria-hidden />
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
