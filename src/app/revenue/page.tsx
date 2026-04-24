// /revenue — Revenue Terminal
//
// Two sections:
//  1. Tracked repos with verified revenue — anchor to /repo/[owner]/[name]
//  2. Verified revenue leaderboard — broader catalog of verified-revenue
//     startups in dev/AI-adjacent categories, for audience relevance even
//     when the tracked-repo match count is small.
//
// Reads:
//  - data/revenue-overlays.json  (via src/lib/revenue-overlays.ts)
//  - data/trustmrr-startups.json (via src/lib/revenue-startups.ts)
//
// Section 2 supports ?category=<name> for single-category drilldowns, or
// ?category=__all__ to show every category in the catalog.

import type { Metadata } from "next";
import Link from "next/link";
import { BadgeCheck, ExternalLink, TrendingDown, TrendingUp } from "lucide-react";

import type { RevenueOverlay } from "@/lib/types";
import {
  classifyFreshness,
  getRevenueOverlaysMeta,
  listRevenueOverlays,
} from "@/lib/revenue-overlays";
import {
  getLeaderboard,
  type VerifiedStartup,
} from "@/lib/revenue-startups";
import { getDerivedRepoByFullName } from "@/lib/derived-repos";
import { formatNumber } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "TrendingRepo — Revenue Terminal",
  description:
    "Verified MRR for trending repos and the broader dev/AI-adjacent verified-revenue leaderboard. Revenue is verified through direct read-only sync with each product's payment provider.",
  alternates: { canonical: "/revenue" },
};

const LEADERBOARD_LIMIT = 100;

interface PageProps {
  searchParams: Promise<{ category?: string | string[] }>;
}

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

function growthTuple(raw: number | null | undefined): {
  label: string;
  tone: "up" | "down" | "default";
} {
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return { label: "-", tone: "default" };
  }
  const rounded = Math.round(raw * 10) / 10;
  if (rounded > 0) return { label: `+${rounded}%`, tone: "up" };
  if (rounded < 0) return { label: `${rounded}%`, tone: "down" };
  return { label: "0%", tone: "default" };
}

function hostname(url: string | null | undefined): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

interface TrackedRow {
  overlay: RevenueOverlay;
  description: string | null;
}

function buildTrackedRows(): TrackedRow[] {
  const overlays = listRevenueOverlays();
  const rows: TrackedRow[] = overlays.map((overlay) => {
    const repo = getDerivedRepoByFullName(overlay.fullName);
    return { overlay, description: repo?.description ?? null };
  });
  rows.sort((a, b) => (b.overlay.mrrCents ?? 0) - (a.overlay.mrrCents ?? 0));
  return rows;
}

