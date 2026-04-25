"use client";

/**
 * SidebarContent — the shared sidebar layout rendered by both the desktop
 * <Sidebar> and the mobile <MobileDrawer>. The only variation between the
 * two mounts is the mobile-only header strip (logo + close button) which
 * appears when `onClose` is provided by the drawer.
 */
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Bot,
  Bookmark,
  GitCompareArrows,
  Layers,
  Package,
  Radar,
  Rocket,
  Sparkles,
  TrendingUp,
  Trophy,
  X,
  DollarSign,
  BadgeCheck,
} from "lucide-react";
import {
  RedditIcon,
  HackerNewsIcon,
  BlueskyIcon,
  XIcon,
  DevtoIcon,
  ProductHuntIcon,
  LobstersIcon,
} from "@/components/brand/BrandIcons";
import type { SidebarIconComponent } from "./SidebarNavItem";
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

// Monochrome wrappers — use the REAL brand glyph (Snoo / HN-Y / butterfly
// / PH-cat / dev.to) but force `monochrome` so the fill inherits the
// sidebar's grey text-tertiary (or active functional-green). Delivers
// instant source recognition without the logos screaming their canonical
// color through the chrome.
const RedditSidebarIcon: SidebarIconComponent = (p) => (
  <RedditIcon {...p} monochrome />
);
const HackerNewsSidebarIcon: SidebarIconComponent = (p) => (
  <HackerNewsIcon {...p} monochrome />
);
const BlueskySidebarIcon: SidebarIconComponent = (p) => (
  <BlueskyIcon {...p} monochrome />
);
const XSidebarIcon: SidebarIconComponent = (p) => <XIcon {...p} monochrome />;
const DevtoSidebarIcon: SidebarIconComponent = (p) => (
  <DevtoIcon {...p} monochrome />
);
const ProductHuntSidebarIcon: SidebarIconComponent = (p) => (
  <ProductHuntIcon {...p} monochrome />
);
const LobstersSidebarIcon: SidebarIconComponent = (p) => (
  <LobstersIcon {...p} monochrome />
);

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
  const [newsTab, setNewsTab] = useState<string | null>(null);
  const activeCategory = useFilterStore((s) => s.category);
  const activeMetaFilter = useFilterStore((s) => s.activeMetaFilter);
  const setCategory = useFilterStore((s) => s.setCategory);
  const setActiveMetaFilter = useFilterStore((s) => s.setActiveMetaFilter);
  const setActiveTag = useFilterStore((s) => s.setActiveTag);
  const setActiveTab = useFilterStore((s) => s.setActiveTab);
  const setSort = useFilterStore((s) => s.setSort);
  const setTimeRange = useFilterStore((s) => s.setTimeRange);

  const watchCount = useWatchlistStore((s) => s.repos.length);
  const compareCount = useCompareStore((s) => s.repos.length);

  const statsByCategory = byCategoryId(categoryStats);

  useEffect(() => {
    setNewsTab(new URLSearchParams(window.location.search).get("tab"));
  }, [pathname]);

  // Repos terminal: the homepage `/` with a meta-filter applied. Trending,
  // Breakouts, and New Repos all route back to `/`; Agent Repos is a
  // dedicated fixed-ranking page.
  function goToReposTerminal(filter: "breakouts" | "new" | null) {
    setCategory(null);
    setActiveTag(null);
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

  function goToAgentRepos() {
    setCategory(null);
    setActiveTag(null);
    setActiveMetaFilter(null);
    setActiveTab("trending");
    setTimeRange("7d");
    setSort("stars", "desc");
    if (pathname !== "/agent-repos") {
      router.push("/agent-repos");
    }
    onClose?.();
  }

  return (
    <div className="flex flex-col h-full">
      {/* Mobile-only header strip ---------------------------------------- */}
      {onClose && (
        <div className="md:hidden flex items-center justify-between p-3 border-b border-border-primary shrink-0">
          <span className="inline-flex items-center gap-2 font-display text-lg">
            {APP_NAME}
            <span className="rounded-sm border border-brand/45 bg-brand/10 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase leading-none text-brand">
              BETA
            </span>
          </span>
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
            active={pathname === "/" && activeMetaFilter === null}
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
            onClick={goToAgentRepos}
            icon={Bot}
            label="Agent Repos"
            active={pathname === "/agent-repos"}
          />
          <SidebarNavItem
            href="/search?sort=stars-total&limit=100"
            icon={Trophy}
            label="Top 100"
            active={pathname === "/search"}
          />
        </SidebarSection>

        {/* NEWS TERMINAL — dev media firehose ------------------------- */}
        <SidebarSection id="news-terminal" label="News Terminal">
          <SidebarNavItem
            href="/twitter"
            icon={XSidebarIcon}
            label="X / Twitter"
            active={pathname === "/twitter"}
          />
          <SidebarNavItem
            href="/reddit/trending"
            icon={RedditSidebarIcon}
            label="Reddit"
            active={
              pathname === "/reddit" ||
              pathname.startsWith("/reddit/")
            }
          />
          <SidebarNavItem
            href="/hackernews/trending"
            icon={HackerNewsSidebarIcon}
            label="HackerNews"
            active={
              pathname === "/hackernews" ||
              pathname.startsWith("/hackernews/") ||
              (pathname === "/news" && (!newsTab || newsTab === "hackernews"))
            }
          />
          <SidebarNavItem
            href="/bluesky/trending"
            icon={BlueskySidebarIcon}
            label="Bluesky"
            active={
              pathname === "/bluesky" ||
              pathname.startsWith("/bluesky/") ||
              (pathname === "/news" && newsTab === "bluesky")
            }
          />
          <SidebarNavItem
            href="/devto"
            icon={DevtoSidebarIcon}
            label="Dev.to"
            active={
              pathname === "/devto" ||
              pathname.startsWith("/devto/") ||
              (pathname === "/news" && newsTab === "devto")
            }
          />
          <SidebarNavItem
            href="/lobsters"
            icon={LobstersSidebarIcon}
            label="Lobsters"
            active={
              pathname === "/lobsters" ||
              pathname.startsWith("/lobsters/") ||
              (pathname === "/news" && newsTab === "lobsters")
            }
          />
        </SidebarSection>

        {/* LAUNCHES & FUNDING — launches, startup rounds & events ----- */}
        <SidebarSection id="funding-terminal" label="Launches & Funding">
          <SidebarNavItem
            href="/producthunt"
            icon={ProductHuntSidebarIcon}
            label="ProductHunt"
            active={
              pathname === "/producthunt" ||
              pathname.startsWith("/producthunt/") ||
              (pathname === "/news" && newsTab === "producthunt")
            }
          />
          <SidebarNavItem
            href="/funding"
            icon={DollarSign}
            label="Funding Radar"
            active={pathname === "/funding" || pathname.startsWith("/funding/")}
          />
          <SidebarNavItem
            href="/revenue"
            icon={BadgeCheck}
            label="Revenue"
            active={pathname === "/revenue" || pathname.startsWith("/revenue/")}
          />
          <SidebarNavItem
            icon={Trophy}
            label="Hackathons"
            badge="Soon"
            disabled
          />
        </SidebarSection>

        {/* NPM TERMINAL - package registry adoption telemetry ---------- */}
        <SidebarSection id="npm-terminal" label="NPM Terminal">
          <SidebarNavItem
            href="/npm"
            icon={Package}
            label="Packages"
            active={pathname === "/npm" || pathname.startsWith("/npm/")}
          />
        </SidebarSection>

        {/* LENSES - ways to view the corpus --------------------------- */}
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
