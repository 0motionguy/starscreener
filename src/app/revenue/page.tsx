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
    <main className="home-surface funding-page revenue-page">
      <section className="page-head">
        <div>
          <div className="crumb">
            <b>Revenue</b> / trustmrr / verified mrr
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

      <section className="verdict">
        <div className="v-stamp">
          revenue
          <span className="ts">{formatUsd(leaderboard.totalMrrCents)}</span>
          <span className="ago">combined mrr</span>
        </div>
        <p className="v-text">
          <b>{leaderboard.totalInFilter.toLocaleString("en-US")}</b> verified
          startups are in this view, led by{" "}
          <span className="hl-early">
            {topStartup ? topStartup.name : "no active startup"}
          </span>{" "}
          with <span className="hl-div">{tracked.length}</span> tracked repo
          matches.
        </p>
        <div className="v-actions">
          <Link href="/submit/revenue">Claim MRR</Link>
        </div>
      </section>

      <MetricGrid columns={6} className="kpi-band">
        <Metric
          label="startups"
          value={leaderboard.totalInFilter.toLocaleString("en-US")}
          sub="verified"
          tone="positive"
          pip
        />
        <Metric
          label="top mrr"
          value={formatUsd(leaderboard.topMrrCents)}
          sub={topStartup?.name ?? "leader"}
          tone="accent"
          pip
        />
        <Metric
          label="aggregate"
          value={formatUsd(leaderboard.totalMrrCents)}
          sub="combined mrr"
          tone="positive"
          pip
        />
        <Metric
          label="repo matches"
          value={tracked.length.toLocaleString("en-US")}
          sub="tracked"
          tone="warning"
          pip
        />
        <Metric
          label="categories"
          value={leaderboard.availableCategories.length.toLocaleString("en-US")}
          sub={category ?? "default"}
        />
        <Metric
          label="growth"
          value={positiveGrowth.toLocaleString("en-US")}
          sub="positive 30d"
          tone="positive"
        />
      </MetricGrid>

      <CategoryFilter active={category} available={leaderboard.availableCategories} />

      <section className="founder-callout">
        <span className="founder-kicker">
          <BadgeCheck className="size-3" aria-hidden />
          Founders
        </span>
        <span>
          Don&apos;t see your project? Link a verified-revenue profile or
          self-report your MRR.
        </span>
        <Link href="/submit/revenue">Claim or submit revenue -&gt;</Link>
      </section>

      <section aria-labelledby="tracked-heading">
        <SectionHead
          id="tracked-heading"
          num="01"
          title="Tracked repos with verified revenue"
          meta={`${tracked.length.toLocaleString("en-US")} match${
            tracked.length === 1 ? "" : "es"
          } / updated ${updatedLabel}`}
        />
        {tracked.length === 0 ? (
          <TrackedColdState />
        ) : (
          <div className="revenue-grid">
            {tracked.map((startup, i) => (
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

        <footer className="link-row">
          <Link href="/tools/revenue-estimate">Try the MRR estimator -&gt;</Link>
          <Link href="/submit/revenue">Claim or submit revenue -&gt;</Link>
        </footer>
      </section>
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
          className={`chip ${chip.active ? "on" : ""}`}
        >
          {chip.label}
        </Link>
      ))}
    </div>
  );
}

function TrackedColdState() {
  return (
    <div className="empty-panel">
      No tracked repos currently match a verified-revenue startup. Most
      trending OSS isn&apos;t monetized as SaaS - Postiz-style dual-licensed
      products are rare. The leaderboard below surfaces the broader catalog.
    </div>
  );
}
