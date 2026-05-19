"use client";

import { useState, type ReactNode } from "react";

type TwitterTab = "global" | "trending";

interface TwitterTabSwitcherProps {
  globalCount: number;
  trendingCount: number;
  globalTable: ReactNode;
  trendingTable: ReactNode;
}

export function TwitterTabSwitcher({
  globalCount,
  trendingCount,
  globalTable,
  trendingTable,
}: TwitterTabSwitcherProps) {
  const [activeTab, setActiveTab] = useState<TwitterTab>("global");
  const tabs: Array<{ id: TwitterTab; label: string; count: number }> = [
    {
      id: "global",
      label: "Top X buzz",
      count: globalCount,
    },
    {
      id: "trending",
      label: "By repo momentum",
      count: trendingCount,
    },
  ];

  return (
    <>
      <nav
        aria-label="Twitter leaderboard tabs"
        className="mb-6 flex items-center gap-1 overflow-x-auto scrollbar-hide"
        style={{ borderBottom: "1px solid var(--v4-line-100)" }}
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              aria-pressed={isActive}
              className="v2-mono inline-flex min-h-[40px] shrink-0 items-center gap-2 px-3 text-[11px] uppercase tracking-[0.18em] transition-colors"
              style={{
                color: isActive ? "var(--v4-ink-100)" : "var(--v4-ink-400)",
                borderBottom: isActive
                  ? "2px solid var(--v4-src-x)"
                  : "2px solid transparent",
              }}
              onClick={() => setActiveTab(tab.id)}
            >
              <span>{tab.label}</span>
              <span
                className="inline-flex h-[18px] min-w-[22px] items-center justify-center px-1 text-[10px] tabular-nums"
                style={{
                  border: "1px solid var(--v4-line-200)",
                  background: "var(--v4-bg-100)",
                  color: "var(--v4-ink-400)",
                  borderRadius: 2,
                }}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </nav>
      {activeTab === "global" ? globalTable : trendingTable}
    </>
  );
}
