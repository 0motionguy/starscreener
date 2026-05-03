// /funding — V4 W4 Funding Radar.

import type { Metadata } from "next";
import Link from "next/link";

import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import {
  getFundingFile,
  getFundingSignals,
  getFundingStats,
  isFundingCold,
  refreshFundingNewsFromStore,
} from "@/lib/funding-news";
import type { FundingSignal } from "@/lib/funding/types";

// V4 (CORPUS) primitives.
import { PageHead } from "@/components/ui/PageHead";
import { SectionHead } from "@/components/ui/SectionHead";
import { KpiBand } from "@/components/ui/KpiBand";
import { VerdictRibbon } from "@/components/ui/VerdictRibbon";
import { MoverRow, type FundingStage } from "@/components/funding/MoverRow";
import { WindowedFundingBoard } from "@/components/funding/WindowedFundingBoard";
import { companyLogoUrl } from "@/lib/logos";
import { FreshnessBadge } from "@/components/shared/FreshnessBadge";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "TrendingRepo — Funding Radar",
  description:
    "AI and tech startup funding rounds aggregated from TechCrunch, VentureBeat, and more. Structured extraction with confidence scoring.",
  alternates: { canonical: "/funding" },
};

const SOURCE_LABELS: Record<string, string> = {
  techcrunch: "TechCrunch",
  venturebeat: "VentureBeat",
  sifted: "Sifted",
  telegram: "Telegram",
  twitter: "X / Twitter",
  reddit: "Reddit",
  submit: "Submitted",
  yc: "YC",
  newsapi: "NewsAPI",
};

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
  undisclosed: "Series A",
};

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

function formatClock(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toISOString().slice(11, 19)
    : "warming";
}

