// /funding — V2 Funding Radar.
//
// Displays AI/tech startup funding signals aggregated from TechCrunch,
// VentureBeat, and other RSS feeds. V2 design system: TerminalBar header,
// V2 stat tiles, V2 card grid for signals.
//
// Server component reads from data/funding-news.json produced by
// scripts/scrape-funding-news.mjs, refreshed from Redis on each request
// via refreshFundingNewsFromStore().

import type { Metadata } from "next";
import {
  getFundingFile,
  getFundingFetchedAt,
  getFundingSignals,
  getFundingStats,
  isFundingCold,
  refreshFundingNewsFromStore,
} from "@/lib/funding-news";
import { FundingCard } from "@/components/funding/FundingCard";
import { TerminalBar } from "@/components/today-v2/primitives/TerminalBar";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "TrendingRepo — Funding Radar",
  description:
    "AI and tech startup funding rounds aggregated from TechCrunch, VentureBeat, and more. Structured extraction with confidence scoring.",
  alternates: { canonical: "/funding" },
};

function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "never";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "unknown";
  const diff = Date.now() - t;
  if (diff < 60_000) return "just now";
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default async function FundingPage() {
  await refreshFundingNewsFromStore();
  const file = getFundingFile();
  const signals = getFundingSignals();
  const stats = getFundingStats();
  const cold = isFundingCold(file);

  return (
    <>
      <section className="border-b border-[color:var(--v2-line-100)]">
        <div className="v2-frame pt-6 pb-6">
          <TerminalBar
            label={
              <>
                <span aria-hidden>{"// "}</span>FUNDING · RADAR · 7D
              </>
            }
            status={
              cold
                ? "COLD"
                : `${stats.totalSignals.toLocaleString("en-US")} SIGNALS`
            }
          />

          <h1
            className="v2-mono mt-6 inline-flex items-center gap-2"
            style={{
              color: "var(--v2-ink-100)",
              fontSize: 12,
              letterSpacing: "0.20em",
            }}
          >
            <span aria-hidden>{"// "}</span>
            FUNDING RADAR · AI &amp; TECH ROUNDS
            <span
              aria-hidden
              className="inline-block ml-1"
              style={{
                width: 6,
                height: 6,
                background: "var(--v2-acc)",
                borderRadius: 1,
                boxShadow: "0 0 6px var(--v2-acc-glow)",
              }}
            />
          </h1>
          <p
            className="text-[14px] leading-relaxed max-w-[80ch] mt-3"
            style={{ color: "var(--v2-ink-200)" }}
          >
            Funding signals aggregated from TechCrunch, VentureBeat, and other
            RSS feeds. Structured extraction uses regex heuristics — confidence
            indicators on each card show how reliably the company, amount, and
            round were parsed.
          </p>
        </div>
      </section>

      {cold ? (
        <ColdState />
      ) : (
        <>
          {/* Stat tiles */}
          <section className="border-b border-[color:var(--v2-line-100)]">
            <div className="v2-frame py-6">
              <p
                className="v2-mono mb-3"
                style={{ color: "var(--v2-ink-300)" }}
              >
                <span aria-hidden>{"// "}</span>
                METRICS · LAST 7D
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatTileV2
                  label="LAST · SCRAPE"
                  value={formatRelative(getFundingFetchedAt())}
                  hint={
                    getFundingFetchedAt()
                      ? new Date(getFundingFetchedAt()!)
                          .toISOString()
                          .slice(0, 16)
                          .replace("T", " ")
                      : undefined
                  }
                />
                <StatTileV2
                  label="SIGNALS · TOTAL"
                  value={stats.totalSignals.toLocaleString("en-US")}
                  hint={`${stats.extractedSignals} with extraction`}
                />
                <StatTileV2
                  label="THIS · WEEK"
                  value={stats.thisWeekCount.toLocaleString("en-US")}
                  hint="last 7 days"
                />
                <StatTileV2
                  label="TOP · ROUND"
                  value={stats.topRound?.extracted?.amountDisplay ?? "—"}
                  hint={stats.topRound?.extracted?.companyName ?? "no data"}
                />
              </div>
            </div>
          </section>

          {/* Signals feed */}
          {signals.length > 0 ? (
            <section>
              <div className="v2-frame py-6">
                <p
                  className="v2-mono mb-3"
                  style={{ color: "var(--v2-ink-300)" }}
                >
                  <span aria-hidden>{"// "}</span>
                  SIGNALS · FEED ·{" "}
                  <span style={{ color: "var(--v2-ink-100)" }}>
                    {signals.length}
                  </span>
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {signals.map((signal) => (
                    <FundingCard key={signal.id} signal={signal} />
                  ))}
                </div>
              </div>
            </section>
          ) : (
            <EmptyState />
          )}
        </>
      )}
    </>
  );
}

function StatTileV2({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="v2-stat">
      <div className="v">{value}</div>
      <div className="k">
        <span aria-hidden>{"// "}</span>
        {label}
      </div>
      {hint ? (
        <div
          className="mt-1 v2-mono-tight truncate"
          style={{ color: "var(--v2-ink-400)", fontSize: 11 }}
          title={hint}
        >
          {hint}
        </div>
      ) : null}
    </div>
  );
}

function ColdState() {
  return (
    <section>
      <div className="v2-frame py-12">
        <div className="v2-card p-8">
          <p
            className="v2-mono mb-3"
            style={{ color: "var(--v2-acc)" }}
          >
            <span aria-hidden>{"// "}</span>
            NO DATA · COLD START
          </p>
          <p
            className="text-[14px] leading-relaxed max-w-[60ch]"
            style={{ color: "var(--v2-ink-200)" }}
          >
            The funding scraper has not run yet. Run{" "}
            <code
              className="v2-mono-tight"
              style={{ color: "var(--v2-ink-100)", fontSize: 12 }}
            >
              npm run scrape:funding
            </code>{" "}
            locally to populate{" "}
            <code
              className="v2-mono-tight"
              style={{ color: "var(--v2-ink-100)", fontSize: 12 }}
            >
              data/funding-news.json
            </code>
            , then refresh this page.
          </p>
        </div>
      </div>
    </section>
  );
}

function EmptyState() {
  return (
    <section>
      <div className="v2-frame py-12">
        <div className="v2-card p-8">
          <p
            className="v2-mono mb-3"
            style={{ color: "var(--v2-acc)" }}
          >
            <span aria-hidden>{"// "}</span>
            NO SIGNALS · 7D WINDOW
          </p>
          <p
            className="text-[14px] leading-relaxed max-w-[60ch]"
            style={{ color: "var(--v2-ink-200)" }}
          >
            The scraper ran but found no funding-related headlines in the last
            7 days. This can happen on quiet news days or when RSS feeds change
            format.
          </p>
        </div>
      </div>
    </section>
  );
}
