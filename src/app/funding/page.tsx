// /funding — Funding Radar. Phase 2A of the UI v6 rebuild.
//
// Wires:
//   refreshFundingNewsFromStore() — main funding feed (TC/VB/Sifted/Crunchbase/SEC/etc.)
//   refreshSecFormDFromStore()    — SEC EDGAR slug for the dedicated mini-feed
//   getFundingSignals/Stats/ByRoundType — sync getters
//   buildCandidates + matchFundingEventToRepo — repo-link resolution
//
// URL contract: ?period=24h|7d|30d|90d|ytd (default 7d).
// ISR: revalidate = 1800 (30 min) — matches scraper cadence.

import {
  refreshFundingNewsFromStore,
  getFundingSignals,
  getFundingStats,
  getFundingSignalsThisWeek,
  getFundingFetchedAt,
} from "@/lib/funding-news";
import {
  refreshSecFormDFromStore,
  getSecFormDSignals,
} from "@/lib/funding/sec-form-d";
import { matchFundingEventToRepo } from "@/lib/funding/match";
import { buildCandidates } from "@/lib/funding/repo-events";
import type { FundingSignal } from "@/lib/funding/types";

import {
  FundingHero,
  FUNDING_PERIODS,
  type FundingPeriod,
} from "@/components/funding/FundingHero";
import { FundingTape } from "@/components/funding/FundingTape";
import { FundingKpiStrip } from "@/components/funding/FundingKpiStrip";
import { TopRoundsTable } from "@/components/funding/TopRoundsTable";
import { SectorHeatmap } from "@/components/funding/SectorHeatmap";
import { CapitalFlowChart } from "@/components/funding/CapitalFlowChart";
import { FundingSourcePills } from "@/components/funding/FundingSourcePills";
import { InvestorChips } from "@/components/funding/InvestorChips";
import { SecFormDFeed } from "@/components/funding/SecFormDFeed";
import { ConfidenceChipsBlock } from "@/components/funding/ConfidenceChipsBlock";
import { FoundersCta } from "@/components/funding/FoundersCta";

export const revalidate = 1800;

export const metadata = {
  title: "Funding Radar — TrendingRepo",
  description:
    "Capital flows for AI + tech. Funding signals from 35+ sources — TechCrunch, VentureBeat, Sifted, Crunchbase, SEC Form D, Newcomer, The Information and more. Structured rounds with company / amount / investors / confidence scoring.",
};

