"use client";

// Unified template for legacy news-source pages.

import { useCallback, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { ScrapeAge } from "./ScrapeAge";
import { RepoMentionsTab, type RepoMentionRow } from "./RepoMentionsTab";
import { NewsTab, type NewsItem } from "./NewsTab";
import type { FreshnessStatus } from "@/lib/news/freshness";

export interface MetricTile {
  label: string;
  value: string | number;
  hint?: string | null;
}

interface NewsSourceLayoutProps {
  source: string;
  sourceLabel: string;
  tagline?: string;
  description?: string;
  fetchedAt: string | null | undefined;
  freshnessStatus: FreshnessStatus;
  ageLabel: string;
  staleAfterMs: number;
  metrics: MetricTile[];
  mentionsRows: RepoMentionRow[];
  newsItems: NewsItem[];
  rightRail?: React.ReactNode;
  mentionsWindowLabel?: string;
}

type Tab = "mentions" | "news";

function isTab(value: string | null): value is Tab {
  return value === "mentions" || value === "news";
}

export function NewsSourceLayout({
  sourceLabel,
  tagline,
  description,
  fetchedAt,
  freshnessStatus,
  ageLabel,
  metrics,
  mentionsRows,
  newsItems,
  rightRail,
  mentionsWindowLabel = "7d",
}: NewsSourceLayoutProps) {
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
    <main className="v4-root news-source-page px-4 py-6 font-mono md:px-6 md:py-8">
      <section className="v4-page-head">
        <div className="v4-page-head__main">
          <div className="v4-page-head__crumb">
            <b>{sourceLabel}</b> / source terminal
          </div>
          <h1 className="v4-page-head__h1">{tagline ?? sourceLabel}</h1>
          {description ? (
            <p className="v4-page-head__lede">{description}</p>
          ) : null}
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

      <section className="v4-filter-bar news-source-filter">
        <span className="v4-chip-group__label">Freshness</span>
        <ScrapeAge
          status={freshnessStatus}
          ageLabel={ageLabel}
          fetchedAt={fetchedAt}
        />
      </section>

      {metrics.length > 0 ? (
        <section className="kpi-strip news-source-metrics">
          {metrics.map((metric) => (
            <StatTile key={metric.label} {...metric} />
          ))}
        </section>
      ) : null}

      <section className="v4-filter-bar news-source-tabs">
        <span className="v4-chip-group__label">View</span>
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

      <div className="news-source-layout">
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
        {rightRail ? <aside className="news-source-rail">{rightRail}</aside> : null}
      </div>
    </main>
  );
}

function StatTile({ label, value, hint }: MetricTile) {
  return (
    <div className="kpi">
      <span className="lbl">{label}</span>
      <span className="val">{value}</span>
      {hint ? <span className="sub" title={hint}>{hint}</span> : null}
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
      className={`v4-chip ${active ? "v4-chip--on" : ""}`}
    >
      {children}
      {typeof count === "number" ? (
        <span className="v4-chip__count">({count})</span>
      ) : null}
    </button>
  );
}

export default NewsSourceLayout;
