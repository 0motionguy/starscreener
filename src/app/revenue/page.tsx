// /revenue — V2 Revenue Terminal
//
// Two sections:
//  1. Tracked repos with verified revenue — cards whose product matched one
//     of our trending repos. Anchored to /repo/[owner]/[name].
//  2. Verified revenue leaderboard — broader catalog of verified-revenue
//     startups in dev/AI-adjacent categories.
//
// V2 design: TerminalBar header, mono section labels, V2 stat tile for
// combined MRR, V2 category filter chips, VerifiedStartupCard grid.

import type { Metadata } from "next";
import Link from "next/link";

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
import { TerminalBar } from "@/components/today-v2/primitives/TerminalBar";

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
  }).rows.filter(
    (r): r is VerifiedStartup & { matchedRepoFullName: string } =>
      Boolean(r.matchedRepoFullName),
  );

  return (
    <>
      <section className="border-b border-[color:var(--v2-line-100)]">
        <div className="v2-frame pt-6 pb-6">
          <TerminalBar
            label={
              <>
                <span aria-hidden>{"// "}</span>REVENUE · TERMINAL · MRR
              </>
            }
            status={`${leaderboard.totalInFilter.toLocaleString("en-US")} STARTUPS`}
          />

          <h1
            className="v2-mono mt-6 inline-flex items-center gap-2"
            style={{
              color: "var(--v2-ink-100)",
              fontSize: 12,
              letterSpacing: "0.20em",
            }}
          >
            <span aria-hidden>{"// "}</span>
            REVENUE TERMINAL · VERIFIED MRR
            <span
              aria-hidden
              className="inline-block ml-1"
              style={{
                width: 6,
                height: 6,
                background: "var(--v2-acc)",
                borderRadius: 1,
                boxShadow: "0 0 6px var(--v2-acc-glow)",
              }}
            />
          </h1>
          <p
            className="text-[14px] leading-relaxed max-w-[80ch] mt-3"
            style={{ color: "var(--v2-ink-200)" }}
          >
            Revenue numbers are verified through direct read-only sync with
            each product&apos;s payment provider (Stripe, LemonSqueezy, Polar,
            and others). Top section shows tracked repos with verified
            revenue. Bottom section is the broader catalog of verified-revenue
            startups in developer-adjacent categories.
          </p>

          <div
            className="v2-card mt-4 p-3 flex flex-wrap items-center gap-3"
            style={{
              borderColor: "var(--v2-sig-green)",
              background: "rgba(58, 214, 197, 0.05)",
            }}
          >
            <span
              className="v2-mono"
              style={{ color: "var(--v2-sig-green)", fontSize: 11 }}
            >
              <span aria-hidden>{"// "}</span>
              FOUNDERS
            </span>
            <span
              className="text-[13px]"
              style={{ color: "var(--v2-ink-200)" }}
            >
              Don&apos;t see your project? Link a verified-revenue profile or
              self-report your MRR.
            </span>
            <Link
              href="/submit/revenue"
              className="ml-auto v2-mono"
              style={{
                color: "var(--v2-acc)",
                fontSize: 11,
                letterSpacing: "0.20em",
              }}
            >
              CLAIM / SUBMIT →
            </Link>
          </div>
        </div>
      </section>

      <section className="border-b border-[color:var(--v2-line-100)]">
        <div className="v2-frame py-6">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
            <p
              className="v2-mono"
              style={{ color: "var(--v2-ink-300)" }}
            >
              <span aria-hidden>{"// "}</span>
              TRACKED · WITH VERIFIED MRR ·{" "}
              <span style={{ color: "var(--v2-ink-100)" }}>
                {tracked.length}
              </span>
            </p>
            <span
              className="v2-mono"
              style={{ color: "var(--v2-ink-400)", fontSize: 11 }}
            >
              <span aria-hidden>{"// "}</span>
              {trackedMeta.catalogGeneratedAt
                ? `UPDATED ${formatRelative(trackedMeta.catalogGeneratedAt).toUpperCase()}`
                : "NEVER SYNCED"}
            </span>
          </div>
          {tracked.length === 0 ? (
            <div className="v2-card p-6">
              <p
                className="v2-mono mb-2"
                style={{ color: "var(--v2-acc)" }}
              >
                <span aria-hidden>{"// "}</span>
                NO MATCHES
              </p>
              <p
                className="text-[13px]"
                style={{ color: "var(--v2-ink-200)" }}
              >
                No tracked repos currently match a verified-revenue startup.
                Most trending OSS isn&apos;t monetized as SaaS — Postiz-style
                dual-licensed products are rare. The leaderboard below
                surfaces the broader catalog.
              </p>
            </div>
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
        </div>
      </section>

      <section>
        <div className="v2-frame py-6">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <p
                className="v2-mono"
                style={{ color: "var(--v2-ink-300)" }}
              >
                <span aria-hidden>{"// "}</span>
                LEADERBOARD · VERIFIED REVENUE
              </p>
              <p
                className="v2-mono mt-1"
                style={{ color: "var(--v2-ink-400)", fontSize: 11 }}
              >
                <span aria-hidden>{"// "}</span>
                TOP{" "}
                <span style={{ color: "var(--v2-ink-100)" }}>
                  {Math.min(LEADERBOARD_LIMIT, leaderboard.rows.length)}
                </span>{" "}
                OF{" "}
                <span style={{ color: "var(--v2-ink-100)" }}>
                  {leaderboard.totalInFilter.toLocaleString("en-US")}
                </span>{" "}
                ·{" "}
                {category === "__all__" ? (
                  "EVERY CATEGORY"
                ) : category ? (
                  <span style={{ color: "var(--v2-ink-100)" }}>
                    {category.toUpperCase()}
                  </span>
                ) : (
                  "DEVELOPER-ADJACENT"
                )}
              </p>
            </div>
            <span
              className="v2-mono tabular-nums"
              style={{ color: "var(--v2-ink-400)", fontSize: 11 }}
            >
              <span aria-hidden>{"// "}</span>
              COMBINED MRR ·{" "}
              <span style={{ color: "var(--v2-ink-100)" }}>
                {formatUsd(leaderboard.totalMrrCents)}
              </span>
            </span>
          </div>

          <CategoryFilterV2
            active={category}
            available={leaderboard.availableCategories}
          />

          {leaderboard.rows.length === 0 ? (
            <div className="v2-card p-6">
              <p
                className="v2-mono"
                style={{ color: "var(--v2-acc)" }}
              >
                <span aria-hidden>{"// "}</span>
                NO STARTUPS · IN FILTER
              </p>
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

          <footer
            className="mt-8 flex flex-wrap items-center gap-3 v2-mono"
            style={{ color: "var(--v2-ink-400)", fontSize: 11 }}
          >
            <Link
              href="/tools/revenue-estimate"
              className="underline decoration-dotted"
              style={{ color: "var(--v2-ink-200)" }}
            >
              MRR ESTIMATOR →
            </Link>
            <span aria-hidden>·</span>
            <Link
              href="/submit/revenue"
              className="underline decoration-dotted"
              style={{ color: "var(--v2-ink-200)" }}
            >
              CLAIM / SUBMIT REVENUE →
            </Link>
          </footer>
        </div>
      </section>
    </>
  );
}

function CategoryFilterV2({
  active,
  available,
}: {
  active: string | null;
  available: string[];
}) {
  const chips: Array<{ label: string; href: string; active: boolean }> = [
    {
      label: "DEV-ADJACENT (DEFAULT)",
      href: "/revenue",
      active: active === null,
    },
    {
      label: "ALL CATEGORIES",
      href: "/revenue?category=__all__",
      active: active === "__all__",
    },
  ];
  for (const c of available) {
    chips.push({
      label: c.toUpperCase(),
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
          className="v2-mono px-3 py-1.5 inline-block transition"
          style={{
            fontSize: 11,
            letterSpacing: "0.20em",
            color: chip.active ? "var(--v2-bg-000)" : "var(--v2-ink-300)",
            background: chip.active ? "var(--v2-acc)" : "transparent",
            border: `1px solid ${
              chip.active ? "var(--v2-acc)" : "var(--v2-line-200)"
            }`,
          }}
        >
          {chip.label}
        </Link>
      ))}
    </div>
  );
}
