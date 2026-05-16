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
import { FundingSourcePillRow } from "@/components/funding/FundingSourcePillRow";
import { companyLogoUrl } from "@/lib/logos";
import { resolveLogoUrl } from "@/lib/logo-url";
import { FreshnessBadge } from "@/components/shared/FreshnessBadge";
import { classifyFreshness } from "@/lib/news/freshness";
import type { VerdictTone } from "@/components/ui/VerdictRibbon";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "TrendingRepo — Funding Radar",
  description:
    "AI and tech startup funding rounds aggregated from TechCrunch, VentureBeat, and more. Structured extraction with confidence scoring.",
  alternates: { canonical: "/funding" },
};

const SOURCE_LABELS: Record<string, string> = {
  techcrunch: "TechCrunch",
  "techcrunch-venture": "TC · Venture",
  venturebeat: "VentureBeat",
  sifted: "Sifted",
  telegram: "Telegram",
  twitter: "X / Twitter",
  x: "X / Twitter",
  reddit: "Reddit",
  submit: "Submitted",
  yc: "YC",
  newsapi: "NewsAPI",
  "crunchbase-venture": "Crunchbase News",
  "crunchbase-startups": "Crunchbase · Startups",
  alleywatch: "AlleyWatch",
  finsmes: "FinSMEs",
  techfundingnews: "Tech Funding News",
  techeu: "Tech.eu",
  pymnts: "PYMNTS",
  arstechnica: "Ars Technica",
  bbc: "BBC Tech",
  wired: "Wired",
  geekwire: "GeekWire",
  techstartups: "TechStartups",
  "eu-startups": "EU-Startups",
  siliconcanals: "Silicon Canals",
  "techcrunch-ai": "TC · AI",
  "venturebeat-ai": "VB · AI",
  "ai-news": "AI News",
  "ai-business": "AI Business",
  "the-decoder": "The Decoder",
  marktechpost: "MarkTechPost",
  "unite-ai": "Unite.AI",
  "analytics-india": "Analytics India",
  "mit-tech-review-ai": "MIT TR · AI",
  synced: "Synced",
  "prnewswire-vc": "PR Newswire VC",
  newcomer: "Newcomer",
  "ai-snake-oil": "AI Snake Oil",
  "generative-value": "Generative Value",
  "import-ai": "Import AI",
  "sec-form-d": "SEC Form D",
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
  if (!Number.isFinite(date.getTime())) return "—";
  // EPOCH_ZERO sentinel — source is offline / never fetched. Don't render
  // it as a clock-ish "warming" — let FreshnessBadge own the COLD verdict.
  if (value.startsWith("1970-")) return "—";
  return date.toISOString().slice(11, 19);
}

