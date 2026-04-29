"use client";

/**
 * SidebarContent — the shared sidebar layout rendered by both the desktop
 * <Sidebar> and the mobile <MobileDrawer>. The only variation between the
 * two mounts is the mobile-only header strip (logo + close button) which
 * appears when `onClose` is provided by the drawer.
 *
 * V2 visual treatment: terminal-bar mono section headers (`// LABEL`),
 * mono uppercase 11px nav rows, accent bracket markers on active rows,
 * accent-soft pill chips for live counts.
 *
 * Sections:
 *   1. TREND TERMINAL    — Repos, Skills, MCP, AGNT, Breakouts, Top 100
 *   2. SIGNAL TERMINAL   — HN / Lobsters / Dev.to / Bluesky / Reddit / X / PH
 *   3. LLM / PACK TERMINAL — NPM / Hugging Face / Datasets / Spaces
 *   4. LAUNCH TERMINAL   — Funding / Revenue / Hackathons / Launch
 *   5. RESEARCH TERMINAL — arXiv Papers / Cited Repos
 *   6. TOOLS             — Watchlist / Compare / Tier List / Signal Radar
 *   7. WATCHING          — top 5 watchlist preview cards
 *
 * Three badge tones:
 *   - `delta`   — green `+N` pill for rolling-window feeds.
 *   - `default` — neutral total for cumulative inventories.
 *   - `accent`  — purple pill for the user's own counts.
 */
import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  BadgeCheck,
  BarChart3,
  Bot,
  Brain,
  Calculator,
  CalendarDays,
  Cpu,
  DollarSign,
  Eye,
  FileText,
  GitCompareArrows,
  GraduationCap,
  Layers,
  Library,
  Lightbulb,
  LineChart,
  Newspaper,
  Network,
  Package,
  Plug,
  Radar,
  Rocket,
  Tags,
  TrendingUp,
  Trophy,
  X,
  Zap,
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
import type { SidebarSourceCounts } from "@/lib/sidebar-source-counts";
import { APP_NAME } from "@/lib/app-meta";
import { useFilterStore, useWatchlistStore, useCompareStore } from "@/lib/store";
import {
  SidebarWatchlistPreview,
  type SidebarWatchlistPreviewRepo,
} from "./SidebarWatchlistPreview";
import { SidebarFooter } from "./SidebarFooter";
import { cn } from "@/lib/utils";
import { CursorRail } from "@/components/v3";

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
  /** Per-source counts for badge chips. */
  sourceCounts?: SidebarSourceCounts;
  /** Total trending repos count (the big "Trending Repos" badge). */
  trendingReposCount?: number;
  onClose?: () => void;
}

