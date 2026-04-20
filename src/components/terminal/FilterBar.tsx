"use client";

// StarScreener — FilterBar (client-side so it composes cleanly with
// client pages like /watchlist that import TerminalLayout).
//
// Fetches meta counts + global stats via the existing API routes
// (/api/pipeline/meta-counts, /api/pipeline/status) at mount, then
// re-renders the interactive sub-bars.

import { useEffect, useState } from "react";
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
    <div className="sticky top-14 z-30 bg-bg-primary/90 backdrop-blur-md border-b border-border-primary">
      <div className="max-w-full mx-auto px-4 sm:px-6 py-3">
        <div className="flex items-center gap-3 flex-nowrap overflow-x-auto scrollbar-hide">
          {cfg.showStats && stats && <StatsBarClient stats={stats} />}

          <div className="ml-auto flex items-center gap-3 shrink-0">
            {cfg.showTabs && <TabBar />}

            {cfg.showTime && (
              <>
                <div aria-hidden="true" className="w-px h-5 bg-border-primary hidden sm:block" />
                <TimeRangePills />
              </>
            )}

            {cfg.showView && (
              <>
                <div aria-hidden="true" className="w-px h-5 bg-border-primary hidden sm:block" />
                <ViewControls />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
