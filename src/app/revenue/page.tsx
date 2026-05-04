// /revenue - Revenue Terminal
//
// Two sections:
//  1. Tracked repos with verified revenue - cards whose product matched one
//     of our trending repos. Anchored to /repo/[owner]/[name].
//  2. Verified revenue leaderboard - broader catalog of verified-revenue
//     startups in dev/AI-adjacent categories.

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
import { Metric, MetricGrid } from "@/components/ui/Metric";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "TrendingRepo - Revenue Terminal",
  description:
    "Verified MRR for trending repos and the broader dev/AI-adjacent verified-revenue leaderboard. Revenue is verified through direct read-only sync with each product's payment provider.",
  alternates: { canonical: "/revenue" },
};

const LEADERBOARD_LIMIT = 120;

interface PageProps {
  searchParams: Promise<{ category?: string | string[] }>;
}

function formatUsd(cents: number | null): string {
  if (cents === null || !Number.isFinite(cents)) return "—";
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

function formatClock(iso: string | undefined): string {
  if (!iso) return "warming";
  return new Date(iso).toISOString().slice(11, 19);
}

export default async function RevenuePage({ searchParams }: PageProps) {
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
  const leaderboard = getLeaderboard({
    category,
    limit: LEADERBOARD_LIMIT,
  });

  const tracked = getLeaderboard({
    category: "__all__",
    limit: 1000,
  }).rows.filter((r): r is VerifiedStartup & { matchedRepoFullName: string } =>
    Boolean(r.matchedRepoFullName),
  );

  const topStartup = leaderboard.rows
    .slice()
    .sort((a, b) => b.mrrCents - a.mrrCents)[0];
  const positiveGrowth = leaderboard.rows.filter(
    (startup) =>
      typeof startup.growthMrr30d === "number" && startup.growthMrr30d > 0,
  ).length;
  const updatedLabel = trackedMeta.catalogGeneratedAt
    ? formatRelative(trackedMeta.catalogGeneratedAt)
    : "not synced";

  return (
    <main className="v4-root font-mono">
      <div className="max-w-[1400px] mx-auto px-4 md:px-6 py-6 md:py-8">
        <div className="mb-6">
          <NewsTopHeaderV3
            routeTitle="REVENUE · VERIFIED MRR"
            liveLabel="LIVE"
            eyebrow="// REVENUE · TRUSTMRR · LIVE"
            meta={[
              {
                label: "STARTUPS",
                value: leaderboard.totalInFilter.toLocaleString("en-US"),
              },
              { label: "TRACKED", value: tracked.length.toLocaleString("en-US") },
            ]}
            cards={cards}
            topStories={topStories}
            accent={REVENUE_ACCENT}
            caption={[
              "// LAYOUT compact-v1",
              "· 3-COL · 320 / 1FR / 1FR",
              "· DATA UNCHANGED",
            ]}
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
            style={{ color: "var(--v4-money)" }}
          >
            <BadgeCheck className="mr-1 inline size-3" aria-hidden />
            Founders
          </span>
          <span style={{ color: "var(--v4-ink-300)" }}>
            Don&apos;t see your project? Link a verified-revenue profile or
            self-report your MRR.
          </span>
          <Link
            href="/submit/revenue"
            className="ml-auto inline-flex items-center gap-1 font-mono text-xs font-semibold hover:underline"
            style={{ color: "var(--v4-ink-100)" }}
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
              style={{ color: "var(--v4-ink-100)" }}
            >
              {"// Tracked repos with verified revenue"}
            </h2>
            <span
              className="v2-mono text-[11px] tracking-[0.14em]"
              style={{ color: "var(--v4-ink-400)" }}
            >
              {tracked.length.toLocaleString("en-US")} match
              {tracked.length === 1 ? "" : "es"} ·{" "}
              {trackedMeta.catalogGeneratedAt
                ? `updated ${formatRelative(trackedMeta.catalogGeneratedAt)}`
                : "never synced"}
            </span>
          </div>
          <h1>Verified revenue for developer startups.</h1>
          <p className="lede">
            MRR-backed startup signals matched against trending repositories,
            founder profiles, and developer-adjacent categories.
          </p>
        </div>
        <div className="clock">
          <span className="big">{updatedLabel}</span>
          <span className="live">verified</span>
        </div>
      </section>

        {/* SECTION 2 — broader leaderboard ---------------------------- */}
        <section aria-labelledby="leaderboard-heading">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <h2
                id="leaderboard-heading"
                className="v2-mono text-[13px] font-bold uppercase tracking-[0.18em]"
                style={{ color: "var(--v4-ink-100)" }}
              >
                {"// Verified revenue leaderboard"}
              </h2>
              <p
                className="mt-1 text-[11px]"
                style={{ color: "var(--v4-ink-400)" }}
              >
                Top {Math.min(LEADERBOARD_LIMIT, leaderboard.rows.length)} of{" "}
                {leaderboard.totalInFilter.toLocaleString("en-US")} verified-revenue
                startup(s) in{" "}
                {category === "__all__" ? (
                  "every category"
                ) : category ? (
                  <span style={{ color: "var(--v4-ink-100)" }}>{category}</span>
                ) : (
                  "developer-adjacent categories"
                )}
                .
              </p>
            </div>
            <span
              className="v2-mono text-[11px] tracking-[0.14em]"
              style={{ color: "var(--v4-ink-300)" }}
            >
              Combined MRR: {formatUsd(leaderboard.totalMrrCents)}
            </span>
          </div>
        )}
      </section>

      <section aria-labelledby="leaderboard-heading">
        <SectionHead
          id="leaderboard-heading"
          num="02"
          title="Verified revenue leaderboard"
          meta={`top ${Math.min(
            LEADERBOARD_LIMIT,
            leaderboard.rows.length,
          )} / ${formatUsd(leaderboard.totalMrrCents)}`}
        />
        <CategoryFilter active={category} available={leaderboard.availableCategories} />
        {leaderboard.rows.length === 0 ? (
          <div className="empty-panel">No startups in this filter.</div>
        ) : (
          <div className="revenue-grid">
            {leaderboard.rows.map((startup, i) => (
              <div
                key={startup.slug}
                style={{
                  animation:
                    "slide-up 0.35s cubic-bezier(0.2, 0.8, 0.2, 1) both",
                  animationDelay: i > 0 ? `${Math.min(i, 6) * 50}ms` : undefined,
                }}
              >
                <VerifiedStartupCard startup={startup} rank={i + 1} />
              </div>
            ))}
          </div>
        )}

          {leaderboard.rows.length === 0 ? (
            <div
              className="px-4 py-6 text-sm"
              style={{
                background: "var(--v4-bg-025)",
                border: "1px dashed var(--v4-line-100)",
                borderRadius: 2,
                color: "var(--v4-ink-400)",
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
            style={{ color: "var(--v4-ink-400)" }}
          >
            <Link
              href="/tools/revenue-estimate"
              className="transition-colors hover:text-[color:var(--v4-ink-100)]"
              style={{ color: "var(--v4-ink-300)" }}
            >
              Try the MRR estimator →
            </Link>
            <span aria-hidden style={{ color: "var(--v4-line-300)" }}>·</span>
            <Link
              href="/submit/revenue"
              className="transition-colors hover:text-[color:var(--v4-ink-100)]"
              style={{ color: "var(--v4-ink-300)" }}
            >
              Claim or submit revenue →
            </Link>
          </footer>
        </section>
      </div>
    </main>
  );
}

function SectionHead({
  id,
  num,
  title,
  meta,
}: {
  id: string;
  num: string;
  title: string;
  meta: string;
}) {
  return (
    <div className="sec-head">
      <span className="sec-num">{`// ${num}`}</span>
      <h2 id={id} className="sec-title">
        {title}
      </h2>
      <span className="sec-meta">{meta}</span>
    </div>
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
      label: "Dev-adjacent",
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
    <div className="filter-bar revenue-filter">
      <span className="lbl">Category</span>
      {chips.map((chip) => (
        <Link
          key={chip.href}
          href={chip.href}
          className="v2-mono px-2.5 py-1 text-[11px] uppercase tracking-[0.16em] transition"
          style={{
            border: chip.active
              ? "1px solid var(--v4-money)"
              : "1px solid var(--v4-line-200)",
            background: chip.active
              ? "rgba(34, 197, 94, 0.1)"
              : "var(--v4-bg-100)",
            color: chip.active ? "var(--v4-ink-000)" : "var(--v4-ink-300)",
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
        background: "var(--v4-bg-025)",
        border: "1px dashed var(--v4-line-100)",
        borderRadius: 2,
        color: "var(--v4-ink-400)",
      }}
    >
      No tracked repos currently match a verified-revenue startup. Most
      trending OSS isn&apos;t monetized as SaaS - Postiz-style dual-licensed
      products are rare. The leaderboard below surfaces the broader catalog.
    </div>
  );
}
