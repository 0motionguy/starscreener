// /revenue — V4 W4 Revenue Terminal.
//
// Two sections:
//  1. Tracked repos with verified revenue
//  2. Verified revenue leaderboard (broader dev-adjacent catalog)

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

// V4 (CORPUS) primitives.
import { PageHead } from "@/components/ui/PageHead";
import { SectionHead } from "@/components/ui/SectionHead";
import { KpiBand } from "@/components/ui/KpiBand";
import { LiveDot } from "@/components/ui/LiveDot";

export const revalidate = 600;

export const metadata: Metadata = {
  // Layout template appends ` — TrendingRepo`; bare title here.
  title: "Revenue Terminal",
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

  return (
    <main className="home-surface">
      <PageHead
        crumb={
          <>
            <b>REVENUE</b> · TERMINAL · /REVENUE
          </>
        }
        h1="Verified MRR for trending repos."
        lede="Revenue verified via direct read-only sync with each product's payment provider — Stripe, Lemon Squeezy, Paddle. Tracked OSS matches up top, broader dev-adjacent catalog below."
        clock={
          <>
            <span className="big">{formatClock(trackedMeta.catalogGeneratedAt ?? undefined)}</span>
            <span className="muted">UTC · CATALOG SYNC</span>
            <LiveDot label="LIVE · TRUSTMRR" />
          </>
        }
      />

      <KpiBand
        className="kpi-band"
        cells={[
          {
            label: "STARTUPS",
            value: leaderboard.totalInFilter.toLocaleString("en-US"),
            sub: "in current filter",
            pip: "var(--v4-money)",
          },
          {
            label: "TRACKED",
            value: tracked.length.toLocaleString("en-US"),
            sub: "matched OSS",
            tone: "money",
            pip: "var(--v4-money)",
          },
          {
            label: "COMBINED MRR",
            value: formatUsd(leaderboard.totalMrrCents),
            sub: "in filter",
            tone: "acc",
            pip: "var(--v4-acc)",
          },
          {
            label: "TOP MRR",
            value: formatUsd(leaderboard.topMrrCents),
            sub: "leader's MRR",
            tone: "acc",
            pip: "var(--v4-blue)",
          },
        ]}
      />

      {/* Founders CTA — compact, beside the header */}
      <div
        className="mb-6 flex flex-wrap items-center gap-3 px-4 py-3 text-xs"
        style={{
          background: "var(--v4-money-soft)",
          border: "1px solid var(--v4-money)",
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

      <SectionHead
        num="// 01"
        title="Tracked repos with verified revenue"
        meta={
          <>
            <b>{tracked.length.toLocaleString("en-US")}</b>{" "}
            match{tracked.length === 1 ? "" : "es"} ·{" "}
            {trackedMeta.catalogGeneratedAt
              ? `updated ${formatRelative(trackedMeta.catalogGeneratedAt)}`
              : "never synced"}
          </>
        }
      />
      <section className="mb-12">
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

      <SectionHead
        num="// 02"
        title="Verified revenue leaderboard"
        meta={
          <>
            <b>{Math.min(LEADERBOARD_LIMIT, leaderboard.rows.length)}</b> of{" "}
            {leaderboard.totalInFilter.toLocaleString("en-US")} ·{" "}
            {category === "__all__"
              ? "every category"
              : category ?? "dev-adjacent"}
            {" · "}
            {formatUsd(leaderboard.totalMrrCents)} combined
          </>
        }
      />
      <section>
        <CategoryFilter
          active={category}
          available={leaderboard.availableCategories}
        />

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
              ? "1px solid var(--v4-money)"
              : "1px solid var(--v4-line-200)",
            background: chip.active
              ? "var(--v4-money-soft)"
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
      trending OSS isn&apos;t monetized as SaaS — Postiz-style dual-licensed
      products are rare. The leaderboard below surfaces the broader catalog.
    </div>
  );
}
