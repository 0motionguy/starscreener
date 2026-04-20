"use client";

/**
 * SidebarContent — the shared sidebar layout rendered by both the desktop
 * <Sidebar> and the mobile <MobileDrawer>. The only variation between the
 * two mounts is the mobile-only header strip (logo + close button) which
 * appears when `onClose` is provided by the drawer.
 */
import { usePathname, useRouter } from "next/navigation";
import {
  Bookmark,
  Flame,
  GitCompareArrows,
  Layers,
  Rocket,
  Sparkles,
  TrendingUp,
  Trophy,
  X,
} from "lucide-react";
import type { CategoryStats } from "@/lib/pipeline/queries/aggregate";
import type { MetaCounts } from "@/lib/types";
import { CATEGORIES } from "@/lib/constants";
import { APP_NAME } from "@/lib/app-meta";
import { useFilterStore, useWatchlistStore, useCompareStore } from "@/lib/store";
import { SidebarSection } from "./SidebarSection";
import { SidebarNavItem } from "./SidebarNavItem";
import { SidebarCategoryItem } from "./SidebarCategoryItem";
import { SidebarFilters, SidebarFiltersHeader } from "./SidebarFilters";
import {
  SidebarWatchlistPreview,
  type SidebarWatchlistPreviewRepo,
} from "./SidebarWatchlistPreview";
import { SidebarFooter } from "./SidebarFooter";

export interface SidebarContentProps {
  categoryStats: CategoryStats[];
  metaCounts: MetaCounts;
  availableLanguages: string[];
  watchlistPreview: SidebarWatchlistPreviewRepo[];
  unreadAlerts?: number;
  onClose?: () => void;
}

function byCategoryId(stats: CategoryStats[]): Map<string, CategoryStats> {
  const m = new Map<string, CategoryStats>();
  for (const s of stats) m.set(s.categoryId, s);
  return m;
}

export function SidebarContent({
  categoryStats,
  metaCounts,
  availableLanguages,
  watchlistPreview,
  unreadAlerts = 0,
  onClose,
}: SidebarContentProps) {
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const activeCategory = useFilterStore((s) => s.category);
  const activeMetaFilter = useFilterStore((s) => s.activeMetaFilter);
  const setActiveMetaFilter = useFilterStore((s) => s.setActiveMetaFilter);
  const setActiveTab = useFilterStore((s) => s.setActiveTab);

  const watchCount = useWatchlistStore((s) => s.repos.length);
  const compareCount = useCompareStore((s) => s.repos.length);

  const statsByCategory = byCategoryId(categoryStats);

  function goToTerminal(filter: "breakouts" | "new" | "quiet-killers" | "hot" | null) {
    if (filter) {
      setActiveMetaFilter(filter);
    } else {
      setActiveMetaFilter(null);
      setActiveTab("trending");
    }
    if (pathname !== "/") {
      router.push("/");
    }
    onClose?.();
  }

  return (
    <div className="flex flex-col h-full">
      {/* Mobile-only header strip ---------------------------------------- */}
      {onClose && (
        <div className="md:hidden flex items-center justify-between p-3 border-b border-border-primary shrink-0">
          <span className="font-display text-lg">{APP_NAME}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="w-8 h-8 flex items-center justify-center rounded-button hover:bg-bg-card-hover text-text-secondary hover:text-text-primary"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Scrollable body ------------------------------------------------- */}
      <div className="flex-1 overflow-y-auto scrollbar-hide">
        {/* TERMINAL ---------------------------------------------------- */}
        <SidebarSection id="terminal" label="Terminal">
          <SidebarNavItem
            onClick={() => goToTerminal(null)}
            icon={TrendingUp}
            label="Trending"
            active={pathname === "/" && activeMetaFilter === null}
          />
          <SidebarNavItem
            onClick={() => goToTerminal("breakouts")}
            icon={Rocket}
            label="Breakouts"
            badge={metaCounts.breakouts}
            active={pathname === "/" && activeMetaFilter === "breakouts"}
          />
          <SidebarNavItem
            onClick={() => goToTerminal("new")}
            icon={Sparkles}
            label="New Repos"
            badge={metaCounts.new}
            active={pathname === "/" && activeMetaFilter === "new"}
          />
          <SidebarNavItem
            onClick={() => goToTerminal("hot")}
            icon={Flame}
            label="Hot This Week"
            badge={metaCounts.hot}
            active={pathname === "/" && activeMetaFilter === "hot"}
          />
          <SidebarNavItem
            href="/search?sort=stars-total&limit=100"
            icon={Trophy}
            label="Top 100"
            active={pathname === "/search"}
          />
        </SidebarSection>

        {/* MY LIST ----------------------------------------------------- */}
        <SidebarSection id="mylist" label="My List">
          <SidebarNavItem
            href="/watchlist"
            icon={Bookmark}
            label="Watchlist"
            badge={watchCount > 0 ? watchCount : undefined}
            active={pathname === "/watchlist"}
          />
          <SidebarNavItem
            href="/compare"
            icon={GitCompareArrows}
            label="Compare"
            badge={compareCount > 0 ? compareCount : undefined}
            active={pathname === "/compare"}
          />
        </SidebarSection>

        {/* CURATED ----------------------------------------------------- */}
        <SidebarSection id="curated" label="Curated">
          <SidebarNavItem
            href="/collections"
            icon={Layers}
            label="Collections"
            active={pathname === "/collections" || pathname.startsWith("/collections/")}
          />
        </SidebarSection>

        {/* CATEGORIES -------------------------------------------------- */}
        <SidebarSection id="categories" label="Categories" maxHeightPx={400}>
          {CATEGORIES.map((c) => {
            const stats = statsByCategory.get(c.id);
            return (
              <SidebarCategoryItem
                key={c.id}
                category={c}
                repoCount={stats?.repoCount ?? 0}
                avgMomentum={stats?.avgMomentum ?? 0}
                active={activeCategory === c.id}
              />
            );
          })}
        </SidebarSection>

        {/* FILTERS ----------------------------------------------------- */}
        <SidebarSection
          id="filters"
          label="Filters"
          rightSlot={<SidebarFiltersHeader />}
        >
          <SidebarFilters languages={availableLanguages} />
        </SidebarSection>

        {/* WATCHING ---------------------------------------------------- */}
        <SidebarSection id="watching" label="Watching">
          <SidebarWatchlistPreview repos={watchlistPreview} />
        </SidebarSection>
      </div>

      {/* Footer ---------------------------------------------------------- */}
      <SidebarFooter />
    </div>
  );
}