function formatAge(value: string): string {
  const t = Date.parse(value);
  if (!Number.isFinite(t)) return "unknown";
  const hours = Math.max(0, Math.floor((Date.now() - t) / 3_600_000));
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function sourceName(source: string): string {
  if (SOURCE_LABELS[source]) return SOURCE_LABELS[source];
  return source
    .replaceAll("-", " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
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

// Drop signals where the extractor pulled a non-company word as the
// company name (typically from listicle / "Exclusive: ..." headlines).
// These pollute the Top rounds chart — e.g. headline "Software: 10
// companies that raised the most in 2025" was extracting "Software"
// at $8.1B and rendering as the #1 row, making the page look broken.
//
// Conservative — we only drop entries whose companyName matches an
// English filler word OR whose headline matches a known roundup
// pattern. Real companies (Cursor, Anthropic, Mistral, ...) pass.
const JUNK_COMPANY_NAMES = new Set([
  "software",
  "exclusive",
  "how",
  "why",
  "what",
  "when",
  "the",
  "tech",
  "startup",
  "startups",
  "india",
  "china",
  "europe",
  "us",
  "uk",
  "eu",
]);
const ROUNDUP_HEADLINE_RE =
  /\b(companies that raised|startups that raised|raised the most|biggest fundraisers|fundraising roundup|weekly roundup|leftover fish skins)\b/i;
const LEADING_LABEL_RE = /^(exclusive|software|tech|crypto|ai|fintech|breaking)\s*[:\-]\s/i;

function isLikelyRoundup(signal: FundingSignal): boolean {
  const name = (signal.extracted?.companyName ?? "").toLowerCase().trim();
  if (!name) return true;
  if (JUNK_COMPANY_NAMES.has(name)) return true;
  if (ROUNDUP_HEADLINE_RE.test(signal.headline)) return true;
  if (LEADING_LABEL_RE.test(signal.headline)) return true;
  return false;
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
    .filter((signal) => !isLikelyRoundup(signal))
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
        // Route extractor logo inputs through the shared sanitizer so legacy
        // Clearbit URLs do not leak direct third-party image failures into UI.
        //
        // 2026-05-07: when neither companyLogoUrl nor companyWebsite is
        // present (~37% of signals — extractor pulled "Tallinn" / "Top
        // Startup" / author names as the company), fall through to the
        // source-article's favicon so every row still renders something
        // visual instead of EntityLogo's hash-coloured monogram tile.
        const explicit =
          signal.extracted?.companyLogoUrl ??
          signal.extracted?.companyWebsite ??
          null;
        const logoUrl =
          companyLogoUrl(explicit) ??
          resolveLogoUrl(
            signal.sourceUrl,
            signal.extracted?.companyName ?? null,
            64,
          );
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
    .filter((signal) => !isLikelyRoundup(signal))
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
    .slice(0, 8);
  const sources = sourceRows(signals).slice(0, 8);
  const megaRounds = rounds.filter((signal) => amountValue(signal) >= 100_000_000).length;
  const totalAmount = stats.totalAmountUsd ?? 0;

  // Mirror the FreshnessBadge's verdict on the VerdictRibbon so a COLD or
  // STALE feed doesn't ship a celebratory green ribbon. Same "skills"
  // source threshold as the badge (P2 #6 — intentional reuse) keeps the
  // two chrome signals aligned. Ribbon tones: money (green) when live,
  // amber when warn/cold (no `red` variant on VerdictRibbon).
  const fundingVerdict = classifyFreshness("skills", file.fetchedAt);
  const ribbonTone: VerdictTone =
    fundingVerdict.status === "live" ? "money" : "amber";

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

      <KpiBand
        className="kpi-band"
        cells={[
          {
            label: "CAPITAL",
            value: money(totalAmount),
            sub: `${file.windowDays}d parsed total`,
            tone: "money",
            pip: "var(--v4-money)",
          },
          {
            label: "MEGA",
            value: megaRounds,
            sub: "$100M+ rounds",
            tone: "acc",
            pip: "var(--v4-acc)",
          },
          {
            label: "THIS WEEK",
            value: stats.thisWeekCount,
            sub: "fresh items",
            tone: "acc",
            pip: "var(--v4-blue)",
          },
          {
            label: "EXTRACTED",
            value: extracted,
            sub: `of ${signals.length} signals`,
            tone: "money",
            pip: "var(--v4-money)",
          },
          {
            label: "CONFIDENCE",
            value: highConfidence,
            sub: `${mediumConfidence} medium`,
            tone: "amber",
            pip: "var(--v4-amber)",
          },
          {
            label: "SOURCES",
            value: sources.length,
            sub: "feeds firing",
            pip: "var(--v4-ink-300)",
          },
        ]}
      />

      <VerdictRibbon
        tone={ribbonTone}
        stamp={{
          eyebrow: "// CAPITAL RADAR",
          headline: (
            <span
              style={{
                fontSize: "var(--v4-text-34)",
                fontWeight: 600,
                letterSpacing: "0.02em",
                color: "var(--v4-money)",
                lineHeight: 1.1,
              }}
            >
              {money(totalAmount)}
            </span>
          ),
          sub: `${megaRounds} mega · ${extracted} extracted · ${file.windowDays}d window · computed ${computed} UTC`,
        }}
        text={
          <>
            <b>{signals.length} funding signals</b> in the current window —{" "}
            <span style={{ color: "var(--v4-money)" }}>{money(totalAmount)} parsed</span> across{" "}
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

      {signals.length === 0 ? (
        <EmptyState cold={cold} />
      ) : (
        <>
          {/* // 01 — Just-published tape. Promoted from // 03 (A6-P5) so
              the freshest funding signals sit right under the verdict
              ribbon — matches the mockup's "tape strip near the top"
              brief. Uses the 6 newest items as a strip; sector tags
              move to // 04 below. */}
          <SectionHead
            num="// 01"
            title="Just-published"
            meta={
              <>
                <b>{Math.min(6, recent.length)}</b> · live tape
              </>
            }
          />
          <Card>
            <CardHeader showCorner right={<span>newest feed</span>}>
              News tape
            </CardHeader>
            {recent.slice(0, 6).map((signal, index) => (
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
                {(() => {
                  const c = signal.extracted?.confidence ?? "none";
                  // Match the freshness-honesty contract: a chip class
                  // should reflect the value it labels, not always green.
                  // high → up (green), medium → neutral, low/none → dn.
                  const cls =
                    c === "high"
                      ? "delta up"
                      : c === "medium"
                        ? "delta"
                        : "delta dn";
                  return (
                    <span className={cls}>
                      {c}
                      <span className="lbl">confidence</span>
                    </span>
                  );
                })()}
              </Link>
            ))}
          </Card>

          {/* // 02 — Top rounds windowed board. Row-level detail
              ("who just raised and how much"). */}
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

          {/* // 03 — Aggregate volume + source mix. Round volume bars are
              all-time (within window), source mix shows feed distribution. */}
          <SectionHead
            num="// 03"
            title="Volume & source mix"
            meta={
              <>
                <b>{topRounds.length}</b> · all-time · {sources.length} feeds
              </>
            }
          />
          <div className="grid">
            <Card className="col-8 funding-chart">
              <CardHeader showCorner right={<span>{money(totalAmount)} parsed · all-time</span>}>
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
              <FundingSourcePillRow
                rows={sources.map((source) => ({
                  source: source.source,
                  count: source.count,
                  label: sourceName(source.source),
                }))}
                total={signals.length}
                limit={8}
              />
            </Card>
          </div>

          {/* // 04 — Sector tags. Companion to the promoted Just-published
              tape (// 01); kept below the heavier analytical blocks so the
              page still surfaces the tag cloud. */}
          <SectionHead
            num="// 04"
            title="Sector tags"
            meta={
              <>
                <b>cloud</b> · across all signals
              </>
            }
          />
          <Card>
            <CardHeader showCorner right={<span>tags</span>}>
              Sector tags
            </CardHeader>
            <div className="tag-cloud">
              {Array.from(new Set(signals.flatMap((signal) => signal.tags))).slice(0, 24).map((tag) => (
                <span className="chip" key={tag}>{tag}</span>
              ))}
            </div>
          </Card>
        </>
      )}
    </main>
  );
}
