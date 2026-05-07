// /funding/_health — per-source freshness dashboard for the four funding slugs.
//
// Diagnostic-only. NOT linked from public nav. Internal use only.
//
// Reads each of the four funding slugs (`funding-news`, `funding-news-crunchbase`,
// `funding-news-x`, `funding-news-sec`) directly via `getDataStore().read()` and
// surfaces:
//   - last fetchedAt (and age vs. now)
//   - signal count
//   - per-platform breakdown (sourcePlatform → count, oldest/newest signal age)
//   - colour-coded status pill: green (<4h), amber (4-24h), red (>24h or missing)
//
// The /funding page reads the same four slugs; when one stops producing the
// page silently degrades. This dashboard surfaces the per-slug truth so the
// operator can spot a stuck collector before the page itself goes dark.
//
// Server component, dynamic, revalidate=30s. No client-side polling — the
// "Refresh" anchor just re-navigates.
//
// Created 2026-05-07.
import type { Metadata } from "next";
import Link from "next/link";

import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { KpiBand } from "@/components/ui/KpiBand";
import { PageHead } from "@/components/ui/PageHead";
import { SectionHead } from "@/components/ui/SectionHead";
import { getDataStore } from "@/lib/data-store";
import type { FundingNewsFile, FundingSignal } from "@/lib/funding/types";

export const metadata: Metadata = {
  title: "Funding · Health Dashboard",
  description:
    "Per-source freshness dashboard for the four funding-news data-store slugs. Internal diagnostic.",
  robots: { index: false, follow: false },
  alternates: { canonical: "/funding/_health" },
};

export const dynamic = "force-dynamic";
export const revalidate = 30;

// ---------------------------------------------------------------------------
// Slug catalog — keep in sync with refreshFundingNewsFromStore() in
// src/lib/funding-news.ts. Each entry describes the slug + the cadence the
// operator should expect, so a slow source (SEC = 2h) doesn't show red just
// because the budget was wrong.
// ---------------------------------------------------------------------------

interface SlugSpec {
  slug: string;
  label: string;
  description: string;
  expectedCadenceLabel: string;
}

const SLUGS: SlugSpec[] = [
  {
    slug: "funding-news",
    label: "funding-news",
    description:
      "Primary RSS aggregator — TechCrunch, VentureBeat, Sifted, Tech.eu, AI feeds, niche outlets.",
    expectedCadenceLabel: "every 2h via GHA cron",
  },
  {
    slug: "funding-news-crunchbase",
    label: "funding-news-crunchbase",
    description:
      "Crunchbase News + AlleyWatch + FinSMEs + TechFundingNews + TC Venture.",
    expectedCadenceLabel: "every 2h via GHA cron",
  },
  {
    slug: "funding-news-x",
    label: "funding-news-x",
    description:
      "Apify Twitter funding-hashtag scraper. Lower volume, runs less often than RSS.",
    expectedCadenceLabel: "twice daily",
  },
  {
    slug: "funding-news-sec",
    label: "funding-news-sec",
    description:
      "SEC EDGAR Form D filings, AI-keyword filtered. Ground-truth — every US private round.",
    expectedCadenceLabel: "every 2h via GHA cron",
  },
];

// ---------------------------------------------------------------------------
// Status thresholds (matched to the spec):
//   green: <4h
//   amber: 4-24h
//   red:   >24h or missing
// ---------------------------------------------------------------------------

const FRESH_THRESHOLD_MS = 4 * 60 * 60 * 1000; // 4h
const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24h

type StatusTone = "green" | "amber" | "red";

interface PlatformRow {
  platform: string;
  count: number;
  oldestPublishedAt: string | null;
  newestPublishedAt: string | null;
}

interface SlugReport {
  spec: SlugSpec;
  found: boolean;
  source: "redis" | "file" | "memory" | "missing";
  fetchedAt: string | null;
  ageMs: number | null;
  signalCount: number;
  windowDays: number | null;
  platforms: PlatformRow[];
  status: StatusTone;
}

// ---------------------------------------------------------------------------
// Read + normalize one slug. Defensive: every parse failure degrades to a
// "missing" report rather than throwing — this page MUST render even when
// the underlying data-store is broken.
// ---------------------------------------------------------------------------

