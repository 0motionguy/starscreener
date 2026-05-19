"use client";

import { useFilterStore, useWatchlistStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { TerminalTab } from "@/lib/types";

interface TabDef {
  id: TerminalTab;
  label: string;
}

const TABS: TabDef[] = [
  { id: "trending", label: "TRENDING" },
  { id: "gainers", label: "GAINERS" },
  { id: "new", label: "NEW" },
  { id: "watchlisted", label: "WATCHLIST" },
];

/**
 * TabBar — 4 terminal tabs (Trending / Gainers / New / Watchlisted).
 *
 * Reads `activeTab` + `activeMetaFilter` from useFilterStore and the watched
 * repo count from useWatchlistStore. When a meta filter is active, tabs dim
 * to 50% because the filter semantics override the tab preset. Clicking a
 * tab applies the tab's sort preset (handled inside `setActiveTab`) and
 * clears any active meta filter.
 */
export function TabBar() {
  const activeTab = useFilterStore((s) => s.activeTab);
  const activeMeta = useFilterStore((s) => s.activeMetaFilter);
  const setActiveTab = useFilterStore((s) => s.setActiveTab);
  const watchedCount = useWatchlistStore((s) => s.repos.length);

  const metaOverrides = activeMeta !== null;

  return (
    <div
      role="tablist"
      aria-label="Terminal tabs"
      className={cn(
        "flex items-center gap-1",
        metaOverrides && "opacity-50",
      )}
    >
      {TABS.map((tab) => {
        const isActive = activeTab === tab.id && !metaOverrides;
        const isWatchlisted = tab.id === "watchlisted";
        const watchlistEmpty = isWatchlisted && watchedCount === 0;

        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            disabled={watchlistEmpty}
            title={
              watchlistEmpty ? "Add repos to your watchlist" : undefined
            }
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "v2-mono inline-flex items-center gap-1.5",
              "px-2.5 py-1 transition-colors duration-150",
              "focus-visible:outline-none",
              watchlistEmpty && "opacity-40 cursor-not-allowed",
            )}
            style={{
              fontSize: 10,
              borderRadius: 2,
              border: "1px solid",
              borderColor: isActive
                ? "var(--v2-acc)"
                : "var(--v2-line-300)",
              background: isActive ? "var(--v2-acc-soft)" : "transparent",
              color: isActive ? "var(--v2-acc)" : "var(--v2-ink-200)",
            }}
          >
            {tab.label}
            {isWatchlisted && watchedCount > 0 && (
              <span
                className="tabular-nums"
                style={{
                  fontSize: 9,
                  padding: "1px 4px",
                  borderRadius: 1,
                  background: isActive
                    ? "var(--v2-acc)"
                    : "var(--v2-bg-200)",
                  color: isActive ? "#08090a" : "var(--v2-ink-300)",
                }}
              >
                {watchedCount}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