export default async function RevenuePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const rawCategory = Array.isArray(params.category)
    ? params.category[0]
    : params.category;
  const category =
    typeof rawCategory === "string" && rawCategory.length > 0
      ? rawCategory
      : null;

  const trackedRows = buildTrackedRows();
  const trackedMeta = getRevenueOverlaysMeta();
  const leaderboard = getLeaderboard({
    category,
    limit: LEADERBOARD_LIMIT,
  });

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
              {"// verified MRR across trending repos + the broader dev/AI-adjacent leaderboard"}
            </span>
          </div>
          <p className="mt-2 max-w-3xl text-sm text-text-secondary">
            Revenue numbers are verified through direct read-only sync with
            each product&apos;s payment provider (Stripe, LemonSqueezy, Polar,
            and others). Top section shows tracked repos with verified
            revenue. Bottom section is the broader catalog of verified-revenue
            startups in developer-adjacent categories.
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

        {/* SECTION 1 — tracked repos ----------------------------------- */}
        <section className="mb-10" aria-labelledby="tracked-heading">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
            <h2
              id="tracked-heading"
              className="text-lg font-bold uppercase tracking-wider text-text-primary"
            >
              Tracked repos with verified revenue
            </h2>
            <span className="text-xs text-text-tertiary">
              {trackedRows.length.toLocaleString()} repo(s) ·{" "}
              {trackedMeta.catalogGeneratedAt
                ? `updated ${formatRelative(trackedMeta.catalogGeneratedAt)}`
                : "never synced"}
            </span>
          </div>
          {trackedRows.length === 0 ? (
            <TrackedColdState />
          ) : (
            <div className="overflow-x-auto rounded-card border border-border-primary bg-bg-card shadow-card">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-border-primary text-left font-mono text-[10px] uppercase tracking-wider text-text-tertiary">
                    <th className="px-4 py-3">#</th>
                    <th className="px-4 py-3">Repo</th>
                    <th className="px-4 py-3 text-right">MRR</th>
                    <th className="px-4 py-3 text-right">Last 30d</th>
                    <th className="px-4 py-3 text-right">Growth 30d</th>
                    <th className="px-4 py-3 text-right">Subs</th>
                    <th className="px-4 py-3">Provider</th>
                  </tr>
                </thead>
                <tbody>
                  {trackedRows.map((row, i) => (
                    <TrackedRowEl
                      key={row.overlay.fullName}
                      index={i + 1}
                      row={row}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* SECTION 2 — broader leaderboard ---------------------------- */}
        <section aria-labelledby="leaderboard-heading">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <h2
                id="leaderboard-heading"
                className="text-lg font-bold uppercase tracking-wider text-text-primary"
              >
                Verified revenue leaderboard
              </h2>
              <p className="mt-1 text-xs text-text-tertiary">
                Top {Math.min(LEADERBOARD_LIMIT, leaderboard.rows.length)} of{" "}
                {leaderboard.totalInFilter.toLocaleString()} verified-revenue
                startup(s) in{" "}
                {category === "__all__"
                  ? "every category"
                  : category
                    ? <><span className="text-text-primary">{category}</span></>
                    : "developer-adjacent categories"}
                .
              </p>
            </div>
            <span className="text-xs text-text-tertiary">
              Combined MRR: {formatUsd(leaderboard.totalMrrCents)}
            </span>
          </div>

          <CategoryFilter
            active={category}
            available={leaderboard.availableCategories}
          />

          {leaderboard.rows.length === 0 ? (
            <div className="rounded-card border border-dashed border-border-primary bg-bg-muted/40 px-4 py-6 text-sm text-text-tertiary">
              No startups in this filter.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-card border border-border-primary bg-bg-card shadow-card">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-border-primary text-left font-mono text-[10px] uppercase tracking-wider text-text-tertiary">
                    <th className="px-4 py-3">#</th>
                    <th className="px-4 py-3">Product</th>
                    <th className="px-4 py-3 text-right">MRR</th>
                    <th className="px-4 py-3 text-right">Last 30d</th>
                    <th className="px-4 py-3 text-right">Growth 30d</th>
                    <th className="px-4 py-3 text-right">Subs</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3">Provider</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.rows.map((startup, i) => (
                    <LeaderboardRowEl
                      key={startup.slug}
                      index={i + 1}
                      startup={startup}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <footer className="mt-4 flex flex-wrap items-center gap-3 text-xs text-text-tertiary">
            <Link
              href="/tools/revenue-estimate"
              className="text-text-secondary hover:text-text-primary"
            >
              Try the MRR estimator →
            </Link>
            <span aria-hidden>·</span>
            <Link
              href="/submit/revenue"
              className="text-text-secondary hover:text-text-primary"
            >
              Claim or submit revenue →
            </Link>
          </footer>
        </section>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function CategoryFilter({
  active,
  available,
}: {
  active: string | null;
  available: string[];
}) {
  // Show the allowlist always + any present categories the corpus has data
  // for. Plus a "Default" chip (no param), an "All categories" chip, and
  // individual categories.
  const chips: Array<{ label: string; href: string; active: boolean }> = [
    {
      label: "Dev-adjacent (default)",
      href: "/revenue",
      active: active === null,
    },
    {
      label: "All categories",
      href: "/revenue?category=__all__",
      active: active === "__all__",
    },
  ];
  for (const c of available) {
    chips.push({
      label: c,
      href: `/revenue?category=${encodeURIComponent(c)}`,
      active: active === c,
    });
  }
  return (
    <div className="mb-4 flex flex-wrap gap-2">
      {chips.map((chip) => (
        <Link
          key={chip.href}
          href={chip.href}
          className={
            "rounded-md border px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider transition " +
            (chip.active
              ? "border-brand bg-brand/10 text-text-primary"
              : "border-border-primary bg-bg-muted text-text-secondary hover:text-text-primary")
          }
        >
          {chip.label}
        </Link>
      ))}
    </div>
  );
}

function TrackedRowEl({ index, row }: { index: number; row: TrackedRow }) {
  const { overlay, description } = row;
  const freshness = classifyFreshness(overlay.asOf);
  const growth = growthTuple(overlay.growthMrr30d);

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
        {description ? (
          <p className="mt-1 max-w-lg truncate text-[11px] text-text-tertiary">
            {description}
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
          (growth.tone === "up"
            ? "text-up"
            : growth.tone === "down"
              ? "text-down"
              : "text-text-secondary")
        }
      >
        <span className="inline-flex items-center gap-1 justify-end">
          {growth.tone === "up" ? (
            <TrendingUp className="size-3" aria-hidden />
          ) : growth.tone === "down" ? (
            <TrendingDown className="size-3" aria-hidden />
          ) : null}
          {growth.label}
        </span>
      </td>
      <td className="px-4 py-3 text-right tabular-nums text-text-secondary">
        {typeof overlay.activeSubscriptions === "number" &&
        overlay.activeSubscriptions > 0
          ? formatNumber(overlay.activeSubscriptions)
          : typeof overlay.customers === "number" && overlay.customers > 0
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

function LeaderboardRowEl({
  index,
  startup,
}: {
  index: number;
  startup: VerifiedStartup;
}) {
  const growth = growthTuple(startup.growthMrr30d);
  const host = hostname(startup.website);

  return (
    <tr className="border-b border-border-primary/50 last:border-none hover:bg-bg-muted/40">
      <td className="px-4 py-3 text-text-tertiary tabular-nums">{index}</td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2 font-mono text-text-primary">
          {startup.matchedRepoFullName ? (
            <Link
              href={`/repo/${startup.matchedRepoFullName}`}
              className="hover:underline"
              title={`Tracked: ${startup.matchedRepoFullName}`}
            >
              {startup.name}
            </Link>
          ) : (
            <span>{startup.name}</span>
          )}
          {startup.matchedRepoFullName ? (
            <span className="rounded-full border border-up/50 bg-up/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-up">
              tracked
            </span>
          ) : null}
        </div>
        {host ? (
          <p className="mt-0.5 text-[11px] text-text-tertiary">
            {startup.website ? (
              <a
                href={startup.website}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 hover:text-text-secondary"
              >
                {host}
                <ExternalLink className="size-3" aria-hidden />
              </a>
            ) : (
              host
            )}
          </p>
        ) : null}
      </td>
      <td className="px-4 py-3 text-right font-semibold tabular-nums">
        {formatUsd(startup.mrrCents)}
      </td>
      <td className="px-4 py-3 text-right tabular-nums text-text-secondary">
        {formatUsd(startup.last30DaysCents)}
      </td>
      <td
        className={
          "px-4 py-3 text-right tabular-nums " +
          (growth.tone === "up"
            ? "text-up"
            : growth.tone === "down"
              ? "text-down"
              : "text-text-secondary")
        }
      >
        <span className="inline-flex items-center gap-1 justify-end">
          {growth.tone === "up" ? (
            <TrendingUp className="size-3" aria-hidden />
          ) : growth.tone === "down" ? (
            <TrendingDown className="size-3" aria-hidden />
          ) : null}
          {growth.label}
        </span>
      </td>
      <td className="px-4 py-3 text-right tabular-nums text-text-secondary">
        {typeof startup.activeSubscriptions === "number" &&
        startup.activeSubscriptions > 0
          ? formatNumber(startup.activeSubscriptions)
          : typeof startup.customers === "number" && startup.customers > 0
            ? formatNumber(startup.customers)
            : "-"}
      </td>
      <td className="px-4 py-3 text-text-secondary">
        {startup.category ?? "-"}
      </td>
      <td className="px-4 py-3 text-text-secondary">
        {startup.paymentProvider ?? "-"}
      </td>
    </tr>
  );
}

function TrackedColdState() {
  return (
    <div className="rounded-card border border-dashed border-border-primary bg-bg-secondary/40 px-4 py-6 text-sm text-text-tertiary">
      No tracked repos currently match a verified-revenue startup. Most
      trending OSS isn&apos;t monetized as SaaS — Postiz-style dual-licensed
      products are rare. The leaderboard below surfaces the broader catalog.
    </div>
  );
}
