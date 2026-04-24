// /revenue — Revenue Terminal
//
// Tracked repos with verified revenue metrics. Phase 1 (enrichment-only) —
// only verified rows appear. Self-reported submissions (Phase 2) surface on
// individual repo pages, not in this listing, to preserve the "every row
// here is verified" signal.
//
// Reads data/revenue-overlays.json via src/lib/revenue-overlays.ts.

import type { Metadata } from "next";
import Link from "next/link";
import { BadgeCheck, TrendingDown, TrendingUp } from "lucide-react";

import type { RevenueOverlay } from "@/lib/types";
import {
  classifyFreshness,
  getRevenueOverlaysMeta,
  listRevenueOverlays,
} from "@/lib/revenue-overlays";
import { getDerivedRepoByFullName } from "@/lib/derived-repos";
import { formatNumber } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "TrendingRepo — Revenue Terminal",
  description:
    "Trending repos with verified MRR, growth, and customer metrics. Revenue is verified through direct read-only sync with the product's payment provider.",
  alternates: { canonical: "/revenue" },
};

function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "never";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "unknown";
  const diff = Date.now() - t;
  if (diff < 60_000) return "just now";
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatUsd(cents: number | null): string {
  if (cents === null || !Number.isFinite(cents)) return "-";
  const dollars = cents / 100;
  if (dollars >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(1)}M`;
  if (dollars >= 10_000) return `$${(dollars / 1_000).toFixed(0)}K`;
  if (dollars >= 1_000) return `$${(dollars / 1_000).toFixed(1)}K`;
  return `$${formatNumber(Math.round(dollars))}`;
}

interface Row {
  overlay: RevenueOverlay;
  repoDescription: string | null;
  repoStars: number | null;
}

function buildRows(): Row[] {
  const overlays = listRevenueOverlays();
  const rows: Row[] = overlays.map((overlay) => {
    const repo = getDerivedRepoByFullName(overlay.fullName);
    return {
      overlay,
      repoDescription: repo?.description ?? null,
      repoStars: typeof repo?.stars === "number" ? repo.stars : null,
    };
  });
  rows.sort((a, b) => (b.overlay.mrrCents ?? 0) - (a.overlay.mrrCents ?? 0));
  return rows;
}

export default function RevenuePage() {
  const rows = buildRows();
  const meta = getRevenueOverlaysMeta();
  const totalMrrCents = rows.reduce(
    (sum, row) => sum + (row.overlay.mrrCents ?? 0),
    0,
  );
  const topRow = rows[0] ?? null;

  return (
    <main className="min-h-screen bg-bg-primary text-text-primary font-mono">
      <div className="max-w-[1400px] mx-auto px-4 md:px-6 py-6 md:py-8">
        <header className="mb-6 border-b border-border-primary pb-6">
          <div className="flex items-baseline gap-3 flex-wrap">
            <h1 className="text-2xl font-bold uppercase tracking-wider inline-flex items-center gap-2">
              <BadgeCheck className="size-5 text-up" aria-hidden />
              REVENUE TERMINAL
            </h1>
            <span className="text-xs text-text-tertiary">
              {"// tracked repos with verified revenue"}
            </span>
          </div>
          <p className="mt-2 max-w-3xl text-sm text-text-secondary">
            Trending repos whose product has revenue verified through direct
            read-only sync with the payment provider (Stripe, LemonSqueezy,
            Polar, and others). Sorted by MRR.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-card border border-up/30 bg-up/5 px-4 py-3 text-xs">
            <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-up">
              Founders
            </span>
            <span className="text-text-secondary">
              Don&apos;t see your project? Link a verified-revenue profile or
              self-report your MRR.
            </span>
            <Link
              href="/submit/revenue"
              className="ml-auto inline-flex items-center gap-1 font-mono text-xs font-semibold text-text-primary hover:underline"
            >
              Claim or submit revenue →
            </Link>
          </div>
        </header>

        {rows.length === 0 ? (
          <ColdState />
        ) : (
          <>
            <section className="mb-6 grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatTile
                label="Matched Repos"
                value={rows.length.toLocaleString()}
                hint="verified via payment sync"
              />
              <StatTile
                label="Combined MRR"
                value={formatUsd(totalMrrCents)}
                hint="sum across matched repos"
              />
              <StatTile
                label="Top MRR"
                value={formatUsd(topRow?.overlay.mrrCents ?? null)}
                hint={topRow?.overlay.fullName ?? "—"}
              />
              <StatTile
                label="Last Refresh"
                value={formatRelative(meta.catalogGeneratedAt)}
                hint={meta.catalogGeneratedAt ?? undefined}
              />
            </section>

            <section className="overflow-x-auto rounded-card border border-border-primary bg-bg-card shadow-card">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-border-primary text-left font-mono text-[10px] uppercase tracking-wider text-text-tertiary">
                    <th className="px-4 py-3">#</th>
                    <th className="px-4 py-3">Repo</th>
                    <th className="px-4 py-3 text-right">MRR</th>
                    <th className="px-4 py-3 text-right">Last 30d</th>
                    <th className="px-4 py-3 text-right">Growth 30d</th>
                    <th className="px-4 py-3 text-right">Customers</th>
                    <th className="px-4 py-3">Provider</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <RevenueRow key={row.overlay.fullName} index={i + 1} row={row} />
                  ))}
                </tbody>
              </table>
            </section>

            <footer className="mt-6 flex flex-wrap items-center gap-3 text-xs text-text-tertiary">
              <Link
                href="/tools/revenue-estimate"
                className="text-text-secondary hover:text-text-primary"
              >
                Try the MRR estimator →
              </Link>
            </footer>
          </>
        )}
      </div>
    </main>
  );
}

interface RevenueRowProps {
  row: Row;
  index: number;
}

function RevenueRow({ row, index }: RevenueRowProps) {
  const { overlay, repoDescription } = row;
  const freshness = classifyFreshness(overlay.asOf);
  const growthRaw = overlay.growthMrr30d;
  const growth =
    typeof growthRaw === "number" && Number.isFinite(growthRaw)
      ? Math.round(growthRaw * 10) / 10
      : null;
  const growthTone =
    growth === null ? "default" : growth > 0 ? "up" : growth < 0 ? "down" : "default";

  return (
    <tr className="border-b border-border-primary/50 last:border-none hover:bg-bg-muted/40">
      <td className="px-4 py-3 text-text-tertiary tabular-nums">{index}</td>
      <td className="px-4 py-3">
        <Link
          href={`/repo/${overlay.fullName}`}
          className="font-mono text-text-primary hover:underline"
        >
          {overlay.fullName}
        </Link>
        {repoDescription ? (
          <p className="mt-1 max-w-lg truncate text-[11px] text-text-tertiary">
            {repoDescription}
          </p>
        ) : null}
      </td>
      <td className="px-4 py-3 text-right font-semibold tabular-nums">
        {formatUsd(overlay.mrrCents)}
      </td>
      <td className="px-4 py-3 text-right tabular-nums text-text-secondary">
        {formatUsd(overlay.last30DaysCents)}
      </td>
      <td
        className={
          "px-4 py-3 text-right tabular-nums " +
          (growthTone === "up"
            ? "text-up"
            : growthTone === "down"
              ? "text-down"
              : "text-text-secondary")
        }
      >
        <span className="inline-flex items-center gap-1 justify-end">
          {growthTone === "up" ? (
            <TrendingUp className="size-3" aria-hidden />
          ) : growthTone === "down" ? (
            <TrendingDown className="size-3" aria-hidden />
          ) : null}
          {growth === null ? "-" : `${growth > 0 ? "+" : ""}${growth}%`}
        </span>
      </td>
      <td className="px-4 py-3 text-right tabular-nums text-text-secondary">
        {typeof overlay.customers === "number"
          ? formatNumber(overlay.customers)
          : "-"}
      </td>
      <td className="px-4 py-3 text-text-secondary">
        {overlay.paymentProvider ?? "-"}
        {freshness === "stale" ? (
          <span className="ml-2 rounded-full border border-border-primary bg-bg-muted px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-warning">
            stale
          </span>
        ) : null}
      </td>
    </tr>
  );
}

function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="border border-border-primary rounded-md px-4 py-3 bg-bg-secondary">
      <div className="text-[10px] uppercase tracking-wider text-text-tertiary">
        {label}
      </div>
      <div className="mt-1 text-xl font-bold truncate tabular-nums">{value}</div>
      {hint ? (
        <div className="mt-0.5 text-[11px] text-text-tertiary truncate">
          {hint}
        </div>
      ) : null}
    </div>
  );
}

function ColdState() {
  return (
    <section className="border border-dashed border-border-primary rounded-md p-8 bg-bg-secondary/40">
      <h2 className="text-lg font-bold uppercase tracking-wider text-brand">
        {"// no revenue overlays yet"}
      </h2>
      <p className="mt-3 max-w-xl text-sm text-text-secondary">
        The revenue sync has not produced any matches yet. Run{" "}
        <code className="text-text-primary">
          node scripts/sync-trustmrr.mjs --mode=full
        </code>{" "}
        locally to populate{" "}
        <code className="text-text-primary">data/revenue-overlays.json</code>,
        then refresh this page.
      </p>
    </section>
  );
}
