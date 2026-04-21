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
  Cloud,
  GitCompareArrows,
  Layers,
  LineChart,
  MessageSquare,
  Microscope,
  Newspaper,
  Radar,
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
  availableLanguages,
  watchlistPreview,
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

  // Navigate to the homepage Repos terminal, clearing any meta-filter that
  // an earlier session left set in the filter store. Used by the "Repos"
  // entry in the new TERMINALS section.
  function goToReposTerminal() {
    setActiveMetaFilter(null);
    setActiveTab("trending");
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
        {/* TERMINALS — per-source feeds ------------------------------- */}
        <SidebarSection id="terminals" label="Terminals">
          <SidebarNavItem
            onClick={goToReposTerminal}
            icon={LineChart}
            label="Repos"
            active={pathname === "/" && activeMetaFilter === null}
          />
          <SidebarNavItem
            href="/reddit/trending"
            icon={MessageSquare}
            label="Reddit"
            active={
              pathname === "/reddit" ||
              pathname.startsWith("/reddit/")
            }
          />
          <SidebarNavItem
            href="/hackernews/trending"
            icon={Newspaper}
            label="HackerNews"
            active={
              pathname === "/hackernews" ||
              pathname.startsWith("/hackernews/")
            }
          />
          <SidebarNavItem
            href="/bluesky/trending"
            icon={Cloud}
            label="Bluesky"
            active={
              pathname === "/bluesky" ||
              pathname.startsWith("/bluesky/")
            }
          />
          <SidebarNavItem
            href="/research"
            icon={Microscope}
            label="Research"
            badge="soon"
            active={pathname === "/research"}
          />
        </SidebarSection>

        {/* LENSES — ways to view the corpus --------------------------- */}
        <SidebarSection id="lenses" label="Lenses">
          <SidebarNavItem
            href="/breakouts"
            icon={Radar}
            label="Cross-Signal Breakouts"
            active={pathname === "/breakouts"}
          />
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

        {/* CURATED — pre-grouped views -------------------------------- */}
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
