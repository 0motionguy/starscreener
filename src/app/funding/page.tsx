// /funding — Funding Radar (Signal Radar Phase 1)
//
// Displays AI/tech startup funding signals aggregated from TechCrunch,
// VentureBeat, and other RSS feeds. Each signal shows the headline,
// extracted company/amount/round when regex could parse it, and a
// link to the original article.
//
// Server component reads from data/funding-news.json produced by
// scripts/scrape-funding-news.mjs.

import type { Metadata } from "next";
import {
  getFundingFile,
  getFundingFetchedAt,
  getFundingSignals,
  getFundingStats,
  isFundingCold,
} from "@/lib/funding-news";
import { FundingCard } from "@/components/funding/FundingCard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "TrendingRepo — Funding Radar",
  description:
    "AI and tech startup funding rounds aggregated from TechCrunch, VentureBeat, and more. Structured extraction with confidence scoring.",
  alternates: { canonical: "/funding" },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function FundingPage() {
  const file = getFundingFile();
  const signals = getFundingSignals();
  const stats = getFundingStats();
  const cold = isFundingCold(file);

  return (
    <main className="min-h-screen bg-bg-primary text-text-primary font-mono">
      <div className="max-w-[1400px] mx-auto px-6 py-8">
        {/* Header */}
        <header className="mb-6 border-b border-border-primary pb-6">
          <div className="flex items-baseline gap-3 flex-wrap">
            <h1 className="text-2xl font-bold uppercase tracking-wider">
              FUNDING RADAR
            </h1>
            <span className="text-xs text-text-tertiary">
              {"// ai & tech startup rounds"}
            </span>
          </div>
          <p className="mt-2 text-sm text-text-secondary max-w-2xl">
            Funding signals aggregated from TechCrunch, VentureBeat, and other
            sources. Structured extraction uses regex heuristics — confidence
            indicators show how reliably each field was parsed.
          </p>
        </header>

        {cold ? (
          <ColdState />
        ) : (
          <>
            {/* Stat tiles */}
            <section className="mb-6 grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatTile
                label="Last Scrape"
                value={formatRelative(getFundingFetchedAt())}
                hint={getFundingFetchedAt()
                  ? new Date(getFundingFetchedAt()!)
                      .toISOString()
                      .slice(0, 16)
                      .replace("T", " ")
                  : undefined}
              />
              <StatTile
                label="Signals"
                value={stats.totalSignals.toLocaleString()}
                hint={`${stats.extractedSignals} with extraction`}
              />
              <StatTile
                label="This Week"
                value={stats.thisWeekCount.toLocaleString()}
                hint="last 7 days"
              />
              <StatTile
                label="Top Round"
                value={stats.topRound?.extracted?.amountDisplay ?? "—"}
                hint={stats.topRound?.extracted?.companyName ?? "no data"}
              />
            </section>

            {/* Signals feed */}
            {signals.length > 0 ? (
              <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {signals.map((signal) => (
                  <FundingCard key={signal.id} signal={signal} />
                ))}
              </section>
            ) : (
              <EmptyState />
            )}
          </>
        )}
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="border border-border-primary rounded-md px-4 py-3 bg-bg-secondary">
      <div className="text-[10px] uppercase tracking-wider text-text-tertiary">
        {label}
      </div>
      <div className="mt-1 text-xl font-bold truncate">{value}</div>
      {hint ? (
        <div className="mt-0.5 text-[11px] text-text-tertiary truncate">{hint}</div>
      ) : null}
    </div>
  );
}

function ColdState() {
  return (
    <section className="border border-dashed border-border-primary rounded-md p-8 bg-bg-secondary/40">
      <h2 className="text-lg font-bold uppercase tracking-wider text-brand">
        {"// no funding data yet"}
      </h2>
      <p className="mt-3 text-sm text-text-secondary max-w-xl">
        The funding scraper has not run yet. Run{" "}
        <code className="text-text-primary">npm run scrape:funding</code> locally
        to populate{" "}
        <code className="text-text-primary">data/funding-news.json</code>, then
        refresh this page.
      </p>
    </section>
  );
}

function EmptyState() {
  return (
    <section className="border border-dashed border-border-primary rounded-md p-8 bg-bg-secondary/40">
      <h2 className="text-lg font-bold uppercase tracking-wider text-brand">
        {"// no signals in window"}
      </h2>
      <p className="mt-3 text-sm text-text-secondary max-w-xl">
        The scraper ran but found no funding-related headlines in the last 7
        days. This can happen on quiet news days or when RSS feeds change format.
      </p>
    </section>
  );
}