function formatAge(value: string): string {
  const t = Date.parse(value);
  if (!Number.isFinite(t)) return "unknown";
  const hours = Math.max(0, Math.floor((Date.now() - t) / 3_600_000));
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function sourceName(source: string): string {
  return SOURCE_LABELS[source] ?? source.replaceAll("-", " ");
}

function roundName(signal: FundingSignal): string {
  const round = signal.extracted?.roundType ?? "undisclosed";
  return String(ROUND_LABELS[round] ?? round);
}

function amountValue(signal: FundingSignal): number {
  return signal.extracted?.amount ?? 0;
}

function signalTitle(signal: FundingSignal): string {
  return signal.extracted?.companyName || signal.headline;
}

function confidenceCount(signals: FundingSignal[], confidence: "high" | "medium" | "low") {
  return signals.filter((signal) => signal.extracted?.confidence === confidence).length;
}

function sourceRows(signals: FundingSignal[]) {
  const counts = new Map<string, number>();
  for (const signal of signals) {
    counts.set(signal.sourcePlatform, (counts.get(signal.sourcePlatform) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count);
}

function EmptyState({ cold }: { cold: boolean }) {
  return (
    <Card className="p-8 text-sm" style={{ color: "var(--v4-ink-300)" }}>
      {cold
        ? "Funding data has not landed yet. Run the scraper to populate the radar."
        : "The scraper ran but found no funding-related headlines in the current window."}
    </Card>
  );
}

export default async function FundingPage() {
  await refreshFundingNewsFromStore();
  const file = getFundingFile();
  const signals = getFundingSignals();
  const stats = getFundingStats();
  const cold = isFundingCold(file);
  const computed = formatClock(file.fetchedAt);
  const extracted = stats.extractedSignals;
  const highConfidence = confidenceCount(signals, "high");
  const mediumConfidence = confidenceCount(signals, "medium");
  const rounds = signals
    .filter((signal) => signal.extracted)
    .sort((a, b) => amountValue(b) - amountValue(a));
  const topRounds = rounds.slice(0, 10);

  // Windowed Top rounds — filter rounds by publishedAt age, then pre-render
  // MoverRow trees server-side. Client switcher just swaps which list to
  // render. AUDIT-2026-05-04 follow-up: user asked for 24h/7d/30d on every
  // source page; funding had only a fixed all-time top.
  const nowMs = Date.now();
  const HOUR_MS = 3_600_000;
  const renderRoundList = (windowMs: number) =>
    rounds
      .filter((signal) => {
        const t = Date.parse(signal.publishedAt);
        return Number.isFinite(t) && nowMs - t <= windowMs;
      })
      .slice(0, 10)
      .map((signal, index) => {
        // AUDIT-2026-05-04: closes the funding-page no-images gap.
        // Prefer the extractor's pre-resolved logoUrl when populated,
        // otherwise derive a Google Favicons URL from companyWebsite.
        const explicit = signal.extracted?.companyLogoUrl ?? null;
        const logoUrl =
          explicit ?? companyLogoUrl(signal.extracted?.companyWebsite ?? null);
        return (
          <MoverRow
            key={signal.id}
            rank={index + 1}
            first={index === 0}
            name={signalTitle(signal)}
            meta={`${sourceName(signal.sourcePlatform)} · ${formatAge(signal.publishedAt)}`}
            amount={signal.extracted?.amountDisplay ?? "Undisclosed"}
            stage={roundName(signal)}
            href={signal.sourceUrl}
            logoUrl={logoUrl}
            logoName={signal.extracted?.companyName ?? signalTitle(signal)}
          />
        );
      });
  const rounds24h = renderRoundList(24 * HOUR_MS);
  const rounds7d = renderRoundList(7 * 24 * HOUR_MS);
  const rounds30d = renderRoundList(30 * 24 * HOUR_MS);
  const recent = signals
    .slice()
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
    .slice(0, 8);
  const sources = sourceRows(signals).slice(0, 8);
  const megaRounds = rounds.filter((signal) => amountValue(signal) >= 100_000_000).length;
  const totalAmount = stats.totalAmountUsd ?? 0;

  return (
    <main className="home-surface funding-page">
      <PageHead
        crumb={
          <>
            <b>FUNDING</b> · TERMINAL · /FUNDING
          </>
        }
        h1="Who just raised money."
        lede="Funding signals from startup and venture feeds, normalized into amount, stage, source, and confidence. Structured extraction with confidence scoring."
        clock={
          <>
            <span className="big">{computed}</span>
            <span className="muted">UTC · UPDATED</span>
            <FreshnessBadge source="skills" lastUpdatedAt={file.fetchedAt} />
          </>
        }
      />

      <VerdictRibbon
        tone="money"
        stamp={{
          eyebrow: "// CAPITAL RADAR",
          headline: money(totalAmount),
          sub: `${file.windowDays}d window · computed ${computed} UTC`,
        }}
        text={
          <>
            <b>{signals.length} funding signals</b> are in the current window.{" "}
            <span style={{ color: "var(--v4-violet)" }}>{extracted} extracted rounds</span>{" "}
            include{" "}
            <span style={{ color: "var(--v4-amber)" }}>{megaRounds} mega rounds</span> and{" "}
            <span style={{ color: "var(--v4-money)" }}>
              {highConfidence} high-confidence
            </span>{" "}
            company matches.
          </>
        }
        actionHref="/feeds/funding.xml"
        actionLabel="RSS →"
      />

      <KpiBand
        className="kpi-band"
        cells={[
          {
            label: "SIGNALS",
            value: signals.length,
            sub: "tracked",
            pip: "var(--v4-ink-300)",
          },
          {
            label: "EXTRACTED",
            value: extracted,
            sub: "structured",
            tone: "money",
            pip: "var(--v4-money)",
          },
          {
            label: "CAPITAL",
            value: money(totalAmount),
            sub: "parsed total",
            tone: "money",
            pip: "var(--v4-money)",
          },
          {
            label: "THIS WEEK",
            value: stats.thisWeekCount,
            sub: "fresh items",
            tone: "acc",
            pip: "var(--v4-blue)",
          },
          {
            label: "MEGA",
            value: megaRounds,
            sub: "$100M+",
            tone: "acc",
            pip: "var(--v4-acc)",
          },
          {
            label: "CONFIDENCE",
            value: highConfidence,
            sub: `${mediumConfidence} medium`,
            tone: "amber",
            pip: "var(--v4-amber)",
          },
        ]}
      />

      <div className="src-strip funding-sources">
        {sources.length > 0 ? (
          sources.map((source, index) => (
            <div className="src-cell" key={source.source}>
              <div className="src-top">
                <span className={`sd sd-f${(index % 6) + 1}`}>
                  {sourceName(source.source).slice(0, 2).toUpperCase()}
                </span>
                <span className="nm">{sourceName(source.source)}</span>
                <span className="wt">{source.count}</span>
              </div>
              <div className="ct">{source.count}</div>
              <div className="meta">signals</div>
              <span className="bar">
                <i style={{ width: `${Math.max(8, (source.count / Math.max(1, signals.length)) * 100)}%` }} />
              </span>
            </div>
          ))
        ) : (
          <div className="src-cell">
            <div className="src-top">
              <span className="sd sd-f1">--</span>
              <span className="nm">No source data</span>
              <span className="wt">0</span>
            </div>
            <div className="ct">0</div>
            <div className="meta">waiting</div>
            <span className="bar"><i style={{ width: "4%" }} /></span>
          </div>
        )}
      </div>

      {signals.length === 0 ? (
        <EmptyState cold={cold} />
      ) : (
        <>
          <SectionHead
            num="// 01"
            title="Capital movement"
            meta={
              <>
                <b>{topRounds.length}</b> · largest rounds
              </>
            }
          />
          <div className="grid">
            <Card className="col-8 funding-chart">
              <CardHeader showCorner right={<span>{money(totalAmount)} parsed</span>}>
                Round volume
              </CardHeader>
              <CardBody>
                <div className="funding-bars" aria-label="Funding round volume bars">
                  {topRounds.slice(0, 8).map((signal, index) => {
                    const width = Math.max(5, (amountValue(signal) / Math.max(1, amountValue(topRounds[0]))) * 100);
                    return (
                      <Link
                        href={signal.sourceUrl}
                        className="funding-bar"
                        key={signal.id}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <span className="idx">{String(index + 1).padStart(2, "0")}</span>
                        <span className="track"><i style={{ width: `${width}%` }} /></span>
                        <span className="amt">{signal.extracted?.amountDisplay ?? "Undisclosed"}</span>
                      </Link>
                    );
                  })}
                </div>
              </CardBody>
            </Card>
            <Card className="col-4">
              <CardHeader showCorner right={<span>{sources.length} sources</span>}>
                Source mix
              </CardHeader>
              {sources.slice(0, 8).map((source, index) => (
                <div className="stock-row" key={source.source}>
                  <span className={`col-pip sd-f${(index % 6) + 1}`} />
                  <span className="nm">{sourceName(source.source)}</span>
                  <span className="px">{source.count}</span>
                  <span className="ch up">
                    {Math.round((source.count / Math.max(1, signals.length)) * 100)}%
                  </span>
                </div>
              ))}
            </Card>
          </div>

          <SectionHead
            num="// 02"
            title="Top rounds"
            meta={
              <>
                <b>biggest</b> · 24h / 7d / 30d
              </>
            }
          />
          <WindowedFundingBoard
            rows24h={rounds24h}
            rows7d={rounds7d}
            rows30d={rounds30d}
            defaultWindow="7d"
          />

          <SectionHead
            num="// 03"
            title="Recent signals"
            meta={
              <>
                <b>{recent.length}</b> · latest
              </>
            }
          />
          <div className="grid">
            <Card className="col-6">
              <CardHeader showCorner right={<span>latest feed</span>}>
                News tape
              </CardHeader>
              {recent.slice(0, 4).map((signal, index) => (
                <Link
                  key={signal.id}
                  href={signal.sourceUrl}
                  className="sp-row"
                  target="_blank"
                  rel="noreferrer"
                >
                  <span className="rk">{String(index + 1).padStart(2, "0")}</span>
                  <span className="nm">
                    <span className="h">{signal.headline}</span>
                    <span className="meta">{sourceName(signal.sourcePlatform)} / {formatAge(signal.publishedAt)}</span>
                  </span>
                  <span className="delta up">
                    {signal.extracted?.confidence ?? "none"}
                    <span className="lbl">confidence</span>
                  </span>
                </Link>
              ))}
            </Card>
            <Card className="col-6">
              <CardHeader showCorner right={<span>tags</span>}>
                Sector tags
              </CardHeader>
              <div className="tag-cloud">
                {Array.from(new Set(signals.flatMap((signal) => signal.tags))).slice(0, 24).map((tag) => (
                  <span className="chip" key={tag}>{tag}</span>
                ))}
              </div>
            </Card>
          </div>
        </>
      )}
    </main>
  );
}
