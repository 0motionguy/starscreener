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
import { type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useFreshCount } from "@/lib/use-fresh-count";
import {
  Activity,
  BadgeCheck,
  BarChart3,
  Bot,
  Bookmark,
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
    <section className="group">
      <div className="group-label">
        <span
          className="font-mono"
          style={{ color: "var(--ink-400)", fontSize: 9 }}
        >
          {`// ${label}`}
        </span>
        {rightSlot ? (
          <span className="flex items-center">{rightSlot}</span>
        ) : null}
      </div>
      <div
        className={cn(
          "px-0 py-0.5",
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

  const className = cn(
    "nav relative w-full",
    isActive && "active",
    disabled && "cursor-not-allowed opacity-60",
  );

  const style: React.CSSProperties = {
    color: disabled
      ? "var(--ink-500)"
      : isActive
        ? "var(--ink-000)"
        : "var(--ink-200)",
  };

  const content = (
    <>
      <span
        className="ic"
        style={{
          color: disabled
            ? "var(--ink-500)"
            : isActive
              ? "var(--acc)"
              : "var(--ink-300)",
        }}
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

/**
 * FreshCountNavRow — wraps V2NavRow with the `useFreshCount` hook so the
 * badge automatically swaps between cumulative total and fresh-since-
 * last-visit delta depending on whether the user has visited the route.
 * `routeKey` must match the key passed to <MarkVisited routeKey=... />
 * on the corresponding route page so the snapshot diff is computed
 * against the right localStorage entry.
 */
function FreshCountNavRow({
  routeKey,
  currentCount,
  ...rest
}: Omit<V2NavRowProps, "badge" | "badgeTone"> & {
  routeKey: string;
  currentCount: number;
}) {
  const fresh = useFreshCount(routeKey, currentCount);
  const badge = fresh.hasFresh
    ? `+${compactCount(fresh.delta)}`
    : fresh.total > 0
      ? compactCount(fresh.total)
      : undefined;
  const badgeTone: BadgeTone = fresh.hasFresh ? "delta" : "default";
  return <V2NavRow {...rest} badge={badge} badgeTone={badgeTone} />;
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
      ? { bg: "var(--acc-soft)", color: "var(--acc)" }
      : tone === "danger"
        ? { bg: "rgba(239, 68, 68, 0.14)", color: "#ef4444" }
        : tone === "delta"
          ? { bg: "var(--color-up-bg)", color: "var(--color-up)" }
          : { bg: "var(--v2-bg-200)", color: "var(--v2-ink-300)" };

  return (
    <span
      className="badge shrink-0 tabular-nums"
      style={{
        background: palette.bg,
        color: palette.color,
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
  const activeMetaFilter = useFilterStore((s) => s.activeMetaFilter);
  const setActiveMetaFilter = useFilterStore((s) => s.setActiveMetaFilter);
  const setActiveTag = useFilterStore((s) => s.setActiveTag);
  const setActiveTab = useFilterStore((s) => s.setActiveTab);
  const setSort = useFilterStore((s) => s.setSort);
  const setTimeRange = useFilterStore((s) => s.setTimeRange);

  const watchCount = useWatchlistStore((s) => s.repos.length);
  const compareCount = useCompareStore((s) => s.repos.length);

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
          style={{ borderColor: "var(--v4-line-100)" }}
        >
          <span
            className="inline-flex items-center gap-2 uppercase"
            style={{
              fontFamily: "var(--v4-mono)",
              letterSpacing: "var(--v4-track-18)",
              color: "var(--v4-ink-100)",
              fontSize: 12,
            }}
          >
            {APP_NAME}
            <span
              className="uppercase"
              style={{
                fontFamily: "var(--v4-mono)",
                letterSpacing: "var(--v4-track-18)",
                color: "var(--v4-acc)",
                border: "1px solid var(--v4-acc)",
                padding: "1px 4px",
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
            style={{ color: "var(--v4-ink-300)" }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <CursorRail className="flex-1 overflow-y-auto scrollbar-hide">
        {/* TREND TERMINAL */}
        <V2Section label="TREND TERMINAL">
          <FreshCountNavRow
            routeKey="trendingRepos"
            currentCount={trendingReposCount ?? 0}
            href="/"
            icon={TrendingUp}
            label="Trending Repos"
            active={pathname === "/"}
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
              pathname.startsWith("/hackernews/")
            }
          />
          <V2NavRow
            href="/lobsters"
            icon={LobstersSidebarIcon}
            label="Lobsters"
            badge={deltaChip(sourceCounts?.lobstersStories ?? 0) || undefined}
            badgeTone="delta"
            active={
              pathname === "/lobsters" || pathname.startsWith("/lobsters/")
            }
          />
          <V2NavRow
            href="/devto"
            icon={DevtoSidebarIcon}
            label="Dev.to"
            badge={deltaChip(sourceCounts?.devtoArticles ?? 0) || undefined}
            badgeTone="delta"
            active={
              pathname === "/devto" || pathname.startsWith("/devto/")
            }
          />
          <V2NavRow
            href="/bluesky/trending"
            icon={BlueskySidebarIcon}
            label="Bluesky"
            badge={deltaChip(sourceCounts?.blueskyPosts ?? 0) || undefined}
            badgeTone="delta"
            active={
              pathname === "/bluesky" || pathname.startsWith("/bluesky/")
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
          <FreshCountNavRow
            routeKey="twitter"
            currentCount={sourceCounts?.twitterRepos ?? 0}
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
              pathname.startsWith("/producthunt/")
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
          <FreshCountNavRow
            routeKey="hfDatasets"
            currentCount={sourceCounts?.hfDatasets ?? 0}
            href="/huggingface/datasets"
            icon={FileText}
            label="HF Datasets"
            active={pathname === "/huggingface/datasets"}
          />
          <FreshCountNavRow
            routeKey="hfSpaces"
            currentCount={sourceCounts?.hfSpaces ?? 0}
            href="/huggingface/spaces"
            icon={Rocket}
            label="HF Spaces"
            active={pathname === "/huggingface/spaces"}
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
            href="/agent-commerce"
            icon={Network}
            label="Agent Commerce"
            active={
              pathname === "/agent-commerce" ||
              pathname.startsWith("/agent-commerce/")
            }
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
          {/* "Drop Revenue" sidebar entry hidden 2026-05-03 — page kept on
              disk so direct links still work, but the audit flagged it as
              having no shared data source and no production traffic. Re-enable
              once the submission pipeline is wired into the data-store. */}
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
