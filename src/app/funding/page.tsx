// /funding — V4 Funding Radar (W4-B chrome migration).
//
// Composes the V4 page-level primitives (PageHead · VerdictRibbon · KpiBand
// · SectionHead · FooterBar) with the existing funding-domain row primitives
// (CapitalFlowChart, SectorHeatmap, MoverRow, ARRClimberRow, DealTapeRow).
//
// Data plane: still sourced from `funding-news.json` via the data-store
// refresh hook in [src/lib/funding-news.ts]. The W4-A backend (`/api/funding/
// events` + `/api/funding/sectors`) lands separately — when it does, swap
// the data-derivation block here without touching the chrome.
//
// All section panels render a gracefuly-empty state when the underlying
// signal pool is cold (no scrape has landed yet). The existing V3 fallback
// copy survived as a guideline; here we follow the V4 mockup convention of
// a small caps-mono "NO DEALS IN THE LAST 24H" placeholder per panel.

import type { Metadata } from "next";
import Link from "next/link";

import { ARRClimberRow } from "@/components/funding/ARRClimberRow";
import { CapitalFlowChart } from "@/components/funding/CapitalFlowChart";
import { DealTapeRow } from "@/components/funding/DealTapeRow";
import { MoverRow, type FundingStage } from "@/components/funding/MoverRow";
import { SectorHeatmap, type SectorRow } from "@/components/funding/SectorHeatmap";
import { FooterBar, FooterLink } from "@/components/ui/FooterBar";
import { KpiBand } from "@/components/ui/KpiBand";
import { LiveDot } from "@/components/ui/LiveDot";
import { PageHead } from "@/components/ui/PageHead";
import { SectionHead } from "@/components/ui/SectionHead";
import { VerdictRibbon } from "@/components/ui/VerdictRibbon";
import {
  getFundingFile,
  getFundingSignals,
  getFundingStats,
  isFundingCold,
  refreshFundingNewsFromStore,
} from "@/lib/funding-news";
import type { FundingSignal } from "@/lib/funding/types";

// ISR — funding scrapers run on a 1h cadence; 10-minute window avoids
// hammering Redis on burst page hits while keeping the tape fresh.
export const revalidate = 600;

export const metadata: Metadata = {
  title: "TrendingRepo · Funding Radar",
  description:
    "Live AI / dev-tools funding tape. Capital flow by sector, ARR climbers, latest rounds — aggregated from TechCrunch, VentureBeat, and more.",
  alternates: { canonical: "/funding" },
};

// ---------------------------------------------------------------------------
// Static lookups
// ---------------------------------------------------------------------------

const ROUND_LABELS: Record<string, FundingStage | string> = {
  "pre-seed": "Seed",
  seed: "Seed",
  "series-a": "Series A",
  "series-b": "Series B",
  "series-c": "Series C",
  "series-d-plus": "Series D",
  growth: "Growth",
  ipo: "IPO",
  acquisition: "M&A",
  undisclosed: "Seed",
};

// Per-tag → sector key mapping for the heatmap. Keys map to the V4 token
// rail; falls through to "agents" so unmapped tags still surface in the
// agents lane (the most common AI-funding bucket today).
const TAG_TO_SECTOR: Record<string, string> = {
  ai: "agents",
  saas: "devtools",
  fintech: "apps",
  healthcare: "apps",
  climate: "data",
  hardware: "infra",
  defense: "security",
  consumer: "apps",
};

const SECTOR_META: Array<{
  key: string;
  label: string;
  pip: string;
  legend: string;
}> = [
  { key: "agents", label: "AI · agents", pip: "var(--v4-violet)", legend: "AGENTS" },
  { key: "infra", label: "Infra", pip: "var(--v4-money)", legend: "INFRA" },
  { key: "devtools", label: "Devtools", pip: "var(--v4-cyan)", legend: "DEVTOOLS" },
  { key: "apps", label: "Apps", pip: "var(--v4-blue)", legend: "APPS" },
  { key: "data", label: "Data", pip: "var(--v4-amber)", legend: "DATA" },
  { key: "security", label: "Security", pip: "var(--v4-pink)", legend: "SECURITY" },
];

const STAGE_COLUMNS = [
  "SEED",
  "SERIES A",
  "SERIES B",
  "SERIES C",
  "SERIES D+",
  "GROWTH",
] as const;

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

