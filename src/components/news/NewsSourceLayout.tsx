"use client";

// Unified template for every news-source page (Reddit, HN, Bluesky,
// dev.to, Lobsters, Twitter). The parent page is server-rendered, reads
// its data, normalizes it into the row shapes below, and hands
// everything to this client component which holds the tab state.
//
// Layout (top → bottom):
//   1. Page title + ScrapeAge badge + description
//   2. 3-4 source-specific metric tiles
//   3. Tab strip: Repo Mentions (default) / Top News
//   4. Active tab content
//
// Stale handling: if the source is cold (past its stale threshold), the
// parent passes `cold={true}` and we render only SourceDownEmptyState.
// No data leaks through.

import { useCallback, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { ScrapeAge } from "./ScrapeAge";
import { SourceDownEmptyState } from "./SourceDownEmptyState";
import { RepoMentionsTab, type RepoMentionRow } from "./RepoMentionsTab";
import { NewsTab, type NewsItem } from "./NewsTab";
import type { FreshnessStatus } from "@/lib/news/freshness";

export interface MetricTile {
  label: string;
  value: string | number;
  hint?: string | null;
}

interface NewsSourceLayoutProps {
  /** Source id passed to /api/admin/scan. */
  source: string;
  sourceLabel: string;
  /** Subtitle next to the page title, e.g. "// AI-dev firehose". */
  tagline?: string;
  description?: string;
  fetchedAt: string | null | undefined;
  /** Pre-computed by the parent (server-side) via classifyFreshness(). */
  freshnessStatus: FreshnessStatus;
  /** Pre-formatted age label, e.g. "17m". */
  ageLabel: string;
  /** Stale threshold ms — passed to SourceDownEmptyState. */
  staleAfterMs: number;
  metrics: MetricTile[];
  mentionsRows: RepoMentionRow[];
  newsItems: NewsItem[];
  /** Optional right-rail content (lg+ only) — typically a leaderboard. */
  rightRail?: React.ReactNode;
  /** Window label shown in the empty state — e.g. "7d". */
  mentionsWindowLabel?: string;
}

type Tab = "mentions" | "news";

function isTab(value: string | null): value is Tab {
  return value === "mentions" || value === "news";
}

export function NewsSourceLayout({
  source,
  sourceLabel,
  tagline,
  description,
  fetchedAt,
  freshnessStatus,
  ageLabel,
  staleAfterMs,
  metrics,
  mentionsRows,
  newsItems,
  rightRail,
  mentionsWindowLabel = "7d",
}: NewsSourceLayoutProps) {
  const cold = freshnessStatus === "cold";
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const [tab, setTab] = useState<Tab>(isTab(tabParam) ? tabParam : "mentions");

  const switchTab = useCallback(
    (next: Tab) => {
      setTab(next);
      const params = new URLSearchParams(searchParams.toString());
      if (next === "mentions") params.delete("tab");
      else params.set("tab", next);
      const qs = params.toString();
      router.replace(qs ? `?${qs}` : "?", { scroll: false });
    },
    [router, searchParams],
  );

  return (
    <main className="min-h-screen bg-bg-primary text-text-primary font-mono">
      <div className="max-w-[1400px] mx-auto px-6 py-8">
        <header className="mb-6 border-b border-border-primary pb-6">
          <div className="flex flex-wrap items-baseline gap-3">
            <h1 className="text-2xl font-bold uppercase tracking-wider">
              {sourceLabel}
            </h1>
            {tagline ? (
              <span className="text-xs text-text-tertiary">{tagline}</span>
            ) : null}
            <ScrapeAge
              status={freshnessStatus}
              ageLabel={ageLabel}
              fetchedAt={fetchedAt}
            />
          </div>
          {description ? (
            <p className="mt-2 max-w-2xl text-sm text-text-secondary">
              {description}
            </p>
          ) : null}
        </header>

        {cold ? (
          <SourceDownEmptyState
            source={source}
            sourceLabel={sourceLabel}
            ageLabel={ageLabel}
            staleAfterMs={staleAfterMs}
            fetchedAt={fetchedAt}
          />
        ) : (
          <>
            {metrics.length > 0 ? (
              <section className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
                {metrics.map((m) => (
                  <StatTile key={m.label} {...m} />
                ))}
              </section>
            ) : null}

            <section className="mb-4 flex flex-wrap items-center gap-2 text-xs">
              <TabButton
                active={tab === "mentions"}
                onClick={() => switchTab("mentions")}
                count={mentionsRows.length}
              >
                Repo Mentions
              </TabButton>
              <TabButton
                active={tab === "news"}
                onClick={() => switchTab("news")}
                count={newsItems.length}
              >
                Top News
              </TabButton>
            </section>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_280px]">
              <div className="min-w-0">
                {tab === "mentions" ? (
                  <RepoMentionsTab
                    rows={mentionsRows}
                    windowLabel={mentionsWindowLabel}
                    sourceLabel={sourceLabel}
                  />
                ) : (
                  <NewsTab items={newsItems} sourceLabel={sourceLabel} />
                )}
              </div>
              {rightRail ? (
                <aside className="hidden lg:block">{rightRail}</aside>
              ) : null}
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function StatTile({ label, value, hint }: MetricTile) {
  return (
    <div className="rounded-card border border-border-primary bg-bg-card p-3">
      <div className="text-[10px] uppercase tracking-wider text-text-tertiary">
        {label}
      </div>
      <div className="mt-1 text-base font-semibold tabular-nums">{value}</div>
      {hint ? (
        <div className="mt-1 text-[10px] text-text-tertiary truncate" title={typeof hint === "string" ? hint : undefined}>
          {hint}
        </div>
      ) : null}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  count,
  children,
}: {
  active: boolean;
  onClick: () => void;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-md border px-3 py-1.5 font-mono text-xs uppercase tracking-wider transition " +
        (active
          ? "border-brand bg-brand/10 text-text-primary"
          : "border-border-primary bg-bg-muted text-text-secondary hover:text-text-primary")
      }
    >
      {children}
      {typeof count === "number" ? (
        <span className="ml-1.5 text-text-tertiary">({count})</span>
      ) : null}
    </button>
  );
}

export default NewsSourceLayout;
