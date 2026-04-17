"use client";

import { useFilterStore, useWatchlistStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { TerminalTab } from "@/lib/types";

interface TabDef {
  id: TerminalTab;
  label: string;
}

const TABS: TabDef[] = [
  { id: "trending", label: "Trending" },
  { id: "gainers", label: "Gainers" },
  { id: "new", label: "New" },
  { id: "watchlisted", label: "Watchlisted" },
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
              "px-3 py-1.5 rounded-md text-sm font-medium",
              "transition-colors duration-150",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-functional/40",
              isActive
                ? "bg-functional-glow text-functional ring-1 ring-functional/30"
                : "text-text-secondary hover:text-text-primary",
              watchlistEmpty && "opacity-50 cursor-not-allowed hover:text-text-secondary",
            )}
          >
            {tab.label}
            {isWatchlisted && watchedCount > 0 && (
              <span
                className={cn(
                  "ml-1.5 font-mono text-[10px] tabular-nums",
                  "px-1.5 py-0.5 rounded-full",
                  isActive
                    ? "bg-functional/15 text-functional"
                    : "bg-bg-tertiary text-text-tertiary",
                )}
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