function compactNumber(value: number | null | undefined): string {
  if (!Number.isFinite(value ?? NaN)) return "0";
  const n = value ?? 0;
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: n >= 1000 ? 1 : 0,
  }).format(n);
}

function money(value: number | null | undefined): string {
  if (!Number.isFinite(value ?? NaN) || !value) return "$0";
  return `$${compactNumber(value)}`;
}

function formatHHMM(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "--:--";
  return new Date(t).toISOString().slice(11, 16);
}

function formatHeadline(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "warming";
  return new Date(t)
    .toISOString()
    .replace("T", " · ")
    .slice(0, 16)
    .toUpperCase();
}

function ageMinutes(iso: string): number | null {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 60_000));
}

function amountValue(signal: FundingSignal): number {
  return signal.extracted?.amount ?? 0;
}

function signalCompany(signal: FundingSignal): string {
  return signal.extracted?.companyName || signal.headline.slice(0, 60);
}

function stageFor(signal: FundingSignal): FundingStage | string {
  const round = signal.extracted?.roundType ?? "undisclosed";
  return ROUND_LABELS[round] ?? "Seed";
}

function sectorFor(signal: FundingSignal): string {
  for (const tag of signal.tags) {
    const mapped = TAG_TO_SECTOR[tag];
    if (mapped) return mapped;
  }
  return "agents";
}

function stageColumnIndex(signal: FundingSignal): number {
  const round = (signal.extracted?.roundType ?? "").toLowerCase();
  if (round.includes("pre-seed") || round === "seed") return 0;
  if (round === "series-a") return 1;
  if (round === "series-b") return 2;
  if (round === "series-c") return 3;
  if (round === "series-d-plus") return 4;
  if (round === "growth" || round === "ipo" || round === "acquisition") return 5;
  return 0;
}

// ---------------------------------------------------------------------------
// Sector heatmap derivation — sum extracted $ across (sector × stage).
// Returns dollar values in millions to match the SectorHeatmap contract.
// ---------------------------------------------------------------------------

function buildSectorRows(signals: FundingSignal[]): SectorRow[] {
  return SECTOR_META.map((meta) => {
    const values = new Array(STAGE_COLUMNS.length).fill(0) as number[];
    let total = 0;
    for (const signal of signals) {
      if (sectorFor(signal) !== meta.key) continue;
      const amount = amountValue(signal);
      if (amount <= 0) continue;
      const millions = Math.round(amount / 1_000_000);
      values[stageColumnIndex(signal)] += millions;
      total += millions;
    }
    return {
      key: meta.key,
      label: meta.label,
      pip: meta.pip,
      values,
      total: total >= 1000 ? `$${(total / 1000).toFixed(1)}B` : `$${total}M`,
    };
  });
}

// ---------------------------------------------------------------------------
// Capital-flow derivation — bucket signals into 30 daily buckets per sector.
// When the pool is cold this returns an empty point set; CapitalFlowChart
// renders a blank SVG in that case (built-in zero-data guard).
// ---------------------------------------------------------------------------

function buildCapitalFlowPoints(signals: FundingSignal[]): {
  points: { day: number; sectors: Record<string, number> }[];
  todayTotal: number;
} {
  const DAYS = 30;
  const dayBuckets: Record<string, number>[] = Array.from(
    { length: DAYS },
    () => Object.fromEntries(SECTOR_META.map((s) => [s.key, 0])),
  );
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  for (const signal of signals) {
    const t = Date.parse(signal.publishedAt);
    if (!Number.isFinite(t)) continue;
    const ageDays = Math.floor((now - t) / dayMs);
    if (ageDays < 0 || ageDays >= DAYS) continue;
    const bucketIdx = DAYS - 1 - ageDays;
    const sector = sectorFor(signal);
    const millions = Math.round(amountValue(signal) / 1_000_000);
    if (millions <= 0) continue;
    dayBuckets[bucketIdx][sector] = (dayBuckets[bucketIdx][sector] ?? 0) + millions;
  }

  const points = dayBuckets.map((sectors, day) => ({ day, sectors }));
  const todayTotal = Object.values(dayBuckets[DAYS - 1] ?? {}).reduce(
    (sum, v) => sum + v,
    0,
  );
  return { points, todayTotal };
}

