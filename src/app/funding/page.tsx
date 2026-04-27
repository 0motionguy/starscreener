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
  getFundingSignals,
  getFundingStats,
  isFundingCold,
  refreshFundingNewsFromStore,
} from "@/lib/funding-news";
import { FundingCard } from "@/components/funding/FundingCard";
import { TerminalBar, MonoLabel, BarcodeTicker } from "@/components/v2";
import { NewsTopHeaderV3 } from "@/components/news/NewsTopHeaderV3";
import { buildFundingHeader } from "@/components/funding/fundingTopMetrics";

const FUNDING_ACCENT = "rgba(245, 110, 15, 0.85)";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "TrendingRepo — Funding Radar",
  description:
    "AI and tech startup funding rounds aggregated from TechCrunch, VentureBeat, and more. Structured extraction with confidence scoring.",
  alternates: { canonical: "/funding" },
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function FundingPage() {
  await refreshFundingNewsFromStore();
  const file = getFundingFile();
  const signals = getFundingSignals();
  const stats = getFundingStats();
  const cold = isFundingCold(file);
  const { cards, topStories } = buildFundingHeader(signals, stats);

  return (
    <main className="min-h-screen bg-bg-primary text-text-primary font-mono">
      <div className="max-w-[1400px] mx-auto px-4 md:px-6 py-6 md:py-8">
        {/* V2 terminal-bar — operator chrome */}
        <div className="v2-frame overflow-hidden mb-4">
          <TerminalBar
            label="// FUNDING · RADAR · 24H"
            status={`${signals.length} SIGNALS · ${cold ? "COLD" : "LIVE"}`}
            live={!cold}
          />
          <BarcodeTicker count={140} height={12} seed={signals.length || 88} />
        </div>

        {/* Header */}
        <header className="mb-6 border-b border-[var(--v2-line-std)] pb-6 space-y-3">
          <MonoLabel index="01" name="FUNDING" hint="AI · TECH" tone="muted" />
          <div className="flex items-baseline gap-3 flex-wrap">
            <h1 className="font-display text-2xl font-bold uppercase tracking-wider">
              FUNDING RADAR
            </h1>
            <span className="text-xs text-text-tertiary">
              {"// ai & tech startup rounds"}
            </span>
          </div>
          <p className="text-sm text-text-secondary max-w-2xl">
            Funding signals aggregated from TechCrunch, VentureBeat, and other
            sources. Structured extraction uses regex heuristics — confidence
            indicators show how reliably each field was parsed.
          </p>
        </header>

        {cold ? (
          <ColdState />
        ) : (
          <>
            <div className="mb-6">
              <NewsTopHeaderV3
                eyebrow="// FUNDING · TOP ROUNDS"
                status={`${signals.length.toLocaleString("en-US")} SIGNALS · 7D`}
                cards={cards}
                topStories={topStories}
                accent={FUNDING_ACCENT}
              />
            </div>

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
