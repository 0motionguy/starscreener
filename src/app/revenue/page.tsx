// /revenue — Revenue Terminal
//
// Two sections:
//  1. Tracked repos with verified revenue — cards whose product matched one
//     of our trending repos. Anchored to /repo/[owner]/[name].
//  2. Verified revenue leaderboard — broader catalog of verified-revenue
//     startups in dev/AI-adjacent categories, for audience relevance even
//     when the tracked-repo match count is small.
//
// Reads:
//  - data/revenue-overlays.json  (via src/lib/revenue-overlays.ts)
//  - data/trustmrr-startups.json (via src/lib/revenue-startups.ts)
//
// Section 2 supports ?category=<name> for drilldowns, ?category=__all__ for
// every category in the catalog.

import type { Metadata } from "next";
import Link from "next/link";
import { BadgeCheck } from "lucide-react";

import {
  getLeaderboard,
  type VerifiedStartup,
} from "@/lib/revenue-startups";
import { getRevenueOverlaysMeta } from "@/lib/revenue-overlays";
import { VerifiedStartupCard } from "@/components/revenue/VerifiedStartupCard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "TrendingRepo — Revenue Terminal",
  description:
    "Verified MRR for trending repos and the broader dev/AI-adjacent verified-revenue leaderboard. Revenue is verified through direct read-only sync with each product's payment provider.",
  alternates: { canonical: "/revenue" },
};

const LEADERBOARD_LIMIT = 120;

interface PageProps {
  searchParams: Promise<{ category?: string | string[] }>;
}

function formatUsd(cents: number | null): string {
  if (cents === null || !Number.isFinite(cents)) return "-";
  const dollars = cents / 100;
  if (dollars >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(1)}M`;
  if (dollars >= 10_000) return `$${(dollars / 1_000).toFixed(0)}K`;
  if (dollars >= 1_000) return `$${(dollars / 1_000).toFixed(1)}K`;
  return `$${Math.round(dollars).toLocaleString()}`;
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
  return `${Math.floor(hours / 24)}d ago`;
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

  const trackedMeta = getRevenueOverlaysMeta();

  // Full-catalog leaderboard (independent of tracked-repo matches) filtered
  // by the active category. Default = dev-adjacent allowlist.
  const leaderboard = getLeaderboard({
    category,
    limit: LEADERBOARD_LIMIT,
  });

  // Tracked section = every matched row, independent of category filter.
  // Always shows them even if the user narrowed the leaderboard to a
  // category the tracked matches aren't in.
  const tracked = getLeaderboard({
    category: "__all__",
    limit: 1000,
  }).rows.filter((r): r is VerifiedStartup & { matchedRepoFullName: string } =>
    Boolean(r.matchedRepoFullName),
  );

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
              {"// verified MRR across trending repos + the broader dev/AI leaderboard"}
            </span>
          </div>
          <p className="mt-2 max-w-3xl text-sm text-text-secondary">
            Revenue numbers are verified through direct read-only sync with
            each product&apos;s payment provider (Stripe, LemonSqueezy, Polar,
            and others). Top section shows tracked repos with verified revenue.
            Bottom section is the broader catalog of verified-revenue startups
            in developer-adjacent categories.
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
        <section className="mb-12" aria-labelledby="tracked-heading">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
            <h2
              id="tracked-heading"
              className="text-lg font-bold uppercase tracking-wider text-text-primary"
            >
              Tracked repos with verified revenue
            </h2>
            <span className="text-xs text-text-tertiary">
              {tracked.length.toLocaleString()} match
              {tracked.length === 1 ? "" : "es"} ·{" "}
              {trackedMeta.catalogGeneratedAt
                ? `updated ${formatRelative(trackedMeta.catalogGeneratedAt)}`
                : "never synced"}
            </span>
          </div>
          {tracked.length === 0 ? (
            <TrackedColdState />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {tracked.map((startup, i) => (
                <VerifiedStartupCard
                  key={startup.slug}
                  startup={startup}
                  rank={i + 1}
                />
              ))}
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
                {category === "__all__" ? (
                  "every category"
                ) : category ? (
                  <span className="text-text-primary">{category}</span>
                ) : (
                  "developer-adjacent categories"
                )}
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {leaderboard.rows.map((startup, i) => (
                <VerifiedStartupCard
                  key={startup.slug}
                  startup={startup}
                  rank={i + 1}
                />
              ))}
            </div>
          )}

          <footer className="mt-8 flex flex-wrap items-center gap-3 text-xs text-text-tertiary">
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

function CategoryFilter({
  active,
  available,
}: {
  active: string | null;
  available: string[];
}) {
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

function TrackedColdState() {
  return (
    <div className="rounded-card border border-dashed border-border-primary bg-bg-secondary/40 px-4 py-6 text-sm text-text-tertiary">
      No tracked repos currently match a verified-revenue startup. Most
      trending OSS isn&apos;t monetized as SaaS — Postiz-style dual-licensed
      products are rare. The leaderboard below surfaces the broader catalog.
    </div>
  );
}
