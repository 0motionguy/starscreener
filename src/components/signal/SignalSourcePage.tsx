"use client";

// Unified Signal Terminal page wrapper. Replaces the older
// NewsSourceLayout for any page that has migrated to the canonical
// 6-card metric strip + columns-driven SignalTable.
//
// The parent page (server component) computes everything — metrics,
// rows per tab, freshness verdict — and hands plain JSON to this client
// wrapper which holds the active-tab state and syncs ?tab= to the URL.
//
// Stale handling matches the user's "no scan-now buttons, just show
// data" stance: a small color-coded LIVE/STALE/COLD pill in the header
// is the only freshness signal. Server-side auto-rescrape kicks in
// quietly when stale (see src/lib/news/auto-rescrape.ts).

import { useCallback, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { ScrapeAge } from "@/components/news/ScrapeAge";
import type { FreshnessStatus } from "@/lib/news/freshness";
import {
  SignalMetricStrip,
} from "./SignalMetricStrip";
import type { SignalMetricCardProps } from "./SignalMetricCard";
import { SignalTable, type SignalColumn, type SignalRow } from "./SignalTable";

export interface SignalTabSpec {
  /** Used as the URL `?tab=` value. The first tab is the default and
   * stays canonical (no `?tab=` written to the URL). */
  id: string;
  label: string;
  /** Override the default columns from SignalTable. */
  columns?: SignalColumn[];
  rows: SignalRow[];
  emptyTitle?: string;
  emptySubtitle?: string;
  /** Tab can render arbitrary content instead of a SignalTable (e.g.
   * Subreddits dense list). When `content` is set, rows is ignored.
   * Pass a ReactNode (already-rendered element) — passing a function
   * would cross the server→client component boundary. */
  content?: React.ReactNode;
}

interface SignalSourcePageProps {
  /** Source id (for the LiveAge tooltip / future analytics). */
  source: string;
  /** Mode label after the slash, e.g. "TRENDING". */
  mode: string;
  /** Page name shown left of the slash, e.g. "REDDIT". */
  sourceLabel: string;
  /** One-line subtitle beneath the title. */
  subtitle?: string;
  /** Pre-computed by the parent. */
  fetchedAt: string | null | undefined;
  freshnessStatus: FreshnessStatus;
  ageLabel: string;
  metrics: SignalMetricCardProps[];
  tabs: SignalTabSpec[];
  /** Optional right-rail content (lg+). */
  rightRail?: React.ReactNode;
  /**
   * Optional content rendered between the header strip and the metric
   * grid. /signals uses this to inject the V3 cross-source summary
   * (3 charts + 3 hero stories). Server-rendered ReactNode only —
   * functions would cross the client boundary.
   */
  topSlot?: React.ReactNode;
}

export function SignalSourcePage({
  mode,
  sourceLabel,
  subtitle,
  fetchedAt,
  freshnessStatus,
  ageLabel,
  metrics,
  tabs,
  rightRail,
  topSlot,
}: SignalSourcePageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const initialTab =
    tabs.find((t) => t.id === tabParam)?.id ?? tabs[0]?.id ?? "";
  const [activeTab, setActiveTab] = useState<string>(initialTab);

  const switchTab = useCallback(
    (next: string) => {
      setActiveTab(next);
      const params = new URLSearchParams(searchParams.toString());
      if (next === tabs[0]?.id) params.delete("tab");
      else params.set("tab", next);
      const qs = params.toString();
      router.replace(qs ? `?${qs}` : "?", { scroll: false });
    },
    [router, searchParams, tabs],
  );

  const current = tabs.find((t) => t.id === activeTab) ?? tabs[0];

  return (
    <main className="v4-root signals-page px-4 py-6 font-mono md:px-6 md:py-8">
      <section className="v4-page-head">
        <div className="v4-page-head__main">
          <div className="v4-page-head__crumb">
            <b>{sourceLabel}</b> / {mode} / signal terminal
          </div>
          <h1 className="v4-page-head__h1">The newsroom for AI &amp; dev tooling.</h1>
          {subtitle ? <p className="v4-page-head__lede">{subtitle}</p> : null}
        </div>
        <div className="v4-page-head__clock">
          <span className="block text-[14px] tracking-[0.16em] text-[color:var(--v4-ink-100)]">
            {ageLabel}
          </span>
          <span className="v4-live-dot v4-live-dot--money mt-1 justify-end">
            <span className="v4-live-dot__pip" aria-hidden="true" />
            Feed {freshnessStatus}
          </span>
        </div>
      </section>

      <div className="v4-filter-bar signals-filter">
        <span className="v4-chip-group__label">Sources</span>
        <span className="v4-chip v4-chip--on">All</span>
        <span className="v4-chip v4-chip--on">HN</span>
        <span className="v4-chip v4-chip--on">Reddit</span>
        <span className="v4-chip v4-chip--on">Bluesky</span>
        <span className="v4-chip v4-chip--on">Dev.to</span>
        <span className="v4-chip v4-chip--on">Lobsters</span>
        <span className="v4-chip-group__divider" aria-hidden="true" />
        <span className="v4-chip-group__label">Freshness</span>
        <ScrapeAge
          status={freshnessStatus}
          ageLabel={ageLabel}
          fetchedAt={fetchedAt}
        />
      </div>

      {topSlot ? <div className="signals-top-slot">{topSlot}</div> : null}

        <SignalMetricStrip metrics={metrics} />

        <section className="v4-filter-bar signals-tabs">
          <span className="v4-chip-group__label">View</span>
          {tabs.map((t) => {
            const active = t.id === current?.id;
            const count = t.content !== undefined ? null : t.rows.length;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => switchTab(t.id)}
                className={`v4-chip ${active ? "v4-chip--on" : ""}`}
              >
                {t.label}
                {count !== null ? (
                  <span className="v4-chip__count">
                    ({count})
                  </span>
                ) : null}
              </button>
            );
          })}
        </section>

        <div className="signals-layout">
          <div className="min-w-0">
            {current ? (
              current.content !== undefined ? (
                current.content
              ) : (
                <SignalTable
                  rows={current.rows}
                  columns={current.columns}
                  emptyTitle={current.emptyTitle}
                  emptySubtitle={current.emptySubtitle}
                />
              )
            ) : null}
          </div>
          {rightRail ? <aside className="signals-rail">{rightRail}</aside> : null}
        </div>
    </main>
  );
}

export default SignalSourcePage;