function compactCount(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "";
  if (n < 1000) return String(n);
  if (n < 10_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  return `${Math.round(n / 1000)}K`;
}

function deltaChip(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "";
  return `+${compactCount(n)}`;
}

interface V2SectionProps {
  label: string;
  children: ReactNode;
  rightSlot?: ReactNode;
  maxHeightPx?: number;
}

function V2Section({ label, children, rightSlot, maxHeightPx }: V2SectionProps) {
  return (
    <section
      className="border-t"
      style={{ borderColor: "var(--v2-line-std)" }}
    >
      <div
        className="flex items-center justify-between px-3 pt-3 pb-2"
        style={{ borderBottom: "1px dashed var(--v2-line-200)" }}
      >
        <span
          className="v2-mono"
          style={{ color: "var(--v2-ink-400)", fontSize: 9 }}
        >
          {`// ${label}`}
        </span>
        {rightSlot ? (
          <span className="flex items-center">{rightSlot}</span>
        ) : null}
      </div>
      <div
        className={cn(
          "px-1.5 py-1.5",
          maxHeightPx ? "overflow-y-auto scrollbar-hide" : undefined,
        )}
        style={maxHeightPx ? { maxHeight: `${maxHeightPx}px` } : undefined}
      >
        {children}
      </div>
    </section>
  );
}

type BadgeTone = "default" | "accent" | "danger" | "delta";

interface V2NavRowProps {
  href?: string;
  onClick?: () => void;
  icon: SidebarIconComponent;
  label: string;
  badge?: string | number;
  badgeTone?: BadgeTone;
  active?: boolean;
  disabled?: boolean;
}

function V2NavRow({
  href,
  onClick,
  icon: Icon,
  label,
  badge,
  badgeTone = "default",
  active = false,
  disabled = false,
}: V2NavRowProps) {
  const isActive = active && !disabled;

  const labelColor = disabled
    ? "var(--v2-ink-500)"
    : isActive
      ? "var(--v2-ink-100)"
      : "var(--v2-ink-300)";
  const iconColor = disabled
    ? "var(--v2-ink-500)"
    : isActive
      ? "var(--v2-acc)"
      : "var(--v2-ink-400)";

  const className = cn(
    "v2-mono relative w-full h-8 flex items-center gap-2 pl-3 pr-2",
    "text-[11px] transition-colors duration-150",
    isActive && "v2-bracket",
    disabled
      ? "cursor-not-allowed opacity-60"
      : !isActive && "hover:bg-[var(--v2-bg-100)]",
  );

  const style: React.CSSProperties = {
    color: labelColor,
    background: isActive ? "var(--v2-bg-100)" : "transparent",
    border: isActive
      ? "1px solid var(--v2-line-200)"
      : "1px solid transparent",
    borderRadius: 1,
    boxShadow: isActive ? "inset 3px 0 0 var(--v2-acc)" : undefined,
  };

  const content = (
    <>
      <span
        className="inline-flex shrink-0"
        style={{ color: iconColor, width: 14, height: 14 }}
      >
        <Icon size={14} />
      </span>
      <span className="flex-1 truncate text-left tracking-[0.16em]">
        {label}
      </span>
      {badge !== undefined && badge !== null && badge !== "" && (
        <V2Chip value={badge} tone={badgeTone} />
      )}
    </>
  );

  if (disabled) {
    return (
      <div aria-disabled="true" className={className} style={style}>
        {content}
      </div>
    );
  }

  if (href) {
    return (
      <Link href={href} className={className} style={style}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={className} style={style}>
      {content}
    </button>
  );
}

function V2Chip({
  value,
  tone = "default",
}: {
  value: string | number;
  tone?: BadgeTone;
}) {
  const palette =
    tone === "accent"
      ? { bg: "var(--v2-acc-soft)", color: "var(--v2-acc)" }
      : tone === "danger"
        ? { bg: "var(--v2-sig-red-glow)", color: "var(--v2-sig-red)" }
        : tone === "delta"
          ? { bg: "var(--color-up-bg)", color: "var(--color-up)" }
          : { bg: "var(--v2-bg-200)", color: "var(--v2-ink-300)" };

  return (
    <span
      className="v2-mono tabular-nums shrink-0 inline-flex items-center justify-center"
      style={{
        background: palette.bg,
        color: palette.color,
        height: 16,
        minWidth: 20,
        padding: "0 5px",
        fontSize: 9,
        borderRadius: 1,
      }}
    >
      {value}
    </span>
  );
}

export function SidebarContent({
  metaCounts,
  watchlistPreview,
  sourceCounts,
  trendingReposCount,
  onClose,
}: SidebarContentProps) {
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const [newsTab, setNewsTab] = useState<string | null>(null);
  const activeMetaFilter = useFilterStore((s) => s.activeMetaFilter);
  const setActiveMetaFilter = useFilterStore((s) => s.setActiveMetaFilter);
  const setActiveTag = useFilterStore((s) => s.setActiveTag);
  const setActiveTab = useFilterStore((s) => s.setActiveTab);
  const setSort = useFilterStore((s) => s.setSort);
  const setTimeRange = useFilterStore((s) => s.setTimeRange);

  const watchCount = useWatchlistStore((s) => s.repos.length);
  const compareCount = useCompareStore((s) => s.repos.length);

  useEffect(() => {
    setNewsTab(new URLSearchParams(window.location.search).get("tab"));
  }, [pathname]);

  function goToReposTerminal(filter: "breakouts" | "new" | null) {
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
      {onClose && (
        <div
          className="md:hidden flex items-center justify-between p-3 border-b shrink-0"
          style={{ borderColor: "var(--v2-line-100)" }}
        >
          <span
            className="inline-flex items-center gap-2 v2-mono"
            style={{ color: "var(--v2-ink-100)", fontSize: 12 }}
          >
            {APP_NAME}
            <span
              className="v2-tag"
              style={{
                color: "var(--v2-acc)",
                borderColor: "var(--v2-acc)",
                fontSize: 9,
              }}
            >
              BETA
            </span>
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="w-9 h-9 flex items-center justify-center"
            style={{ color: "var(--v2-ink-300)" }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <CursorRail className="flex-1 overflow-y-auto scrollbar-hide">
        {/* TREND TERMINAL */}
        <V2Section label="TREND TERMINAL">
          <V2NavRow
            onClick={() => goToReposTerminal(null)}
            icon={TrendingUp}
            label="Trending Repos"
            badge={
              trendingReposCount && trendingReposCount > 0
                ? compactCount(trendingReposCount)
                : undefined
            }
            badgeTone="default"
            active={pathname === "/" && activeMetaFilter === null}
          />
          <V2NavRow
            href="/consensus"
            icon={Radar}
            label="Consensus"
            badge="3X"
            badgeTone="accent"
            active={pathname === "/consensus"}
          />
          <V2NavRow
            href="/skills"
            icon={GraduationCap}
            label="Trending Skills"
            active={pathname === "/skills" || pathname.startsWith("/skills/")}
          />
          <V2NavRow
            href="/mcp"
            icon={Plug}
            label="Trending MCP"
            active={pathname === "/mcp" || pathname.startsWith("/mcp/")}
          />
          <V2NavRow
            onClick={goToAgentRepos}
            icon={Cpu}
            label="Trending AGNT"
            active={pathname === "/agent-repos"}
          />
          <V2NavRow
            href="/breakouts"
            icon={Rocket}
            label="Breakouts"
            badge={metaCounts.breakouts > 0 ? metaCounts.breakouts : undefined}
            badgeTone="accent"
            active={pathname === "/breakouts"}
          />
          <V2NavRow
            href="/top"
            icon={Trophy}
            label="Top 100"
            badge="100"
            badgeTone="default"
            active={pathname === "/top"}
          />
        </V2Section>

        {/* SIGNAL TERMINAL */}
        <V2Section label="SIGNAL TERMINAL">
          <V2NavRow
            href="/signals"
            icon={Activity}
            label="Market Signals"
            badge="ALL"
            badgeTone="accent"
            active={pathname === "/signals" || pathname.startsWith("/signals/")}
          />
          <V2NavRow
            href="/hackernews/trending"
            icon={HackerNewsSidebarIcon}
            label="Hacker News"
            badge={deltaChip(sourceCounts?.hackernewsStories ?? 0) || undefined}
            badgeTone="delta"
            active={
              pathname === "/hackernews" ||
              pathname.startsWith("/hackernews/") ||
              (pathname === "/news" && (!newsTab || newsTab === "hackernews"))
            }
          />
          <V2NavRow
            href="/lobsters"
            icon={LobstersSidebarIcon}
            label="Lobsters"
            badge={deltaChip(sourceCounts?.lobstersStories ?? 0) || undefined}
            badgeTone="delta"
            active={
              pathname === "/lobsters" ||
              pathname.startsWith("/lobsters/") ||
              (pathname === "/news" && newsTab === "lobsters")
            }
          />
          <V2NavRow
            href="/devto"
            icon={DevtoSidebarIcon}
            label="Dev.to"
            badge={deltaChip(sourceCounts?.devtoArticles ?? 0) || undefined}
            badgeTone="delta"
            active={
              pathname === "/devto" ||
              pathname.startsWith("/devto/") ||
              (pathname === "/news" && newsTab === "devto")
            }
          />
          <V2NavRow
            href="/bluesky/trending"
            icon={BlueskySidebarIcon}
            label="Bluesky"
            badge={deltaChip(sourceCounts?.blueskyPosts ?? 0) || undefined}
            badgeTone="delta"
            active={
              pathname === "/bluesky" ||
              pathname.startsWith("/bluesky/") ||
              (pathname === "/news" && newsTab === "bluesky")
            }
          />
          <V2NavRow
            href="/reddit/trending"
            icon={RedditSidebarIcon}
            label="Reddit"
            badge={deltaChip(sourceCounts?.redditPosts ?? 0) || undefined}
            badgeTone="delta"
            active={pathname === "/reddit" || pathname.startsWith("/reddit/")}
          />
          <V2NavRow
            href="/twitter"
            icon={XSidebarIcon}
            label="X / Twitter"
            active={pathname === "/twitter"}
          />
          <V2NavRow
            href="/producthunt"
            icon={ProductHuntSidebarIcon}
            label="Product Hunt"
            badge={
              deltaChip(sourceCounts?.producthuntLaunches ?? 0) || undefined
            }
            badgeTone="delta"
            active={
              pathname === "/producthunt" ||
              pathname.startsWith("/producthunt/") ||
              (pathname === "/news" && newsTab === "producthunt")
            }
          />
        </V2Section>

        {/* LLM / PACK TERMINAL */}
        <V2Section label="LLM / PACK TERMINAL">
          <V2NavRow
            href="/npm"
            icon={Package}
            label="NPM Packages"
            badge={
              sourceCounts && sourceCounts.npmPackages > 0
                ? compactCount(sourceCounts.npmPackages)
                : undefined
            }
            badgeTone="default"
            active={pathname === "/npm" || pathname.startsWith("/npm/")}
          />
          <V2NavRow
            href="/huggingface/trending"
            icon={Brain}
            label="HF Models"
            badge="Live"
            badgeTone="delta"
            active={
              pathname === "/huggingface" ||
              pathname === "/huggingface/trending"
            }
          />
          <V2NavRow
            href="/huggingface/datasets"
            icon={FileText}
            label="HF Datasets"
            active={pathname === "/huggingface/datasets"}
          />
          <V2NavRow
            href="/huggingface/spaces"
            icon={Rocket}
            label="HF Spaces"
            active={pathname === "/huggingface/spaces"}
          />
          <V2NavRow
            icon={BarChart3}
            label="LLM Charts"
            badge="Soon"
            disabled
          />
        </V2Section>

        {/* LAUNCH TERMINAL */}
        <V2Section label="LAUNCH TERMINAL">
          <V2NavRow
            href="/funding"
            icon={DollarSign}
            label="Funding Radar"
            badge={
              sourceCounts && sourceCounts.fundingSignals > 0
                ? compactCount(sourceCounts.fundingSignals)
                : undefined
            }
            badgeTone="default"
            active={pathname === "/funding" || pathname.startsWith("/funding/")}
          />
          <V2NavRow
            href="/revenue"
            icon={BadgeCheck}
            label="Revenue"
            badge={
              sourceCounts && sourceCounts.revenueOverlays > 0
                ? compactCount(sourceCounts.revenueOverlays)
                : undefined
            }
            badgeTone="default"
            active={pathname === "/revenue" || pathname.startsWith("/revenue/")}
          />
          <V2NavRow
            href="/submit/revenue"
            icon={Zap}
            label="Drop Revenue"
            active={pathname === "/submit/revenue"}
          />
          <V2NavRow
            icon={Trophy}
            label="Hackathons"
            badge="Soon"
            disabled
          />
          <V2NavRow
            icon={Zap}
            label="Launch"
            badge="Soon"
            disabled
          />
        </V2Section>

        {/* RESEARCH TERMINAL */}
        <V2Section label="RESEARCH TERMINAL">
          <V2NavRow
            href="/arxiv/trending"
            icon={FileText}
            label="arXiv Papers"
            active={
              pathname === "/papers" ||
              pathname === "/arxiv" ||
              pathname === "/arxiv/trending" ||
              pathname.startsWith("/papers/") ||
              pathname.startsWith("/arxiv/")
            }
          />
          <V2NavRow
            href="/research"
            icon={Bot}
            label="Cited Repos"
            active={pathname === "/research" || pathname.startsWith("/research/")}
          />
        </V2Section>

        {/* EXPLORE */}
        <V2Section label="EXPLORE">
          <V2NavRow
            href="/news"
            icon={Newspaper}
            label="News Desk"
            active={pathname === "/news"}
          />
          <V2NavRow
            href="/digest"
            icon={CalendarDays}
            label="Digest"
            active={pathname === "/digest" || pathname.startsWith("/digest/")}
          />
          <V2NavRow
            href="/ideas"
            icon={Lightbulb}
            label="Ideas"
            active={pathname === "/ideas" || pathname.startsWith("/ideas/")}
          />
          <V2NavRow
            href="/predict"
            icon={LineChart}
            label="Predict"
            badge="V1"
            badgeTone="default"
            active={pathname === "/predict"}
          />
          <V2NavRow
            href="/categories"
            icon={Tags}
            label="Categories"
            active={
              pathname === "/categories" ||
              pathname.startsWith("/categories/")
            }
          />
          <V2NavRow
            href="/collections"
            icon={Library}
            label="Collections"
            active={
              pathname === "/collections" ||
              pathname.startsWith("/collections/")
            }
          />
          <V2NavRow
            href="/pricing"
            icon={Layers}
            label="Plans"
            active={pathname === "/pricing"}
          />
          <V2NavRow
            href="/tools/revenue-estimate"
            icon={Calculator}
            label="Revenue Tool"
            active={pathname === "/tools/revenue-estimate"}
          />
        </V2Section>

        {/* TOOLS */}
        <V2Section label="TOOLS">
          <V2NavRow
            href="/watchlist"
            icon={Eye}
            label="Watchlist"
            badge={watchCount > 0 ? watchCount : undefined}
            badgeTone="accent"
            active={pathname === "/watchlist"}
          />
          <V2NavRow
            href="/compare"
            icon={GitCompareArrows}
            label="Compare"
            badge={compareCount > 0 ? compareCount : undefined}
            badgeTone="accent"
            active={pathname === "/compare"}
          />
          <V2NavRow
            href="/tierlist"
            icon={Trophy}
            label="Tier List"
            active={
              pathname === "/tierlist" || pathname.startsWith("/tierlist/")
            }
          />
          <V2NavRow
            href="/mindshare"
            icon={Network}
            label="MindShare"
            badge="New"
            badgeTone="accent"
            active={pathname === "/mindshare"}
          />
          <V2NavRow
            href="/top10"
            icon={BarChart3}
            label="Top 10"
            badge="New"
            badgeTone="accent"
            active={pathname === "/top10" || pathname.startsWith("/top10/")}
          />
          <V2NavRow
            href="/signals"
            icon={Radar}
            label="Signal Radar"
            active={
              pathname === "/signals" || pathname.startsWith("/signals/")
            }
          />
        </V2Section>

        {/* WATCHING */}
        <V2Section label="WATCHING">
          <SidebarWatchlistPreview repos={watchlistPreview} />
        </V2Section>
      </CursorRail>

      <SidebarFooter />
    </div>
  );
}
