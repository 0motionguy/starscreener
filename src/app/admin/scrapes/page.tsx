// Admin — Scrape control panel.
//
// Single page that lists every collector + lets the operator kick a
// scrape without leaving the browser. Status data is read server-side
// from the meta sidecars + log directory (see
// src/lib/admin/scrape-status.ts); the per-row "Run now" buttons + the
// header "Run all" button are wrapped in a small client island so we
// can POST to /api/admin/scrape/run and refresh on response.
//
// Auth: the existing admin-cookie middleware (src/middleware.ts +
// /admin/* matcher) gates this whole subtree. We additionally call
// verifyAdminSession() here so a partial cookie / SESSION_SECRET
// mis-config redirects to /admin/login rather than rendering a blank
// page. Pattern lifted from src/app/admin/sweep-cost/page.tsx.

import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import {
  ADMIN_SESSION_COOKIE_NAME,
  verifyAdminSession,
} from "@/lib/api/admin-session";
import {
  COLLECTORS,
  getAllScrapeStatuses,
  type FreshnessTier,
  type ScrapeStatus,
} from "@/lib/admin/scrape-status";

import { RunButton } from "./_components/RunButton";

export const metadata: Metadata = {
  title: "Admin — Scrapes",
  description:
    "Operator-triggered collector runs + per-source last-run summary.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

function fmtAge(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return "—";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function fmtBudget(ms: number | null): string {
  if (ms === null) return "—";
  const h = ms / (60 * 60 * 1000);
  return h >= 24 ? `${Math.round(h / 24)}d` : `${Math.round(h)}h`;
}

function fmtWhen(iso: string | null): string {
  if (!iso) return "never";
  return new Date(iso).toISOString().slice(0, 16).replace("T", " ") + "Z";
}

function tierColor(tier: FreshnessTier): string {
  if (tier === "GREEN") return "var(--v3-sig-green, #22c55e)";
  if (tier === "YELLOW") return "var(--v3-sig-amber, #f59e0b)";
  if (tier === "RED") return "var(--v3-sig-red, #ef4444)";
  if (tier === "DEAD") return "#7f1d1d";
  return "var(--v3-ink-400, #6b7280)";
}

export default async function AdminScrapesPage() {
  const cookieStore = await cookies();
  const session = cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value ?? null;
  if (!verifyAdminSession(session)) {
    redirect("/admin/login?next=/admin/scrapes");
  }

  const statuses = await getAllScrapeStatuses();
  const byName = new Map(statuses.map((s) => [s.source, s]));

  return (
    <main className="min-h-screen font-mono">
      <div className="mx-auto max-w-[1100px] px-4 py-8 md:px-6 md:py-10">
        <header className="mb-8">
          <nav
            className="mb-2 text-[10px] tracking-[0.18em] uppercase"
            style={{ color: "var(--v4-ink-300, #94a3b8)" }}
          >
            <Link href="/admin" className="underline">
              admin
            </Link>{" "}
            / scrapes
          </nav>
          <p
            className="text-[10px] tracking-[0.22em] uppercase"
            style={{ color: "var(--v4-ink-300, #94a3b8)" }}
          >
            {"// SCRAPES · CONTROL PANEL"}
          </p>
          <h1
            className="mt-1 text-[28px] leading-tight"
            style={{ color: "var(--v4-ink-100, #f8fafc)" }}
          >
            Collectors — run + last-run summary
          </h1>
          <p
            className="mt-2 max-w-3xl text-[13px]"
            style={{ color: "var(--v4-ink-200, #cbd5e1)" }}
          >
            One row per collector. Status is derived from{" "}
            <code style={{ color: "var(--v4-ink-100, #f8fafc)" }}>
              data/_meta/&lt;source&gt;.json
            </code>{" "}
            (last-run timestamp + reason) plus the most recent log under{" "}
            <code style={{ color: "var(--v4-ink-100, #f8fafc)" }}>
              .data/admin-scan-runs/
            </code>
            . Click <b>Run now</b> to kick a single collector or{" "}
            <b>Run all collectors</b> to fan-out every source.
          </p>
        </header>

        <section className="mb-6 flex flex-wrap items-center gap-3">
          <RunButton source="all" label="Run all collectors" variant="primary" />
          <Link
            href="/admin/health"
            className="text-[11px] tracking-[0.16em] underline uppercase"
            style={{ color: "var(--v4-ink-300, #94a3b8)" }}
          >
            view health dashboard →
          </Link>
        </section>

        <section
          className="overflow-x-auto rounded-[2px] border"
          style={{
            borderColor: "var(--v4-line-100, #1f2937)",
            background: "var(--v4-bg-025, #0f172a)",
          }}
        >
          <table
            className="w-full text-[12px]"
            style={{ borderCollapse: "collapse" }}
          >
            <thead>
              <tr
                style={{ borderBottom: "1px solid var(--v4-line-100, #1f2937)" }}
              >
                <Th>Source</Th>
                <Th>Tier</Th>
                <Th align="right">Last run</Th>
                <Th align="right">Age</Th>
                <Th align="right">Budget</Th>
                <Th align="right">Signals</Th>
                <Th align="right">Duration</Th>
                <Th>Last error</Th>
                <Th align="right">Action</Th>
              </tr>
            </thead>
            <tbody>
              {COLLECTORS.map((source) => {
                const row =
                  byName.get(source) ??
                  ({
                    source,
                    lastRunAt: null,
                    lastRunStatus: "never-run",
                    lastRunDurationMs: null,
                    signalCount: null,
                    signalCountDelta: null,
                    lastErrorReason: null,
                    budgetMs: null,
                    ageMs: null,
                    freshnessTier: "UNKNOWN",
                  } satisfies ScrapeStatus);
                return (
                  <tr
                    key={source}
                    style={{
                      borderBottom: "1px solid var(--v4-line-100, #1f2937)",
                    }}
                  >
                    <Td>
                      <span
                        className="text-[11px] tracking-[0.12em] uppercase"
                        style={{ color: "var(--v4-ink-100, #f8fafc)" }}
                      >
                        {row.source}
                      </span>
                    </Td>
                    <Td>
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          aria-hidden
                          className="inline-block"
                          style={{
                            width: 8,
                            height: 8,
                            background: tierColor(row.freshnessTier),
                            borderRadius: 1,
                          }}
                        />
                        <span
                          className="text-[10px] tracking-[0.16em] uppercase"
                          style={{ color: tierColor(row.freshnessTier) }}
                        >
                          {row.freshnessTier}
                        </span>
                      </span>
                    </Td>
                    <Td align="right">
                      <span
                        className="text-[11px] tabular-nums"
                        style={{ color: "var(--v4-ink-200, #cbd5e1)" }}
                      >
                        {fmtWhen(row.lastRunAt)}
                      </span>
                    </Td>
                    <Td align="right">
                      <span
                        className="text-[11px] tabular-nums"
                        style={{ color: "var(--v4-ink-200, #cbd5e1)" }}
                      >
                        {fmtAge(row.ageMs)}
                      </span>
                    </Td>
                    <Td align="right">
                      <span
                        className="text-[11px] tabular-nums"
                        style={{ color: "var(--v4-ink-300, #94a3b8)" }}
                      >
                        {fmtBudget(row.budgetMs)}
                      </span>
                    </Td>
                    <Td align="right">
                      <span
                        className="text-[11px] tabular-nums"
                        style={{ color: "var(--v4-ink-200, #cbd5e1)" }}
                      >
                        {row.signalCount === null
                          ? "—"
                          : row.signalCount.toLocaleString("en-US")}
                      </span>
                    </Td>
                    <Td align="right">
                      <span
                        className="text-[11px] tabular-nums"
                        style={{ color: "var(--v4-ink-300, #94a3b8)" }}
                      >
                        {row.lastRunDurationMs === null
                          ? "—"
                          : `${(row.lastRunDurationMs / 1000).toFixed(1)}s`}
                      </span>
                    </Td>
                    <Td>
                      <span
                        className="block max-w-[260px] truncate text-[11px]"
                        style={{
                          color:
                            row.lastErrorReason === null
                              ? "var(--v4-ink-400, #6b7280)"
                              : "var(--v4-sig-red, #ef4444)",
                        }}
                        title={row.lastErrorReason ?? ""}
                      >
                        {row.lastErrorReason ?? "—"}
                      </span>
                    </Td>
                    <Td align="right">
                      <RunButton
                        source={row.source}
                        label="Run now"
                        variant="ghost"
                      />
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        <p
          className="mt-4 text-[10px] tracking-[0.16em] uppercase"
          style={{ color: "var(--v4-ink-400, #6b7280)" }}
        >
          {
            "// freshness budgets are sourced from src/lib/admin/scrape-status.ts. green ≤ 50% budget · yellow ≤ budget · red ≤ 4× budget · dead beyond."
          }
        </p>
      </div>
    </main>
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
      className="px-3 py-2 text-[10px] tracking-[0.18em] uppercase"
      style={{
        color: "var(--v4-ink-300, #94a3b8)",
        textAlign: align,
        fontWeight: 400,
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
    <td className="px-3 py-2" style={{ textAlign: align }}>
      {children}
    </td>
  );
}