// ---------------------------------------------------------------------------
// Empty-row primitive — caps-mono "no data" line used inside any panel that
// has nothing to render. Matches V4 mockup convention (funding.html · empty).
// ---------------------------------------------------------------------------

function PanelEmpty({ label }: { label: string }) {
  return (
    <div
      className="v4-empty"
      style={{
        padding: "24px 16px",
        color: "var(--v4-ink-300)",
        fontFamily: "var(--v4-mono)",
        fontSize: 11,
        letterSpacing: "0.10em",
        textTransform: "uppercase",
      }}
    >
      {label}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function FundingPage() {
  await refreshFundingNewsFromStore();

  const file = getFundingFile();
  const signals = getFundingSignals();
  const stats = getFundingStats();
  const cold = isFundingCold(file);

  // 24h / 7d windows for the verdict ribbon + KPI band.
  const now = Date.now();
  const last24h = signals.filter((s) => {
    const t = Date.parse(s.publishedAt);
    return Number.isFinite(t) && now - t <= 24 * 60 * 60 * 1000;
  });
  const last7d = signals.filter((s) => {
    const t = Date.parse(s.publishedAt);
    return Number.isFinite(t) && now - t <= 7 * 24 * 60 * 60 * 1000;
  });

  const raised24h = last24h.reduce((sum, s) => sum + amountValue(s), 0);
  const raised7d = last7d.reduce((sum, s) => sum + amountValue(s), 0);
  const deals24h = last24h.length;

  // Top sector by 7d capital — drives the KPI cell + ribbon copy.
  const sectorTotals = new Map<string, number>();
  for (const signal of last7d) {
    const sector = sectorFor(signal);
    sectorTotals.set(sector, (sectorTotals.get(sector) ?? 0) + amountValue(signal));
  }
  const topSectorEntry = [...sectorTotals.entries()].sort(
    (a, b) => b[1] - a[1],
  )[0];
  const topSectorMeta = topSectorEntry
    ? SECTOR_META.find((s) => s.key === topSectorEntry[0])
    : undefined;
  const topSectorLabel = topSectorMeta?.legend ?? "—";

  // Hot vertical = most-frequent tag in last 7d (excluding the generic "ai"
  // bucket so the cell surfaces something more specific).
  const tagCounts = new Map<string, number>();
  for (const signal of last7d) {
    for (const tag of signal.tags) {
      if (tag === "ai") continue;
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }
  const hotTag = [...tagCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  const hotTagLabel = hotTag ? `#${hotTag[0]}` : "—";

  // Top movers (24h, by amount) feed the MoverRow column.
  const movers = last24h
    .filter((s) => s.extracted)
    .sort((a, b) => amountValue(b) - amountValue(a))
    .slice(0, 8);

  // Top deal-tape rows (latest, all sources, 50 cap).
  const tape = signals
    .slice()
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
    .slice(0, 12);

  // ARR climbers — funding pool doesn't carry ARR data, so we surface the
  // top non-mega rounds (Seed → Series B) as a pragmatic proxy. Real ARR
  // overlays land alongside the W4-A backend.
  const climbers = last7d
    .filter((s) => {
      const r = s.extracted?.roundType ?? "";
      return r === "seed" || r === "pre-seed" || r === "series-a" || r === "series-b";
    })
    .sort((a, b) => amountValue(b) - amountValue(a))
    .slice(0, 6);

  // Sector heatmap + capital flow.
  const sectorRows = buildSectorRows(last7d);
  const { points: capitalPoints, todayTotal: capitalTodayMillions } =
    buildCapitalFlowPoints(signals);
  const todayLabel =
    capitalTodayMillions >= 1000
      ? `$${(capitalTodayMillions / 1000).toFixed(1)}B`
      : `$${capitalTodayMillions}M`;

  // Verdict ribbon stamp.
  const computedHeadline = cold ? "warming" : formatHeadline(file.fetchedAt);
  const computedAge = cold ? null : ageMinutes(file.fetchedAt);
  const stampSub = cold
    ? "awaiting first scrape"
    : `computed ${computedAge ?? 0}m ago · ${signals.length} signals · ${file.windowDays}d window`;

  const verdictText =
    raised24h > 0 ? (
      <>
        <b>{money(raised24h)} raised</b> across {deals24h} deal
        {deals24h === 1 ? "" : "s"} in the last 24h ·{" "}
        <span style={{ color: "var(--v4-money)" }}>
          top sector {topSectorLabel.toLowerCase()}
        </span>
        {hotTag ? (
          <>
            {" "}· hot vertical{" "}
            <span style={{ color: "var(--v4-acc)" }}>{hotTagLabel}</span>
          </>
        ) : null}
        .
      </>
    ) : (
      <>
        Tape is quiet — <b>0 deals</b> in the last 24h. Pool holds {signals.length}{" "}
        signal{signals.length === 1 ? "" : "s"} in the rolling window.
      </>
    );

  return (
    <main className="home-surface funding-page">
      <PageHead
        crumb={
          <>
            <b>FUNDING</b> · TERMINAL · /FUNDING
          </>
        }
        h1="Who just raised — and what just changed."
        lede="Live capital tape for AI, dev-tools, and infra. Sector × stage heatmap, biggest rounds, ARR climbers — all derived from cross-source signals refreshed every hour."
        clock={
          <>
            <span className="big">{formatHHMM(file.fetchedAt)}</span>
            <span className="muted">UTC · COMPUTED</span>
            <LiveDot label="TAPE LIVE" />
            <Link href="/feeds/funding.xml" className="json-link">
              RSS →
            </Link>
          </>
        }
      />

      <VerdictRibbon
        tone="money"
        stamp={{
          eyebrow: "// TODAY'S TAPE",
          headline: computedHeadline,
          sub: stampSub,
        }}
        text={verdictText}
        actionHref="#funding-tape"
        actionLabel="JUMP TO TAPE →"
      />

      <KpiBand
        className="kpi-band"
        cells={[
          {
            label: "RAISED · 24H",
            value: money(raised24h),
            sub: `${deals24h} deal${deals24h === 1 ? "" : "s"}`,
            tone: "money",
            pip: "var(--v4-money)",
          },
          {
            label: "RAISED · 7D",
            value: money(raised7d),
            sub: `${last7d.length} signals`,
            pip: "var(--v4-ink-300)",
          },
          {
            label: "TOP SECTOR · 7D",
            value: topSectorLabel,
            sub: topSectorEntry ? money(topSectorEntry[1]) : "—",
            tone: "acc",
            pip: topSectorMeta?.pip ?? "var(--v4-violet)",
          },
          {
            label: "DEALS · 24H",
            value: deals24h,
            sub: `${stats.extractedSignals} extracted total`,
            pip: "var(--v4-cyan)",
          },
          {
            label: "HOT VERTICAL",
            value: hotTagLabel,
            sub: hotTag ? `${hotTag[1]} mentions · 7d` : "no clear leader",
            tone: "amber",
            pip: "var(--v4-amber)",
          },
        ]}
      />

      <SectionHead
        num="// 01"
        title="Capital flow · 30 days"
        meta={
          <>
            stacked by sector · <b>{capitalPoints.length}</b> day window
          </>
        }
      />
      <section className="panel">
        <div className="panel-head">
          <span className="key">{"// CAPITAL FLOW · $M / DAY · BY SECTOR"}</span>
          <span style={{ color: "var(--v4-ink-400)" }}>
            · TODAY {todayLabel}
          </span>
          <span className="right">
            <LiveDot label="LIVE" />
          </span>
        </div>
        {capitalTodayMillions === 0 && raised7d === 0 ? (
          <PanelEmpty label="// NO CAPITAL FLOW IN THE LAST 30 DAYS" />
        ) : (
          <CapitalFlowChart
            points={capitalPoints}
            sectors={SECTOR_META.map((s) => ({
              key: s.key,
              label: s.legend,
              color: s.pip,
            }))}
            todayLabel={todayLabel}
          />
        )}
      </section>

      <SectionHead
        num="// 02"
        title="Sector heatmap · capital × stage"
        meta={
          <>
            <b>{SECTOR_META.length}</b> sectors · {STAGE_COLUMNS.length} stages
          </>
        }
      />
      <section className="panel">
        {raised7d === 0 ? (
          <PanelEmpty label="// NO STAGED CAPITAL IN THE LAST 7 DAYS" />
        ) : (
          <SectorHeatmap stages={[...STAGE_COLUMNS]} sectors={sectorRows} />
        )}
      </section>

      <SectionHead
        num="// 03"
        title="Today's deals · live tape"
        meta={
          <>
            <b>{tape.length}</b> · latest first
          </>
        }
      />
      <section id="funding-tape" className="panel">
        <div className="panel-head">
          <span className="key">{"// DEAL TAPE · LAST 50"}</span>
          <span style={{ color: "var(--v4-ink-400)" }}>
            · FRESH = LAST 3 PRINTS
          </span>
          <span className="right">
            <LiveDot label="LIVE" />
          </span>
        </div>
        {tape.length === 0 ? (
          <PanelEmpty label="// NO DEALS IN THE LAST 24H" />
        ) : (
          tape.map((signal, index) => (
            <DealTapeRow
              key={signal.id}
              ts={formatHHMM(signal.publishedAt)}
              title={
                signal.extracted ? (
                  <>
                    <b>{signalCompany(signal)}</b>{" "}
                    {signal.headline.slice(signalCompany(signal).length).trim() ||
                      "raises new round"}
                  </>
                ) : (
                  signal.headline
                )
              }
              desc={signal.description?.slice(0, 140)}
              amount={signal.extracted?.amountDisplay ?? "Undisclosed"}
              sourceCode={signal.sourcePlatform.slice(0, 2).toUpperCase()}
              stage={
                signal.extracted?.roundType
                  ? String(signal.extracted.roundType).toUpperCase()
                  : undefined
              }
              fresh={index < 3}
              href={signal.sourceUrl}
            />
          ))
        )}
      </section>

      <SectionHead
        num="// 04"
        title="ARR climbers · proxy view"
        meta={
          <>
            top early-stage rounds · <b>7d</b>
          </>
        }
      />
      <section className="panel">
        {climbers.length === 0 ? (
          <PanelEmpty label="// NO EARLY-STAGE CLIMBERS IN THE LAST 7 DAYS" />
        ) : (
          climbers.map((signal, index) => {
            const amount = amountValue(signal);
            const top = climbers[0] ? amountValue(climbers[0]) : amount;
            const barPct = top > 0 ? Math.round((amount / top) * 100) : 0;
            // No real MoM — surface ratio-vs-leader as an ordinal hint so the
            // bar still reads. Real ARR/MoM data lands with W4-A backend.
            const ratioPct = top > 0 ? Math.round((amount / top) * 100) : 0;
            return (
              <ARRClimberRow
                key={signal.id}
                rank={index + 1}
                name={signalCompany(signal)}
                meta={
                  signal.tags.slice(0, 2).join(" · ") ||
                  signal.sourcePlatform
                }
                arr={signal.extracted?.amountDisplay ?? "Undisclosed"}
                momPct={ratioPct}
                barPct={barPct}
                first={index === 0}
                href={signal.sourceUrl}
              />
            );
          })
        )}
      </section>

      <SectionHead
        num="// 05"
        title="Movers · 24h"
        meta={
          <>
            <b>{movers.length}</b> · biggest rounds
          </>
        }
      />
      <section className="panel">
        {movers.length === 0 ? (
          <PanelEmpty label="// NO RANKED MOVERS IN THE LAST 24H" />
        ) : (
          movers.map((signal, index) => (
            <MoverRow
              key={signal.id}
              rank={index + 1}
              name={signalCompany(signal)}
              meta={
                signal.tags.slice(0, 3).join(" · ") || signal.sourcePlatform
              }
              amount={signal.extracted?.amountDisplay ?? "Undisclosed"}
              stage={stageFor(signal)}
              first={index === 0}
              href={signal.sourceUrl}
            />
          ))
        )}
      </section>

      <FooterBar
        meta={`// FUNDING / radar / ${signals.length} signals · ${file.windowDays}d`}
        actions={
          <>
            <FooterLink href="/docs/funding-methodology">METHODOLOGY</FooterLink>
            <span style={{ margin: "0 6px", color: "var(--v4-ink-400)" }}>·</span>
            <FooterLink href="/feeds/funding.xml">RSS</FooterLink>
            <span style={{ margin: "0 6px", color: "var(--v4-ink-400)" }}>·</span>
            <FooterLink href="/api/funding/events">JSON</FooterLink>
          </>
        }
      />
    </main>
  );
}
