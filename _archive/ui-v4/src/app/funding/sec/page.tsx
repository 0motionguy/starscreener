// /funding/sec — dedicated SEC Form D filings feed.
//
// The trending /funding page merges 4 funding slugs and Form D filings lose
// ranking there because they have no `extracted.amount` (today). This page
// surfaces every Form D filing on its own with filing-specific metadata
// (confidence pill, EDGAR ground-truth framing).
//
// Data path: ONLY the `funding-news-sec` Redis slug (not the 4-slug merger).
//   getDataStore().read("funding-news-sec") → 3-tier read with file fallback
//   src/lib/funding/sec-form-d.ts owns the cache + refresh hook.
//
// Renders newest-first with row-level confidence + filing date columns.
// EntityLogo per row resolves to a domain-favicon when extracted.companyWebsite
// becomes available; falls back to sec.gov favicon then deterministic monogram.

import type { Metadata } from "next";
import Link from "next/link";

import { PageHead } from "@/components/ui/PageHead";
import { KpiBand } from "@/components/ui/KpiBand";
import { VerdictRibbon } from "@/components/ui/VerdictRibbon";
import { FreshnessBadge } from "@/components/shared/FreshnessBadge";
import { EntityLogo } from "@/components/ui/EntityLogo";
import {
  TerminalFeedTable,
  type FeedColumn,
} from "@/components/feed/TerminalFeedTable";
import { resolveLogoUrl } from "@/lib/logo-url";
import {
  getSecFormDFile,
  getSecFormDSignals,
  isSecFormDCold,
  refreshSecFormDFromStore,
} from "@/lib/funding/sec-form-d";
import type { FundingSignal } from "@/lib/funding/types";

// 30-min ISR — the SEC scraper runs on a slow cron and Form D filings only
// land at most once a day per company. No need for warmer cadence.
export const revalidate = 1800;

export const metadata: Metadata = {
  title: "TrendingRepo — SEC Form D filings (AI)",
  description:
    "Every US private offering by an AI-tagged issuer, filed within 15 days of close. EDGAR ground truth — the long tail of AI funding journalists never write about.",
  alternates: { canonical: "/funding/sec" },
};

// Brand color — SEC.gov navy. No --v4-src-sec token exists, so hardcode here.
const SEC_NAVY = "#0f3a6c";
const SEC_FAVICON = "https://www.google.com/s2/favicons?domain=sec.gov&sz=64";

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

function formatClock(iso: string | undefined): string {
  if (!iso) return "warming";
  const date = new Date(iso);
  return Number.isFinite(date.getTime())
    ? date.toISOString().slice(11, 19)
    : "warming";
}

function formatFilingDate(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  // Form D dates are filing-day granularity (no useful time component).
  // YYYY-MM-DD is the canonical EDGAR display format.
  return new Date(t).toISOString().slice(0, 10);
}

function formatAge(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  const ageMs = Math.max(0, Date.now() - t);
  if (ageMs < DAY_MS) {
    const h = Math.max(1, Math.floor(ageMs / HOUR_MS));
    return `${h}h ago`;
  }
  return `${Math.floor(ageMs / DAY_MS)}d ago`;
}

function withinMs(signals: FundingSignal[], windowMs: number): number {
  const now = Date.now();
  return signals.filter((s) => {
    const t = Date.parse(s.publishedAt);
    return Number.isFinite(t) && now - t <= windowMs;
  }).length;
}

function confidenceCount(
  signals: FundingSignal[],
  confidence: "high" | "medium" | "low",
): number {
  return signals.filter((s) => s.extracted?.confidence === confidence).length;
}

interface ConfidencePillProps {
  level: "high" | "medium" | "low" | "none";
}

function ConfidencePill({ level }: ConfidencePillProps) {
  const tone =
    level === "high"
      ? { color: "var(--v4-money)", label: "HIGH" }
      : level === "medium"
        ? { color: "var(--v4-amber)", label: "MED" }
        : level === "low"
          ? { color: "var(--v4-ink-300)", label: "LOW" }
          : { color: "var(--v4-ink-400)", label: "—" };
  return (
    <span
      className="v2-mono"
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "1px 6px",
        fontSize: 9.5,
        letterSpacing: "0.16em",
        fontWeight: 600,
        color: tone.color,
        border: `1px solid ${tone.color}`,
        borderRadius: 2,
        textTransform: "uppercase",
      }}
    >
      {tone.label}
    </span>
  );
}

