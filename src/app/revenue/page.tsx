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
  refreshRevenueStartupsFromStore,
  type VerifiedStartup,
} from "@/lib/revenue-startups";
import {
  getRevenueOverlaysMeta,
  refreshRevenueOverlaysFromStore,
} from "@/lib/revenue-overlays";
import { VerifiedStartupCard } from "@/components/revenue/VerifiedStartupCard";
import { NewsTopHeaderV3 } from "@/components/news/NewsTopHeaderV3";
import { buildRevenueHeader } from "@/components/revenue/revenueTopMetrics";

const REVENUE_ACCENT = "rgba(34, 197, 94, 0.85)";

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
  return `$${Math.round(dollars).toLocaleString("en-US")}`;
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
  // Refresh both Redis-backed payloads before any sync getter runs. Both
  // refreshes are internally rate-limited (30s) so concurrent renders never
  // burn more than 2 Redis calls per process per refresh window.
  await Promise.all([
    refreshRevenueStartupsFromStore(),
    refreshRevenueOverlaysFromStore(),
  ]);
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

  const { cards, topStories } = buildRevenueHeader({
    rows: leaderboard.rows,
    totalInFilter: leaderboard.totalInFilter,
    totalMrrCents: leaderboard.totalMrrCents,
    topMrrCents: leaderboard.topMrrCents,
    trackedMatches: tracked.length,
  });

  return (
    <main className="min-h-screen bg-bg-primary text-text-primary font-mono">
      <div className="max-w-[1400px] mx-auto px-4 md:px-6 py-6 md:py-8">
        <div className="mb-6">
          <NewsTopHeaderV3
            eyebrow="// REVENUE · VERIFIED MRR"
            status={`${leaderboard.totalInFilter.toLocaleString("en-US")} STARTUPS · ${tracked.length} TRACKED`}
            cards={cards}
            topStories={topStories}
            accent={REVENUE_ACCENT}
          />
        </div>

        {/* Founders CTA — compact, beside the header */}
        <div
          className="mb-6 flex flex-wrap items-center gap-3 px-4 py-3 text-xs"
          style={{
            background: "rgba(34, 197, 94, 0.05)",
            border: "1px solid rgba(34, 197, 94, 0.3)",
            borderRadius: 2,
          }}
        >
          <span
            className="v2-mono text-[10px] font-semibold uppercase tracking-[0.18em]"
            style={{ color: "var(--v3-sig-green)" }}
          >
            <BadgeCheck className="mr-1 inline size-3" aria-hidden />
            Founders
          </span>
          <span style={{ color: "var(--v3-ink-300)" }}>
            Don&apos;t see your project? Link a verified-revenue profile or
            self-report your MRR.
          </span>
          <Link
            href="/submit/revenue"
            className="ml-auto inline-flex items-center gap-1 font-mono text-xs font-semibold hover:underline"
            style={{ color: "var(--v3-ink-100)" }}
          >
            Claim or submit revenue →
          </Link>
        </div>

        {/* SECTION 1 — tracked repos ----------------------------------- */}
        <section className="mb-12" aria-labelledby="tracked-heading">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
            <h2
              id="tracked-heading"
              className="v2-mono text-[13px] font-bold uppercase tracking-[0.18em]"
              style={{ color: "var(--v3-ink-100)" }}
            >
              {"// Tracked repos with verified revenue"}
            </h2>
            <span
              className="v2-mono text-[11px] tracking-[0.14em]"
              style={{ color: "var(--v3-ink-400)" }}
            >
              {tracked.length.toLocaleString("en-US")} match
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
              {tracked.map((startup, i) => {
                const stagger = Math.min(i, 6) * 50;
                return (
                  <div
                    key={startup.slug}
                    style={{
                      animation: "slide-up 0.35s cubic-bezier(0.2, 0.8, 0.2, 1) both",
                      animationDelay: stagger > 0 ? `${stagger}ms` : undefined,
                    }}
                  >
                    <VerifiedStartupCard startup={startup} rank={i + 1} />
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* SECTION 2 — broader leaderboard ---------------------------- */}
        <section aria-labelledby="leaderboard-heading">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <h2
                id="leaderboard-heading"
                className="v2-mono text-[13px] font-bold uppercase tracking-[0.18em]"
                style={{ color: "var(--v3-ink-100)" }}
              >
                {"// Verified revenue leaderboard"}
              </h2>
              <p
                className="mt-1 text-[11px]"
                style={{ color: "var(--v3-ink-400)" }}
              >
                Top {Math.min(LEADERBOARD_LIMIT, leaderboard.rows.length)} of{" "}
                {leaderboard.totalInFilter.toLocaleString("en-US")} verified-revenue
                startup(s) in{" "}
                {category === "__all__" ? (
                  "every category"
                ) : category ? (
                  <span style={{ color: "var(--v3-ink-100)" }}>{category}</span>
                ) : (
                  "developer-adjacent categories"
                )}
                .
              </p>
            </div>
            <span
              className="v2-mono text-[11px] tracking-[0.14em]"
              style={{ color: "var(--v3-ink-300)" }}
            >
              Combined MRR: {formatUsd(leaderboard.totalMrrCents)}
            </span>
          </div>

          <CategoryFilter
            active={category}
            available={leaderboard.availableCategories}
          />

          {leaderboard.rows.length === 0 ? (
            <div
              className="px-4 py-6 text-sm"
              style={{
                background: "var(--v3-bg-025)",
                border: "1px dashed var(--v3-line-100)",
                borderRadius: 2,
                color: "var(--v3-ink-400)",
              }}
            >
              No startups in this filter.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {leaderboard.rows.map((startup, i) => {
                const stagger = Math.min(i, 6) * 50;
                return (
                  <div
                    key={startup.slug}
                    style={{
                      animation: "slide-up 0.35s cubic-bezier(0.2, 0.8, 0.2, 1) both",
                      animationDelay: stagger > 0 ? `${stagger}ms` : undefined,
                    }}
                  >
                    <VerifiedStartupCard startup={startup} rank={i + 1} />
                  </div>
                );
              })}
            </div>
          )}

          <footer
            className="mt-8 flex flex-wrap items-center gap-3 text-xs"
            style={{ color: "var(--v3-ink-400)" }}
          >
            <Link
              href="/tools/revenue-estimate"
              className="transition-colors hover:text-[color:var(--v3-ink-100)]"
              style={{ color: "var(--v3-ink-300)" }}
            >
              Try the MRR estimator →
            </Link>
            <span aria-hidden style={{ color: "var(--v3-line-300)" }}>·</span>
            <Link
              href="/submit/revenue"
              className="transition-colors hover:text-[color:var(--v3-ink-100)]"
              style={{ color: "var(--v3-ink-300)" }}
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
          className="v2-mono px-2.5 py-1 text-[11px] uppercase tracking-[0.16em] transition"
          style={{
            border: chip.active
              ? "1px solid var(--v3-sig-green)"
              : "1px solid var(--v3-line-200)",
            background: chip.active
              ? "rgba(34, 197, 94, 0.1)"
              : "var(--v3-bg-100)",
            color: chip.active ? "var(--v3-ink-000)" : "var(--v3-ink-300)",
            borderRadius: 2,
          }}
        >
          {chip.label}
        </Link>
      ))}
    </div>
  );
}

function TrackedColdState() {
  return (
    <div
      className="px-4 py-6 text-sm"
      style={{
        background: "var(--v3-bg-025)",
        border: "1px dashed var(--v3-line-100)",
        borderRadius: 2,
        color: "var(--v3-ink-400)",
      }}
    >
      No tracked repos currently match a verified-revenue startup. Most
      trending OSS isn&apos;t monetized as SaaS — Postiz-style dual-licensed
      products are rare. The leaderboard below surfaces the broader catalog.
    </div>
  );
}