function isFundingFile(value: unknown): value is FundingNewsFile {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<FundingNewsFile>;
  return Array.isArray(v.signals);
}

function platformBreakdown(signals: FundingSignal[]): PlatformRow[] {
  const counts = new Map<
    string,
    { count: number; oldestMs: number; newestMs: number }
  >();
  for (const signal of signals) {
    const key = signal.sourcePlatform || "unknown";
    const t = Date.parse(signal.publishedAt);
    const valid = Number.isFinite(t);
    const entry = counts.get(key);
    if (entry) {
      entry.count += 1;
      if (valid && t < entry.oldestMs) entry.oldestMs = t;
      if (valid && t > entry.newestMs) entry.newestMs = t;
    } else {
      counts.set(key, {
        count: 1,
        oldestMs: valid ? t : Number.POSITIVE_INFINITY,
        newestMs: valid ? t : Number.NEGATIVE_INFINITY,
      });
    }
  }
  return Array.from(counts.entries())
    .map(([platform, e]) => ({
      platform,
      count: e.count,
      oldestPublishedAt: Number.isFinite(e.oldestMs)
        ? new Date(e.oldestMs).toISOString()
        : null,
      newestPublishedAt: Number.isFinite(e.newestMs)
        ? new Date(e.newestMs).toISOString()
        : null,
    }))
    .sort((a, b) => b.count - a.count);
}

function classifyStatus(ageMs: number | null, found: boolean): StatusTone {
  if (!found || ageMs === null) return "red";
  if (ageMs < FRESH_THRESHOLD_MS) return "green";
  if (ageMs < STALE_THRESHOLD_MS) return "amber";
  return "red";
}

async function buildReport(spec: SlugSpec): Promise<SlugReport> {
  const store = getDataStore();
  const result = await store.read<unknown>(spec.slug);
  const found = result.source !== "missing" && result.data !== null;
  if (!found || !isFundingFile(result.data)) {
    return {
      spec,
      found: false,
      source: result.source,
      fetchedAt: null,
      ageMs: null,
      signalCount: 0,
      windowDays: null,
      platforms: [],
      status: classifyStatus(null, false),
    };
  }
  const file = result.data;
  // Prefer payload-level fetchedAt when present (the writer stamps it inside
  // the JSON). Fall back to the data-store's writtenAt for age computation
  // when fetchedAt is missing or the EPOCH_ZERO sentinel.
  const fetchedAtCandidate =
    file.fetchedAt && !file.fetchedAt.startsWith("1970-")
      ? file.fetchedAt
      : (result.writtenAt ?? null);
  const fetchedAtMs = fetchedAtCandidate
    ? Date.parse(fetchedAtCandidate)
    : NaN;
  const ageMs = Number.isFinite(fetchedAtMs)
    ? Math.max(0, Date.now() - fetchedAtMs)
    : null;
  return {
    spec,
    found: true,
    source: result.source,
    fetchedAt: fetchedAtCandidate,
    ageMs,
    signalCount: file.signals.length,
    windowDays: typeof file.windowDays === "number" ? file.windowDays : null,
    platforms: platformBreakdown(file.signals),
    status: classifyStatus(ageMs, true),
  };
}

// ---------------------------------------------------------------------------
// Format helpers (no library dep — keep this page hermetic).
// ---------------------------------------------------------------------------

function formatAgeMs(ageMs: number | null): string {
  if (ageMs === null) return "unknown";
  const seconds = Math.floor(ageMs / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const remMin = minutes % 60;
    return remMin > 0 ? `${hours}h ${remMin}m` : `${hours}h`;
  }
  const days = Math.floor(hours / 24);
  const remHr = hours % 24;
  return remHr > 0 ? `${days}d ${remHr}h` : `${days}d`;
}

