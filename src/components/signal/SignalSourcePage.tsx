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
    <main className="min-h-screen bg-bg-primary text-text-primary font-mono">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 md:py-8">
        {/* Compact eyebrow line — replaces the legacy H1+subtitle hero.
            The sidebar nav already names the page; this strip carries the
            freshness pill so readers can spot stale data at a glance. */}
        <div
          className="v2-mono mb-4 flex flex-wrap items-center justify-between gap-3 px-3 py-2"
          style={{
            background: "var(--v3-bg-025)",
            border: "1px solid var(--v3-line-100)",
            borderRadius: 2,
          }}
        >
          <span
            className="truncate text-[11px] uppercase tracking-[0.18em]"
            style={{ color: "var(--v3-ink-200)" }}
          >
            <span aria-hidden style={{ color: "var(--v3-ink-400)" }}>
              {"// "}
            </span>
            {sourceLabel}
            <span aria-hidden className="mx-1.5" style={{ color: "var(--v3-ink-500)" }}>
              ·
            </span>
            <span style={{ color: "var(--v3-ink-300)" }}>{mode}</span>
            {subtitle ? (
              <span
                aria-hidden
                className="ml-2 hidden truncate sm:inline"
                style={{ color: "var(--v3-ink-400)" }}
              >
                / {subtitle}
              </span>
            ) : null}
          </span>
          <ScrapeAge
            status={freshnessStatus}
            ageLabel={ageLabel}
            fetchedAt={fetchedAt}
          />
        </div>

        {topSlot ? <div className="mb-6">{topSlot}</div> : null}

        <SignalMetricStrip metrics={metrics} />

        <section className="mb-4 flex flex-wrap items-center gap-1.5">
          {tabs.map((t) => {
            const active = t.id === current?.id;
            const count = t.content !== undefined ? null : t.rows.length;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => switchTab(t.id)}
                className="v2-mono px-3 py-1.5 text-[11px] uppercase tracking-[0.16em] transition"
                style={{
                  border: active
                    ? "1px solid var(--v3-acc)"
                    : "1px solid var(--v3-line-200)",
                  background: active
                    ? "rgba(146, 151, 246, 0.1)"
                    : "var(--v3-bg-100)",
                  color: active ? "var(--v3-ink-000)" : "var(--v3-ink-300)",
                  borderRadius: 2,
                }}
              >
                {t.label}
                {count !== null ? (
                  <span className="ml-1.5" style={{ color: "var(--v3-ink-400)" }}>
                    ({count})
                  </span>
                ) : null}
              </button>
            );
          })}
        </section>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
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
          {rightRail ? <aside className="hidden lg:block">{rightRail}</aside> : null}
        </div>
      </div>
    </main>
  );
}

export default SignalSourcePage;
