"use client";

// StarScreener — FilterBar (client-side so it composes cleanly with
// client pages like /watchlist that import TerminalLayout).
//
// Fetches meta counts + global stats via the existing API routes
// (/api/pipeline/meta-counts, /api/pipeline/status) at mount, then
// re-renders the interactive sub-bars.

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useFilterStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { FilterBarVariant, MetaCounts } from "@/lib/types";

import { StatsBarClient, type StatsBarStats } from "./StatsBarClient";
import { TabBar } from "./TabBar";
import { TimeRangePills } from "./TimeRangePills";
import { ViewControls } from "./ViewControls";

interface FilterBarProps {
  variant?: FilterBarVariant;
}

interface VariantConfig {
  showMetas: boolean;
  showStats: boolean;
  showTabs: boolean;
  showTime: boolean;
  showView: boolean;
}

const VARIANTS: Record<FilterBarVariant, VariantConfig> = {
  full:      { showMetas: true,  showStats: true,  showTabs: true,  showTime: true,  showView: true },
  search:    { showMetas: false, showStats: false, showTabs: false, showTime: false, showView: true },
  watchlist: { showMetas: true,  showStats: false, showTabs: false, showTime: true,  showView: true },
  category:  { showMetas: true,  showStats: true,  showTabs: false, showTime: true,  showView: true },
  minimal:   { showMetas: false, showStats: false, showTabs: false, showTime: false, showView: true },
};

const EMPTY_COUNTS: MetaCounts = {
  hot: 0, breakouts: 0, quietKillers: 0, new: 0,
  discussed: 0, rankClimbers: 0, freshReleases: 0,
};

export function FilterBar({ variant = "full" }: FilterBarProps) {
  const cfg = VARIANTS[variant];
  const [counts, setCounts] = useState<MetaCounts>(EMPTY_COUNTS);
  const [stats, setStats] = useState<StatsBarStats | null>(null);

  // AGN-609 — surface a "Clear filters" chip whenever any transient
  // narrative filter diverges from defaults. Only the bits that actually
  // shape the visible list are tracked here; layout prefs (density, view
  // mode, columns) are user preferences, not "filters".
  const timeRange = useFilterStore((s) => s.timeRange);
  const activeMetaFilter = useFilterStore((s) => s.activeMetaFilter);
  const activeTag = useFilterStore((s) => s.activeTag);
  const activeTab = useFilterStore((s) => s.activeTab);
  const category = useFilterStore((s) => s.category);
  const languages = useFilterStore((s) => s.languages);
  const starsRange = useFilterStore((s) => s.starsRange);
  const minMomentum = useFilterStore((s) => s.minMomentum);
  const onlyWatched = useFilterStore((s) => s.onlyWatched);
  const resetFilters = useFilterStore((s) => s.resetFilters);

  const hasActiveFilter =
    timeRange !== "7d" ||
    activeMetaFilter !== null ||
    activeTag !== null ||
    activeTab !== "trending" ||
    category !== null ||
    languages.length > 0 ||
    starsRange !== null ||
    minMomentum > 0 ||
    onlyWatched;

  useEffect(() => {
    if (cfg.showMetas) {
      fetch("/api/pipeline/meta-counts")
        .then((r) => r.ok ? r.json() : null)
        .then((data) => data?.counts && setCounts(data.counts))
        .catch((err) => console.error("[FilterBar] meta-counts failed", err));
    }
    if (cfg.showStats) {
      fetch("/api/pipeline/status")
        .then((r) => r.ok ? r.json() : null)
        .then((data) => data?.stats && setStats(data.stats))
        .catch((err) => console.error("[FilterBar] status failed", err));
    }
  }, [cfg.showMetas, cfg.showStats]);

  // MetasBar + TagsBar removed — the BubbleMap + left-sidebar category
  // pills cover the same navigation surface without the stacked filter
  // chrome. `cfg.showMetas` still gates the meta-counts fetch above in
  // case a future surface wants to reintroduce the pills.
  void counts;

  return (
    <div
      className="sticky top-14 z-30 backdrop-blur-md"
      style={{
        background: "color-mix(in srgb, var(--v2-bg-000) 90%, transparent)",
        borderBottom: "1px solid var(--v2-line-100)",
      }}
    >
      <div className="max-w-full mx-auto px-4 sm:px-6 py-3">
        <div className="flex items-center gap-3 flex-nowrap overflow-x-auto scrollbar-hide">
          {cfg.showStats && stats && <StatsBarClient stats={stats} />}

          <div className="ml-auto flex items-center gap-3 shrink-0">
            {hasActiveFilter && (
              <button
                type="button"
                onClick={() => resetFilters()}
                aria-label="Clear all filters"
                title="Clear all filters"
                className={cn(
                  "v2-mono inline-flex items-center gap-1.5 px-2.5 py-1",
                  "transition-colors duration-150 focus-visible:outline-none",
                )}
                style={{
                  fontSize: 10,
                  borderRadius: 2,
                  border: "1px solid var(--v2-acc)",
                  background: "var(--v2-acc-soft)",
                  color: "var(--v2-acc)",
                }}
              >
                <X size={11} aria-hidden="true" strokeWidth={2} />
                CLEAR
              </button>
            )}

            {cfg.showTabs && <TabBar />}

            {cfg.showTime && (
              <>
                <div
                  aria-hidden="true"
                  className="w-px h-5 hidden sm:block"
                  style={{ background: "var(--v2-line-200)" }}
                />
                <TimeRangePills />
              </>
            )}

            {cfg.showView && (
              <>
                <div
                  aria-hidden="true"
                  className="w-px h-5 hidden sm:block"
                  style={{ background: "var(--v2-line-200)" }}
                />
                <ViewControls />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
