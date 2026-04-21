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
  FileText,
  Flame,
  GitCompareArrows,
  Layers,
  MessageSquare,
  Newspaper,
  Radar,
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
  onClose,
}: SidebarContentProps) {
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const activeCategory = useFilterStore((s) => s.category);
  const activeMetaFilter = useFilterStore((s) => s.activeMetaFilter);
  const activeTab = useFilterStore((s) => s.activeTab);
  const timeRange = useFilterStore((s) => s.timeRange);
  const setActiveMetaFilter = useFilterStore((s) => s.setActiveMetaFilter);
  const setActiveTab = useFilterStore((s) => s.setActiveTab);
  const setTimeRange = useFilterStore((s) => s.setTimeRange);

  const watchCount = useWatchlistStore((s) => s.repos.length);
  const compareCount = useCompareStore((s) => s.repos.length);

  const statsByCategory = byCategoryId(categoryStats);

  // Repos terminal: the homepage `/` with a meta-filter applied. The four
  // entries (Trending / Breakouts / New Repos / Hot This Week) all route
  // to `/` and twist the filter store; only the active highlight differs.
  function goToReposTerminal(
    filter: "breakouts" | "new" | "hot" | null,
  ) {
    if (filter === "hot") {
      // "Hot This Week" — `hot` movementStatus count is empty during
      // delta warm-up; route to top 7-day gainers tab instead. Same user
      // intent ("what's actually trending this week") with real data.
      setActiveMetaFilter(null);
      setActiveTab("gainers");
      setTimeRange("7d");
    } else if (filter) {
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

  const hotThisWeekActive =
    pathname === "/" &&
    activeMetaFilter === null &&
    activeTab === "gainers" &&
    timeRange === "7d";

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
            className="w-10 h-10 flex items-center justify-center rounded-button hover:bg-bg-card-hover text-text-secondary hover:text-text-primary"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Scrollable body ------------------------------------------------- */}
      <div className="flex-1 overflow-y-auto scrollbar-hide">
        {/* REPOS TERMINAL — GitHub trending, the anchor product -------- */}
        <SidebarSection id="repos-terminal" label="Repos Terminal">
          <SidebarNavItem
            onClick={() => goToReposTerminal(null)}
            icon={TrendingUp}
            label="Trending"
            active={
              pathname === "/" &&
              activeMetaFilter === null &&
              !hotThisWeekActive
            }
          />
          <SidebarNavItem
            onClick={() => goToReposTerminal("breakouts")}
            icon={Rocket}
            label="Breakouts"
            badge={metaCounts.breakouts}
            active={pathname === "/" && activeMetaFilter === "breakouts"}
          />
          <SidebarNavItem
            onClick={() => goToReposTerminal("new")}
            icon={Sparkles}
            label="New Repos"
            badge={metaCounts.new}
            active={pathname === "/" && activeMetaFilter === "new"}
          />
          <SidebarNavItem
            onClick={() => goToReposTerminal("hot")}
            icon={Flame}
            label="Hot This Week"
            badge={metaCounts.hot}
            active={hotThisWeekActive}
          />
          <SidebarNavItem
            href="/search?sort=stars-total&limit=100"
            icon={Trophy}
            label="Top 100"
            active={pathname === "/search"}
          />
        </SidebarSection>

        {/* REDDIT TERMINAL — community discussion + cross-signal ------- */}
        <SidebarSection id="reddit-terminal" label="Reddit Terminal">
          <SidebarNavItem
            href="/reddit"
            icon={MessageSquare}
            label="Repo Signal"
            active={pathname === "/reddit"}
          />
          <SidebarNavItem
            href="/reddit/trending"
            icon={TrendingUp}
            label="All Trending"
            active={pathname === "/reddit/trending"}
          />
        </SidebarSection>

        {/* NEWS TERMINAL — dev media firehose ------------------------- */}
        <SidebarSection id="news-terminal" label="News Terminal">
          <SidebarNavItem
            href="/hackernews/trending"
            icon={Newspaper}
            label="HackerNews"
            active={
              pathname === "/hackernews" ||
              pathname.startsWith("/hackernews/") ||
              (pathname === "/news" /* default tab */)
            }
          />
          <SidebarNavItem
            href="/producthunt"
            icon={Rocket}
            label="ProductHunt"
            active={
              pathname === "/producthunt" ||
              pathname.startsWith("/producthunt/")
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
            href="/devto"
            icon={FileText}
            label="Dev.to"
            active={
              pathname === "/devto" ||
              pathname.startsWith("/devto/")
            }
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
