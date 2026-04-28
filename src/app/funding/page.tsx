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
import { NewsTopHeaderV3 } from "@/components/news/NewsTopHeaderV3";
import { buildFundingHeader } from "@/components/funding/fundingTopMetrics";

const FUNDING_ACCENT = "rgba(245, 110, 15, 0.85)";
const FUNDING_BRAND = "#f56e0f";

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
              <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {signals.map((signal, i) => {
                  const stagger = Math.min(i, 6) * 50;
                  return (
                    <div
                      key={signal.id}
                      style={{
                        animation: "slide-up 0.35s cubic-bezier(0.2, 0.8, 0.2, 1) both",
                        animationDelay: stagger > 0 ? `${stagger}ms` : undefined,
                      }}
                    >
                      <FundingCard signal={signal} />
                    </div>
                  );
                })}
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
    <section
      className="p-8"
      style={{
        background: "var(--v3-bg-025)",
        border: "1px dashed var(--v3-line-100)",
        borderRadius: 2,
      }}
    >
      <h2
        className="v2-mono text-lg font-bold uppercase tracking-[0.18em]"
        style={{ color: FUNDING_BRAND }}
      >
        {"// no funding data yet"}
      </h2>
      <p
        className="mt-3 max-w-xl text-sm"
        style={{ color: "var(--v3-ink-300)" }}
      >
        The funding scraper has not run yet. Run{" "}
        <code style={{ color: "var(--v3-ink-100)" }}>npm run scrape:funding</code>{" "}
        locally to populate{" "}
        <code style={{ color: "var(--v3-ink-100)" }}>data/funding-news.json</code>,
        then refresh this page.
      </p>
    </section>
  );
}

function EmptyState() {
  return (
    <section
      className="p-8"
      style={{
        background: "var(--v3-bg-025)",
        border: "1px dashed var(--v3-line-100)",
        borderRadius: 2,
      }}
    >
      <h2
        className="v2-mono text-lg font-bold uppercase tracking-[0.18em]"
        style={{ color: FUNDING_BRAND }}
      >
        {"// no signals in window"}
      </h2>
      <p
        className="mt-3 max-w-xl text-sm"
        style={{ color: "var(--v3-ink-300)" }}
      >
        The scraper ran but found no funding-related headlines in the last 7
        days. This can happen on quiet news days or when RSS feeds change format.
      </p>
    </section>
  );
}
