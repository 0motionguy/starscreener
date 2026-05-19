// Admin — shadow-scoring comparison report.
//
// Reads the `scoring-shadow-report` payload from the data-store (written
// nightly by scripts/run-shadow-scoring.mjs) and renders a per-domain
// side-by-side table: prod top-50 vs shadow top-50 with rank-correlation
// stats and the cutover-gate verdict.
//
// Auth: mirrors the cookie-session pattern used by the other admin routes
// (src/app/admin/page.tsx, src/app/admin/ideas-queue/page.tsx). Same redirect
// to /admin/login on miss.

import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  TerminalFeedTable,
  type FeedColumn,
} from "@/components/feed/TerminalFeedTable";
import {
  ADMIN_SESSION_COOKIE_NAME,
  verifyAdminSession,
} from "@/lib/api/admin-session";
import { getDataStore } from "@/lib/data-store";

export const metadata: Metadata = {
  title: "Admin — Scoring Shadow Report",
  description:
    "Side-by-side prod vs shadow ranking comparison per domain. Spearman ρ, Kendall τ, top-10 churn, cutover-gate verdict.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

// Loose schemas — the runner is the authoritative writer; we coerce
// defensively so a partially-written report still renders.
interface RankingEntry {
  id: string;
  title: string;
  momentum: number;
  rank: number;
}

interface RankChange {
  id: string;
  title: string;
  prodRank: number;
  shadowRank: number;
  delta: number;
  prodMomentum: number;
  shadowMomentum: number;
}

interface DomainReport {
  domainKey: string;
  sourceSlug?: string;
  prodTop50: RankingEntry[];
  shadowTop50: RankingEntry[];
  spearmanRho: number;
  kendallTau: number;
  setOverlapTop50: number;
  top10Churn: number;
  rankChanges: RankChange[];
  generatedAt: string;
  cutoverGatePass: boolean;
  cutoverGateReason: string;
}

interface ShadowReportPayload {
  generatedAt: string;
  reports: DomainReport[];
  skipped?: { domainKey: string; slug: string; reason: string }[];
  notes?: Record<string, unknown>;
}

const ACCENT = "#ff6b35"; // terminal-orange — matches admin chrome

export default async function ScoringShadowAdminPage() {
  const cookieStore = await cookies();
  const session = cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value ?? null;
  if (!verifyAdminSession(session)) {
    redirect("/admin/login?next=/admin/scoring-shadow");
  }

  const store = getDataStore();
  const result = await store.read<ShadowReportPayload>("scoring-shadow-report");
  const payload = result.data;

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-10">
      <header className="mb-8">
        <p
          className="v2-mono text-[10px] tracking-[0.22em] uppercase"
          style={{ color: "var(--v3-ink-400)" }}
        >
          Admin / Scoring Shadow
        </p>
        <h1
          className="mt-1 text-[28px] leading-tight"
          style={{ color: "var(--v3-ink-100)" }}
        >
          Production vs shadow ranking comparison
        </h1>
        <p
          className="mt-2 text-[13px] max-w-3xl"
          style={{ color: "var(--v3-ink-300)" }}
        >
          Each row is one domain. The table on the left is the production
          top-50; on the right is the shadow top-50 (re-scored with mutated
          weights). Cutover gate compares Spearman ρ ≥ 0.6 and top-10 overlap
          ≥ 5/10 for baselined domains (skill, mcp). Greenfield domains pass
          unconditionally.
        </p>
        {payload?.generatedAt ? (
          <p
            className="v2-mono mt-3 text-[10px] tracking-[0.18em] uppercase"
            style={{ color: "var(--v3-ink-400)" }}
          >
            generated {payload.generatedAt} · source {result.source}
            {result.fresh ? "" : " (stale)"}
          </p>
        ) : null}
      </header>

      {!payload || !Array.isArray(payload.reports) || payload.reports.length === 0 ? (
        <EmptyState
          source={result.source}
          message={
            result.source === "missing"
              ? "No shadow report found. Run scripts/run-shadow-scoring.mjs (or wait for the daily 02:00 UTC workflow)."
              : "Shadow report payload was empty."
          }
        />
      ) : (
        <div className="space-y-12">
          {payload.reports.map((report) => (
            <DomainReportSection key={`${report.domainKey}:${report.sourceSlug ?? ""}`} report={report} />
          ))}
        </div>
      )}

      {payload?.skipped && payload.skipped.length > 0 ? (
        <section className="mt-12">
          <h2
            className="v2-mono text-[11px] tracking-[0.2em] uppercase"
            style={{ color: "var(--v3-ink-300)" }}
          >
            Skipped domains
          </h2>
          <ul className="mt-3 space-y-1 text-[12px]" style={{ color: "var(--v3-ink-300)" }}>
            {payload.skipped.map((s) => (
              <li key={`${s.domainKey}:${s.slug}`}>
                <span className="v2-mono">{s.slug}</span> ({s.domainKey}) — {s.reason}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function DomainReportSection({ report }: { report: DomainReport }) {
  const overlapPct = Math.round(report.setOverlapTop50 * 100);
  const top10Overlap = 10 - report.top10Churn;
  const gateColor = report.cutoverGatePass ? "#34d399" : "#f87171";

  const rankingColumns: FeedColumn<RankingEntry>[] = [
    {
      id: "rank",
      header: "#",
      width: "44px",
      align: "right",
      render: (row) => (
        <span className="v2-mono text-[11px]" style={{ color: "var(--v3-ink-400)" }}>
          {row.rank}
        </span>
      ),
    },
    {
      id: "title",
      header: "Item",
      render: (row) => (
        <div className="flex flex-col">
          <span className="text-[12px]" style={{ color: "var(--v3-ink-100)" }}>
            {row.title}
          </span>
          <span
            className="v2-mono text-[10px] tracking-[0.14em]"
            style={{ color: "var(--v3-ink-400)" }}
          >
            {row.id}
          </span>
        </div>
      ),
    },
    {
      id: "momentum",
      header: "Momentum",
      width: "80px",
      align: "right",
      render: (row) => (
        <span className="v2-mono text-[11px]" style={{ color: "var(--v3-ink-200)" }}>
          {row.momentum.toFixed(1)}
        </span>
      ),
    },
  ];

  const rankChangeColumns: FeedColumn<RankChange>[] = [
    {
      id: "title",
      header: "Item",
      render: (row) => (
        <span className="text-[12px]" style={{ color: "var(--v3-ink-100)" }}>
          {row.title}
        </span>
      ),
    },
    {
      id: "prod",
      header: "Prod #",
      width: "70px",
      align: "right",
      render: (row) => (
        <span className="v2-mono text-[11px]" style={{ color: "var(--v3-ink-300)" }}>
          {row.prodRank}
        </span>
      ),
    },
    {
      id: "shadow",
      header: "Shadow #",
      width: "80px",
      align: "right",
      render: (row) => (
        <span className="v2-mono text-[11px]" style={{ color: "var(--v3-ink-300)" }}>
          {row.shadowRank}
        </span>
      ),
    },
    {
      id: "delta",
      header: "Δ",
      width: "60px",
      align: "right",
      render: (row) => {
        const positive = row.delta > 0;
        const color = positive ? "#f87171" : "#34d399";
        const sign = positive ? "+" : "";
        return (
          <span className="v2-mono text-[11px]" style={{ color }}>
            {sign}
            {row.delta}
          </span>
        );
      },
    },
  ];

  return (
    <section>
      <header className="mb-3 flex flex-wrap items-baseline gap-x-6 gap-y-2">
        <h2
          className="v2-mono text-[14px] tracking-[0.18em] uppercase"
          style={{ color: "var(--v3-ink-100)" }}
        >
          {report.domainKey}
          {report.sourceSlug ? (
            <span style={{ color: "var(--v3-ink-400)" }}>
              {" "}
              · {report.sourceSlug}
            </span>
          ) : null}
        </h2>
        <Stat label="Spearman ρ" value={fmtSigned(report.spearmanRho)} />
        <Stat label="Kendall τ" value={fmtSigned(report.kendallTau)} />
        <Stat label="Top-50 overlap" value={`${overlapPct}%`} />
        <Stat label="Top-10 churn" value={`${report.top10Churn}/10`} />
        <Stat label="Top-10 overlap" value={`${top10Overlap}/10`} />
        <span
          className="v2-mono text-[10px] tracking-[0.16em] uppercase rounded px-2 py-0.5"
          style={{
            color: gateColor,
            border: `1px solid ${gateColor}`,
            background: "var(--v3-bg-025)",
          }}
          title={report.cutoverGateReason}
        >
          gate {report.cutoverGatePass ? "PASS" : "FAIL"}
        </span>
      </header>
      <p
        className="mb-4 text-[11px]"
        style={{ color: "var(--v3-ink-400)" }}
      >
        {report.cutoverGateReason}
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div>
          <p
            className="v2-mono mb-2 text-[10px] tracking-[0.18em] uppercase"
            style={{ color: "var(--v3-ink-400)" }}
          >
            Production top-50
          </p>
          <TerminalFeedTable
            rows={report.prodTop50}
            columns={rankingColumns}
            rowKey={(row) => `prod-${row.id}`}
            accent={ACCENT}
            emptyTitle="No production items."
          />
        </div>
        <div>
          <p
            className="v2-mono mb-2 text-[10px] tracking-[0.18em] uppercase"
            style={{ color: "var(--v3-ink-400)" }}
          >
            Shadow top-50
          </p>
          <TerminalFeedTable
            rows={report.shadowTop50}
            columns={rankingColumns}
            rowKey={(row) => `shadow-${row.id}`}
            accent={ACCENT}
            emptyTitle="No shadow items."
          />
        </div>
        <div>
          <p
            className="v2-mono mb-2 text-[10px] tracking-[0.18em] uppercase"
            style={{ color: "var(--v3-ink-400)" }}
          >
            Top 20 rank changes
          </p>
          <TerminalFeedTable
            rows={report.rankChanges}
            columns={rankChangeColumns}
            rowKey={(row) => `delta-${row.id}`}
            accent={ACCENT}
            emptyTitle="No rank changes."
            emptySubtitle="Both rankings agree on order across the shared item set."
          />
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span
        className="v2-mono text-[10px] tracking-[0.16em] uppercase"
        style={{ color: "var(--v3-ink-400)" }}
      >
        {label}
      </span>
      <span
        className="v2-mono text-[12px] tabular-nums"
        style={{ color: "var(--v3-ink-100)" }}
      >
        {value}
      </span>
    </span>
  );
}

function EmptyState({ source, message }: { source: string; message: string }) {
  return (
    <div
      className="rounded-[2px] border border-dashed px-6 py-12 text-center"
      style={{
        borderColor: "var(--v3-line-100)",
        background: "var(--v3-bg-025)",
      }}
    >
      <p
        className="v2-mono text-[11px] tracking-[0.18em] uppercase"
        style={{ color: "var(--v3-ink-300)" }}
      >
        No report available
      </p>
      <p
        className="mt-2 text-[12px]"
        style={{ color: "var(--v3-ink-400)" }}
      >
        {message}
      </p>
      <p
        className="v2-mono mt-3 text-[10px] tracking-[0.14em] uppercase"
        style={{ color: "var(--v3-ink-400)" }}
      >
        source: {source}
      </p>
    </div>
  );
}

function fmtSigned(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(3)}`;
}