function EmptyState({ cold }: { cold: boolean }) {
  return (
    <section
      style={{
        padding: 32,
        background: "var(--v4-bg-025)",
        border: "1px dashed var(--v4-line-100)",
        borderRadius: 2,
      }}
    >
      <h2
        className="v2-mono"
        style={{
          color: SEC_NAVY,
          fontSize: 18,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.18em",
        }}
      >
        {"// no sec form d filings yet"}
      </h2>
      <p
        style={{
          marginTop: 12,
          maxWidth: "32rem",
          fontSize: 13,
          color: "var(--v4-ink-300)",
        }}
      >
        {cold
          ? "The SEC EDGAR scraper has not produced data yet. Run "
          : "The scraper ran but found no AI-tagged Form D filings in the current window. Run "}
        <code style={{ color: "var(--v4-ink-100)" }}>
          node scripts/scrape-sec-form-d.mjs
        </code>{" "}
        locally to populate{" "}
        <code style={{ color: "var(--v4-ink-100)" }}>
          data/funding-news-sec.json
        </code>
        , then refresh this page.
      </p>
    </section>
  );
}

export default async function FundingSecPage() {
  await refreshSecFormDFromStore();
  const file = getSecFormDFile();
  const signals = getSecFormDSignals();
  const cold = isSecFormDCold(file);

  // Sort newest-first by publishedAt (filing date).
  const sorted = signals
    .slice()
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));

  const total = sorted.length;
  const highCount = confidenceCount(sorted, "high");
  const within7d = withinMs(sorted, 7 * DAY_MS);
  const within30d = withinMs(sorted, 30 * DAY_MS);
  const computed = formatClock(file.fetchedAt);

  const columns: FeedColumn<FundingSignal>[] = [
    {
      id: "rank",
      header: "#",
      width: "44px",
      align: "left",
      render: (_, i) => (
        <span
          className="font-mono text-[12px] tabular-nums font-semibold"
          style={{ color: i < 10 ? SEC_NAVY : "var(--v4-ink-400)" }}
        >
          {String(i + 1).padStart(2, "0")}
        </span>
      ),
    },
    {
      id: "issuer",
      header: "Issuer",
      align: "left",
      render: (signal) => {
        const name = signal.extracted?.companyName || signal.headline;
        // Logo resolution per spec: resolveLogoUrl(sourceUrl, companyName, 64).
        // For SEC filings the sourceUrl is the EDGAR detail link
        // (sec.gov/cgi-bin/browse-edgar?...), which resolves to the SEC
        // favicon when the company-name guess fails — every row gets a
        // visible logo even though Form D filings don't carry a website.
        const logoUrl =
          resolveLogoUrl(
            signal.sourceUrl,
            signal.extracted?.companyName ?? null,
            64,
          ) ?? SEC_FAVICON;
        return (
          <div className="flex min-w-0 items-center gap-2">
            <EntityLogo
              src={logoUrl}
              name={name}
              size={24}
              shape="square"
              alt=""
            />
            <a
              href={signal.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="truncate text-[13px] font-medium transition-colors hover:text-[color:var(--v4-acc)]"
              style={{ color: "var(--v4-ink-100)" }}
              title={`${name} — ${signal.headline}`}
            >
              {name}
            </a>
          </div>
        );
      },
    },
    {
      id: "filed",
      header: "Filed",
      width: "110px",
      align: "left",
      hideBelow: "sm",
      render: (signal) => (
        <span
          className="font-mono text-[11px] tabular-nums"
          style={{ color: "var(--v4-ink-200)" }}
          title={signal.publishedAt}
        >
          {formatFilingDate(signal.publishedAt)}
        </span>
      ),
    },
    {
      id: "age",
      header: "Age",
      width: "70px",
      align: "right",
      hideBelow: "md",
      render: (signal) => (
        <span
          className="font-mono text-[11px] tabular-nums"
          style={{ color: "var(--v4-ink-400)" }}
        >
          {formatAge(signal.publishedAt)}
        </span>
      ),
    },
    {
      id: "amount",
      header: "Amount",
      width: "110px",
      align: "right",
      hideBelow: "md",
      render: (signal) => {
        const display = signal.extracted?.amountDisplay;
        const amt = signal.extracted?.amount;
        // Render dash when amount is null or sentinel "Undisclosed".
        if (!amt || !display || display === "Undisclosed") {
          return (
            <span
              className="font-mono text-[12px]"
              style={{ color: "var(--v4-ink-500)" }}
            >
              —
            </span>
          );
        }
        return (
          <span
            className="font-mono text-[12px] tabular-nums font-semibold"
            style={{ color: "var(--v4-money)" }}
          >
            {display}
          </span>
        );
      },
    },
    {
      id: "confidence",
      header: "Conf",
      width: "72px",
      align: "right",
      render: (signal) => (
        <ConfidencePill level={signal.extracted?.confidence ?? "none"} />
      ),
    },
    {
      id: "source",
      header: "Source",
      width: "60px",
      align: "right",
      hideBelow: "sm",
      render: (signal) => (
        <a
          href={signal.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="v2-mono text-[10px] tracking-[0.14em] uppercase transition-colors hover:text-[color:var(--v4-acc)]"
          style={{ color: "var(--v4-ink-400)" }}
          title="Open EDGAR filing"
        >
          edgar →
        </a>
      ),
    },
  ];

  return (
    <main className="home-surface funding-page">
      <PageHead
        crumb={
          <>
            <b>FUNDING</b> · TERMINAL · /FUNDING/SEC
          </>
        }
        h1="SEC Form D filings (AI)"
        lede="Every US private offering by an AI-tagged issuer, filed within 15 days of close. EDGAR ground truth."
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
            label: "FILINGS",
            value: total.toLocaleString("en-US"),
            sub: `${file.windowDays}d window`,
            pip: SEC_NAVY,
          },
          {
            label: "HIGH CONF",
            value: highCount,
            sub: "ai-confirmed",
            tone: "money",
            pip: "var(--v4-money)",
          },
          {
            label: "WITHIN 7D",
            value: within7d,
            sub: "fresh filings",
            tone: "acc",
            pip: "var(--v4-acc)",
          },
          {
            label: "WITHIN 30D",
            value: within30d,
            sub: "rolling tape",
            pip: "var(--v4-blue)",
          },
        ]}
      />

      <VerdictRibbon
        tone="money"
        stamp={{
          eyebrow: "// EDGAR GROUND TRUTH",
          headline: `${total} filings · ${highCount} AI-confirmed`,
          sub: `${file.windowDays}d window · computed ${computed} UTC`,
        }}
        text={
          <>
            <b>{total} Form D filings</b> in the current window —{" "}
            <span style={{ color: "var(--v4-money)" }}>{highCount} high-confidence</span>{" "}
            AI-tagged issuers, with{" "}
            <span style={{ color: "var(--v4-acc)" }}>{within7d}</span> filed in the
            last 7 days. Every US private round files Form D within 15 days of
            close — this captures the long tail journalists never cover.
          </>
        }
        actionHref="https://efts.sec.gov/LATEST/search-index?q=%22artificial+intelligence%22&forms=D"
        actionLabel="EDGAR →"
      />

      {sorted.length === 0 ? (
        <EmptyState cold={cold} />
      ) : (
        <>
          <div style={{ marginTop: 16 }}>
            <p
              className="v2-mono"
              style={{
                fontSize: 10,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "var(--v4-ink-400)",
                marginBottom: 8,
              }}
            >
              Filing tape · newest first ·{" "}
              <Link
                href="/funding"
                className="hover:text-[color:var(--v4-acc)]"
                style={{ color: "var(--v4-ink-300)" }}
              >
                ← back to /funding
              </Link>
            </p>
          </div>
          <TerminalFeedTable
            rows={sorted}
            columns={columns}
            rowKey={(signal) => signal.id}
            accent={SEC_NAVY}
            caption="SEC Form D filings by AI-tagged issuers, newest first"
            emptyTitle="No filings in this window"
          />
        </>
      )}
    </main>
  );
}