interface Props {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

/** Convert period id → number of days for windowing. YTD uses Jan 1 of current year. */
function periodCutoffMs(period: FundingPeriod): number {
  const now = Date.now();
  switch (period) {
    case "24h":
      return now - 24 * 60 * 60 * 1000;
    case "7d":
      return now - 7 * 24 * 60 * 60 * 1000;
    case "30d":
      return now - 30 * 24 * 60 * 60 * 1000;
    case "90d":
      return now - 90 * 24 * 60 * 60 * 1000;
    case "ytd": {
      const yearStart = new Date(new Date().getFullYear(), 0, 1).getTime();
      return yearStart;
    }
    default:
      return now - 7 * 24 * 60 * 60 * 1000;
  }
}

function filterByPeriod(
  signals: FundingSignal[],
  period: FundingPeriod,
): FundingSignal[] {
  const cutoff = periodCutoffMs(period);
  return signals.filter((s) => {
    const t = Date.parse(s.publishedAt);
    return Number.isFinite(t) && t >= cutoff;
  });
}

export default async function FundingPage({ searchParams }: Props) {
  const params = (await searchParams) ?? {};
  const rawPeriod = typeof params.period === "string" ? params.period : "7d";
  const period =
    (FUNDING_PERIODS.find((p) => p.id === rawPeriod)?.id ?? "7d") as FundingPeriod;

  // Fire refresh hooks in parallel. allSettled so one slow / missing slug
  // doesn't take the page down.
  await Promise.allSettled([
    refreshFundingNewsFromStore(),
    refreshSecFormDFromStore(),
  ]);

  const allSignals = safe(() => getFundingSignals(), []);
  const stats = safe(() => getFundingStats(), {
    totalSignals: 0,
    extractedSignals: 0,
    totalAmountUsd: null,
    topRound: null,
    thisWeekCount: 0,
    sourcesBreakdown: {},
  });
  const thisWeek = safe(() => getFundingSignalsThisWeek(), []);
  const fetchedAt = safe(() => getFundingFetchedAt(), null);
  const secSignals = safe(() => getSecFormDSignals(), []);

  // Apply selected period window to the body signals.
  const windowed = filterByPeriod(allSignals, period);

  // Top rounds by amount (use period-windowed signals so the segmented
  // switcher actually changes the table).
  const sortedByAmount = [...windowed]
    .filter((s) => s.extracted?.amount && s.extracted.amount > 0)
    .sort(
      (a, b) => (b.extracted?.amount ?? 0) - (a.extracted?.amount ?? 0),
    );

  // Resolve repo matches for the top-N rounds only (matching is O(signals ×
  // candidates) per call; do it lazily for the rows we actually render).
  const TOP_N = 10;
  const candidates = safe(() => buildCandidates(), []);
  const topRounds = sortedByAmount.slice(0, TOP_N).map((signal) => {
    const matched = safe(
      () => matchFundingEventToRepo(signal, candidates),
      null,
    );
    return {
      signal,
      matchedRepo:
        matched && matched.confidence >= 0.6 ? matched.repoFullName : null,
    };
  });

  const reposMatched = sortedByAmount.reduce((acc, s) => {
    const m = safe(() => matchFundingEventToRepo(s, candidates), null);
    return acc + (m && m.confidence >= 0.6 ? 1 : 0);
  }, 0);

  // Tape uses the freshest signals across the whole feed (not period-filtered)
  // so the ticker stays alive even on a YTD window with quiet recent days.
  const tapeSignals = [...allSignals]
    .filter((s) => s.extracted?.amount && s.extracted.amount > 0)
    .sort(
      (a, b) =>
        Date.parse(b.publishedAt) - Date.parse(a.publishedAt),
    );

  // 30-day window for the area chart, regardless of segmented selection —
  // chart x-axis is always last 30 days.
  const last30 = filterByPeriod(allSignals, "30d");

  // SEC mini-feed: prefer the dedicated slug; if empty, derive from main
  // signals matching SEC sources / "Form D" headlines.
  const secRows =
    secSignals.length > 0
      ? secSignals
      : windowed.filter((s) =>
          (s.sourceUrl + " " + s.headline).toLowerCase().includes("form d"),
        );
  const secThisWeek = secRows.filter((s) => {
    const t = Date.parse(s.publishedAt);
    return Number.isFinite(t) && t >= Date.now() - 7 * 24 * 60 * 60 * 1000;
  }).length;

  const totalSources = 38;
  const liveSources = Math.min(
    totalSources,
    Math.max(1, Object.keys(stats.sourcesBreakdown ?? {}).length || 14),
  );

  return (
    <>
      <FundingTape signals={tapeSignals} limit={12} />
      <div style={{ padding: "16px 22px 32px", maxWidth: 1500, margin: "0 auto" }}>
        <FundingHero
          period={period}
          totalRounds={windowed.length}
          liveSources={liveSources}
          totalSources={totalSources}
          fetchedAt={fetchedAt}
        />

        <FundingKpiStrip
          stats={stats}
          thisWeekSignals={thisWeek}
          reposMatched={reposMatched}
          totalRounds={windowed.length}
        />

        <div
          className="fund-cols"
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) 320px",
            gap: 18,
            marginTop: 18,
          }}
        >
          <div>
            <TopRoundsTable rounds={topRounds} limit={TOP_N} />
            <SectorHeatmap signals={windowed} />
            <CapitalFlowChart signals={last30} />
          </div>

          <div>
            <FundingSourcePills
              signals={windowed}
              totalSources={totalSources}
              liveSources={liveSources}
            />
            <InvestorChips signals={windowed} limit={12} />
            <SecFormDFeed signals={secRows} thisWeekCount={secThisWeek} limit={6} />
            <ConfidenceChipsBlock signals={windowed} />
          </div>
        </div>

        <FoundersCta />
      </div>
    </>
  );
}