function formatTimestamp(value: string | null): string {
  if (!value) return "—";
  const t = Date.parse(value);
  if (!Number.isFinite(t)) return value;
  return new Date(t).toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

function statusColor(status: StatusTone): string {
  switch (status) {
    case "green":
      return "var(--v4-money, #22c55e)";
    case "amber":
      return "var(--v4-amber, #fbbf24)";
    case "red":
      return "var(--v4-red, #f87171)";
  }
}

function statusLabel(status: StatusTone): string {
  switch (status) {
    case "green":
      return "FRESH";
    case "amber":
      return "STALE";
    case "red":
      return "COLD";
  }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function FundingHealthPage() {
  const reports = await Promise.all(SLUGS.map((spec) => buildReport(spec)));
  const now = new Date();
  const computed = now.toISOString().slice(11, 19);
  const greenCount = reports.filter((r) => r.status === "green").length;
  const amberCount = reports.filter((r) => r.status === "amber").length;
  const redCount = reports.filter((r) => r.status === "red").length;
  const totalSignals = reports.reduce((acc, r) => acc + r.signalCount, 0);
  const totalPlatforms = new Set(
    reports.flatMap((r) => r.platforms.map((p) => p.platform)),
  ).size;

  return (
    <main className="home-surface">
      <PageHead
        crumb={
          <>
            <b>FUNDING</b> · HEALTH · /FUNDING/_HEALTH
          </>
        }
        h1="Per-source freshness."
        lede="Diagnostic dashboard for the four funding-news data-store slugs. One section per slug, with last-fetch age, signal count, and per-platform breakdown. Server-rendered, revalidates every 30s."
        clock={
          <>
            <span className="big">{computed}</span>
            <span className="muted">UTC · COMPUTED</span>
            <Link
              href="/funding/_health"
              prefetch={false}
              className="v2-mono"
              style={{
                display: "inline-block",
                marginTop: 6,
                fontSize: 11,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "var(--v4-acc, #60a5fa)",
              }}
            >
              ↻ Refresh
            </Link>
          </>
        }
      />

      <KpiBand
        className="kpi-band"
        cells={[
          {
            label: "FRESH",
            value: greenCount,
            sub: "<4h",
            tone: "money",
            pip: statusColor("green"),
          },
          {
            label: "STALE",
            value: amberCount,
            sub: "4-24h",
            tone: "amber",
            pip: statusColor("amber"),
          },
          {
            label: "COLD",
            value: redCount,
            sub: ">24h or missing",
            tone: "red",
            pip: statusColor("red"),
          },
          {
            label: "SLUGS",
            value: reports.length,
            sub: "tracked",
            pip: "var(--v4-ink-300)",
          },
          {
            label: "SIGNALS",
            value: totalSignals,
            sub: "across all slugs",
            tone: "acc",
            pip: "var(--v4-blue, #60a5fa)",
          },
          {
            label: "PLATFORMS",
            value: totalPlatforms,
            sub: "distinct sources",
            pip: "var(--v4-ink-300)",
          },
        ]}
      />

      {reports.map((report, index) => (
        <SlugSection
          key={report.spec.slug}
          report={report}
          ordinal={index + 1}
        />
      ))}
    </main>
  );
}

// ---------------------------------------------------------------------------
// One slug section: header (title + status pill), summary row, platform table.
// ---------------------------------------------------------------------------

function SlugSection({
  report,
  ordinal,
}: {
  report: SlugReport;
  ordinal: number;
}) {
  const num = `// ${String(ordinal).padStart(2, "0")}`;
  return (
    <>
      <SectionHead
        num={num}
        title={
          <span style={{ display: "inline-flex", alignItems: "center", gap: 12 }}>
            <span>{report.spec.label}</span>
            <StatusPill status={report.status} />
          </span>
        }
        meta={
          <>
            <b>{report.signalCount}</b> signals · {report.spec.expectedCadenceLabel}
          </>
        }
      />
      <Card>
        <CardHeader
          showCorner
          right={
            <span className="v2-mono" style={{ fontSize: 11 }}>
              source: {report.source}
              {report.windowDays !== null
                ? ` · window: ${report.windowDays}d`
                : ""}
            </span>
          }
        >
          {report.spec.description}
        </CardHeader>
        <CardBody>
          <SummaryRow report={report} />
          <PlatformTable report={report} />
        </CardBody>
      </Card>
    </>
  );
}

function StatusPill({ status }: { status: StatusTone }) {
  const color = statusColor(status);
  return (
    <span
      className="v2-mono"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "3px 10px",
        borderRadius: 999,
        border: `1px solid ${color}`,
        color,
        fontSize: 10,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        background: "transparent",
        lineHeight: 1,
      }}
      role="status"
      aria-label={`status ${statusLabel(status)}`}
    >
      <span
        aria-hidden="true"
        style={{
          display: "inline-block",
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: color,
        }}
      />
      {statusLabel(status)}
    </span>
  );
}

