// Admin — Collector health dashboard.
//
// Read-only sister page to /admin/scrapes. No buttons, no API calls;
// just a freshness-tier-coloured grid of every collector with the
// last-run timestamp, age, budget, and last-error reason. Reuses the
// same data source so /admin/scrapes and /admin/health stay in sync.
//
// Refresh: a small client island sets a 30 s interval and calls
// router.refresh() — that re-runs this server component on the server
// and swaps in the new HTML without a full reload. Cheaper than
// polling an API and keeps the truth in one place.
//
// Auth: middleware admin-cookie matcher + verifyAdminSession() guard
// (defence-in-depth, identical to /admin/scrapes).

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

import { AutoRefresh } from "./_components/AutoRefresh";

export const metadata: Metadata = {
  title: "Admin — Collector health",
  description:
    "Read-only freshness dashboard for every collector. Auto-refreshes every 30s.",
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

function tierBg(tier: FreshnessTier): string {
  if (tier === "GREEN")
    return "color-mix(in srgb, var(--v3-sig-green, #22c55e) 8%, transparent)";
  if (tier === "YELLOW")
    return "color-mix(in srgb, var(--v3-sig-amber, #f59e0b) 8%, transparent)";
  if (tier === "RED")
    return "color-mix(in srgb, var(--v3-sig-red, #ef4444) 10%, transparent)";
  if (tier === "DEAD")
    return "color-mix(in srgb, #7f1d1d 14%, transparent)";
  return "var(--v3-bg-025, #0f172a)";
}

function counts(rows: ScrapeStatus[]) {
  return rows.reduce(
    (acc, r) => {
      acc.total += 1;
      acc[r.freshnessTier] = (acc[r.freshnessTier] ?? 0) + 1;
      return acc;
    },
    {
      total: 0,
      GREEN: 0,
      YELLOW: 0,
      RED: 0,
      DEAD: 0,
      UNKNOWN: 0,
    } as Record<FreshnessTier | "total", number>,
  );
}

export default async function AdminHealthPage() {
  const cookieStore = await cookies();
  const session = cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value ?? null;
  if (!verifyAdminSession(session)) {
    redirect("/admin/login?next=/admin/health");
  }

  const statuses = await getAllScrapeStatuses();
  const byName = new Map(statuses.map((s) => [s.source, s]));
  const tally = counts(statuses);
  const generatedAt = new Date().toISOString();

  return (
    <main className="min-h-screen font-mono">
      <div className="mx-auto max-w-[1100px] px-4 py-8 md:px-6 md:py-10">
        <header className="mb-6">
          <nav
            className="mb-2 text-[10px] tracking-[0.18em] uppercase"
            style={{ color: "var(--v4-ink-300, #94a3b8)" }}
          >
            <Link href="/admin" className="underline">
              admin
            </Link>{" "}
            / health
          </nav>
          <p
            className="text-[10px] tracking-[0.22em] uppercase"
            style={{ color: "var(--v4-ink-300, #94a3b8)" }}
          >
            {"// COLLECTOR · HEALTH"}
          </p>
          <h1
            className="mt-1 text-[28px] leading-tight"
            style={{ color: "var(--v4-ink-100, #f8fafc)" }}
          >
            Health dashboard — last-run freshness
          </h1>
          <p
            className="mt-2 max-w-3xl text-[13px]"
            style={{ color: "var(--v4-ink-200, #cbd5e1)" }}
          >
            Auto-refreshes every 30 s.{" "}
            <Link
              href="/admin/scrapes"
              className="underline"
              style={{ color: "var(--v4-ink-100, #f8fafc)" }}
            >
              Trigger a run from /admin/scrapes →
            </Link>
          </p>
          <p
            className="mt-3 text-[10px] tracking-[0.18em] uppercase"
            style={{ color: "var(--v4-ink-300, #94a3b8)" }}
          >
            generated {generatedAt}
          </p>
        </header>

        <section
          className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5"
          aria-label="Collector tier tally"
        >
          <Tally label="Total" value={tally.total} />
          <Tally label="Green" value={tally.GREEN} color={tierColor("GREEN")} />
          <Tally
            label="Yellow"
            value={tally.YELLOW}
            color={tierColor("YELLOW")}
          />
          <Tally label="Red" value={tally.RED} color={tierColor("RED")} />
          <Tally
            label="Dead"
            value={tally.DEAD + tally.UNKNOWN}
            color={tierColor("DEAD")}
          />
        </section>

        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
              <article
                key={source}
                className="rounded-[2px] border p-4"
                style={{
                  borderColor: "var(--v4-line-100, #1f2937)",
                  background: tierBg(row.freshnessTier),
                }}
              >
                <header className="mb-3 flex items-center justify-between gap-2">
                  <span
                    className="text-[12px] tracking-[0.12em] uppercase"
                    style={{ color: "var(--v4-ink-100, #f8fafc)" }}
                  >
                    {row.source}
                  </span>
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
                </header>
                <dl className="space-y-1.5 text-[11px]">
                  <Row label="Last run" value={fmtWhen(row.lastRunAt)} />
                  <Row label="Age" value={fmtAge(row.ageMs)} />
                  <Row label="Budget" value={fmtBudget(row.budgetMs)} />
                  <Row
                    label="Signals"
                    value={
                      row.signalCount === null
                        ? "—"
                        : row.signalCount.toLocaleString("en-US")
                    }
                  />
                  <Row
                    label="Status"
                    value={row.lastRunStatus}
                    valueColor={
                      row.lastRunStatus === "fail"
                        ? "var(--v4-sig-red, #ef4444)"
                        : row.lastRunStatus === "success"
                          ? "var(--v4-sig-green, #22c55e)"
                          : "var(--v4-ink-300, #94a3b8)"
                    }
                  />
                </dl>
                {row.lastErrorReason ? (
                  <p
                    className="mt-3 text-[11px] leading-relaxed"
                    style={{ color: "var(--v4-sig-red, #ef4444)" }}
                  >
                    {row.lastErrorReason}
                  </p>
                ) : null}
              </article>
            );
          })}
        </section>

        <AutoRefresh intervalMs={30_000} />
      </div>
    </main>
  );
}

function Tally({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color?: string;
}) {
  return (
    <div
      className="rounded-[2px] border p-3"
      style={{
        borderColor: "var(--v4-line-100, #1f2937)",
        background: "var(--v4-bg-025, #0f172a)",
      }}
    >
      <div
        className="text-[10px] tracking-[0.18em] uppercase"
        style={{ color: "var(--v4-ink-300, #94a3b8)" }}
      >
        {label}
      </div>
      <div
        className="mt-1 text-[20px] tabular-nums"
        style={{ color: color ?? "var(--v4-ink-100, #f8fafc)" }}
      >
        {value}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt
        className="text-[10px] tracking-[0.16em] uppercase"
        style={{ color: "var(--v4-ink-300, #94a3b8)" }}
      >
        {label}
      </dt>
      <dd
        className="text-[11px] tabular-nums"
        style={{ color: valueColor ?? "var(--v4-ink-100, #f8fafc)" }}
      >
        {value}
      </dd>
    </div>
  );
}