function SummaryRow({ report }: { report: SlugReport }) {
  return (
    <div
      className="v2-mono"
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
        gap: 16,
        fontSize: 12,
        padding: "8px 0 16px",
        borderBottom: "1px solid var(--v3-line-100, rgba(255,255,255,0.08))",
      }}
    >
      <Field
        label="Last fetchedAt"
        value={formatTimestamp(report.fetchedAt)}
        muted={!report.found}
      />
      <Field
        label="Age"
        value={formatAgeMs(report.ageMs)}
        valueColor={statusColor(report.status)}
      />
      <Field label="Signals" value={String(report.signalCount)} />
    </div>
  );
}

function Field({
  label,
  value,
  valueColor,
  muted,
}: {
  label: string;
  value: string;
  valueColor?: string;
  muted?: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span
        style={{
          fontSize: 10,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "var(--v3-ink-400, rgba(255,255,255,0.55))",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 13,
          fontVariantNumeric: "tabular-nums",
          color:
            valueColor ??
            (muted
              ? "var(--v3-ink-400, rgba(255,255,255,0.55))"
              : "var(--v3-ink-100, #fff)"),
        }}
      >
        {value}
      </span>
    </div>
  );
}

function PlatformTable({ report }: { report: SlugReport }) {
  if (report.platforms.length === 0) {
    return (
      <p
        className="v2-mono"
        style={{
          fontSize: 12,
          padding: "16px 0 0",
          color: "var(--v3-ink-400, rgba(255,255,255,0.55))",
        }}
      >
        {report.found
          ? "Payload found but no signals — collector ran but window is empty."
          : "No payload — collector has not produced data, or Redis miss in every tier."}
      </p>
    );
  }
  return (
    <div style={{ paddingTop: 16, overflowX: "auto" }}>
      <table
        className="v2-mono"
        style={{
          width: "100%",
          fontSize: 12,
          borderCollapse: "collapse",
        }}
      >
        <thead>
          <tr
            style={{
              borderBottom: "1px solid var(--v3-line-100, rgba(255,255,255,0.08))",
            }}
          >
            <Th>Platform</Th>
            <Th align="right">Count</Th>
            <Th align="right">Oldest signal</Th>
            <Th align="right">Newest signal</Th>
          </tr>
        </thead>
        <tbody>
          {report.platforms.map((row) => (
            <tr
              key={row.platform}
              style={{
                borderBottom:
                  "1px solid var(--v3-line-050, rgba(255,255,255,0.05))",
              }}
            >
              <Td>
                <span style={{ color: "var(--v3-ink-100, #fff)" }}>
                  {row.platform}
                </span>
              </Td>
              <Td align="right">
                <span style={{ fontVariantNumeric: "tabular-nums" }}>
                  {row.count}
                </span>
              </Td>
              <Td align="right">
                <SignalAge isoDate={row.oldestPublishedAt} />
              </Td>
              <Td align="right">
                <SignalAge isoDate={row.newestPublishedAt} />
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SignalAge({ isoDate }: { isoDate: string | null }) {
  if (!isoDate) {
    return (
      <span style={{ color: "var(--v3-ink-400, rgba(255,255,255,0.55))" }}>
        —
      </span>
    );
  }
  const t = Date.parse(isoDate);
  if (!Number.isFinite(t)) {
    return (
      <span style={{ color: "var(--v3-ink-400, rgba(255,255,255,0.55))" }}>
        invalid
      </span>
    );
  }
  const ageMs = Date.now() - t;
  return (
    <span
      title={isoDate}
      style={{
        fontVariantNumeric: "tabular-nums",
        color:
          ageMs < FRESH_THRESHOLD_MS
            ? "var(--v3-ink-100, #fff)"
            : "var(--v3-ink-300, rgba(255,255,255,0.75))",
      }}
    >
      {formatAgeMs(ageMs)} ago
    </span>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      style={{
        padding: "8px 12px",
        fontSize: 10,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        textAlign: align,
        fontWeight: 400,
        color: "var(--v3-ink-400, rgba(255,255,255,0.55))",
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <td
      style={{
        padding: "8px 12px",
        textAlign: align,
        color: "var(--v3-ink-200, rgba(255,255,255,0.85))",
      }}
    >
      {children}
    </td>
  );
}
