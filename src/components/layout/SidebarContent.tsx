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
 *   1. TREND TERMINAL    — Repos, Skills, MCP, AGNT, Breakouts, Consensus
 *   2. SIGNAL TERMINAL   — HN / Lobsters / Dev.to / Bluesky / Reddit / X / PH
 *   3. LLM / PACK TERMINAL — NPM / Huggingface
 *   4. LAUNCH TERMINAL   — Funding / Revenue / Hackathons / Launch
 *   5. RESEARCH TERMINAL — arXiv Papers / Cited Repos
 *   6. TOOLS             — Watchlist / Compare / Tier List / MindShare / Top 10
 *   7. WATCHING          — top 5 watchlist preview cards
 *
 * Three badge tones:
 *   - `delta`   — green `+N` pill for rolling-window feeds.
 *   - `default` — neutral total for cumulative inventories.
 *   - `accent`  — purple pill for the user's own counts.
 */
import { startTransition, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useFreshCount } from "@/lib/use-fresh-count";
import {
  Activity,
  BadgeCheck,
  BarChart3,
  Bot,
  Brain,
  CalendarDays,
  Coins,
  Cpu,
  DollarSign,
  Eye,
  FileText,
  GitCompareArrows,
  GraduationCap,
  Library,
  Lightbulb,
  Package,
  Plug,
  Radar,
  Rocket,
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
import { SidebarRecentViewedRepos } from "./SidebarRecentViewedRepos";
import { SidebarFooter } from "./SidebarFooter";
import { cn } from "@/lib/utils";
import { CursorRail } from "@/components/v3";
import "./sidebar-nav.css";

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

type PipState = "live" | "stale" | undefined;

interface V2SectionProps {
  label: string;
  children: ReactNode;
  rightSlot?: ReactNode;
  maxHeightPx?: number;
  /**
   * Group activity pip state.
   *   undefined → orange "waiting" pip (default)
   *   'live'    → animated green pip (group is fresh / actively updating)
   *   'stale'   → flat gray pip (no recent activity)
   *
   * Drag handle + chevron are visual-only for now (TODO: wire reorder/collapse).
   */
  pipState?: PipState;
}

function V2Section({
  label,
  children,
  rightSlot,
  maxHeightPx,
  pipState,
}: V2SectionProps) {
  const pipClass = cn("grp-pip", pipState === "live" && "live", pipState === "stale" && "stale");
  return (
    <section className="sb-group group">
      <div className="sb-grp-label group-label">
        <span className={pipClass} aria-hidden="true" />
        <span className="grp-name">{`// ${label}`}</span>
        <span className="grp-line" aria-hidden="true" />
        <span className="grp-tools">
          <span className="grp-drag" title="Drag to reorder" aria-hidden="true">
            <svg viewBox="0 0 12 12" fill="currentColor">
              <circle cx="4" cy="3" r="0.9" />
              <circle cx="8" cy="3" r="0.9" />
              <circle cx="4" cy="6" r="0.9" />
              <circle cx="8" cy="6" r="0.9" />
              <circle cx="4" cy="9" r="0.9" />
              <circle cx="8" cy="9" r="0.9" />
            </svg>
          </span>
          <span className="grp-chev" title="Collapse" aria-hidden="true">
            <svg
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            >
              <path d="M3 4.5 L6 7.5 L9 4.5" />
            </svg>
          </span>
          {rightSlot ? (
            <span className="flex items-center">{rightSlot}</span>
          ) : null}
        </span>
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

type DeltaTone = "up" | "hot" | "neutral" | "new" | "tag";

/** Map the legacy V2 BadgeTone palette to the mockup's .delta variants. */
function toneToDelta(tone: BadgeTone, badge: string | number | undefined): DeltaTone {
  // Surface the "NEW" pill for any badge whose visible text is exactly "New"/"NEW".
  if (typeof badge === "string" && /^new$/i.test(badge.trim())) return "new";
  // ALL / x402 / Soon — uppercase metadata reads as a tag.
  if (typeof badge === "string" && /^[A-Z0-9]+$/.test(badge) && badge.length <= 5) {
    return "tag";
  }
  switch (tone) {
    case "delta":
      return "up";
    case "accent":
    case "danger":
      return "hot";
    case "default":
    default:
      return "neutral";
  }
}

/**
 * Split a label like "Trending Repos" into a base ("Trending") + an entity
 * fragment ("Repos") wrapped in <em class="ent">. Returns the original label
 * unchanged when the pattern doesn't match.
 */
function renderLabel(label: string): ReactNode {
  const trendingMatch = /^Trending\s+(.+)$/.exec(label);
  if (trendingMatch) {
    return (
      <>
        Trending <em className="ent">{trendingMatch[1]}</em>
      </>
    );
  }
  return label;
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
    "sb-nav nav relative w-full",
    isActive && "active",
    disabled && "cursor-not-allowed opacity-60",
  );

  const hasBadge = badge !== undefined && badge !== null && badge !== "";
  const deltaTone = hasBadge ? toneToDelta(badgeTone, badge) : "neutral";

  const content = (
    <>
      <span className="ic">
        <Icon size={14} />
      </span>
      <span className="lbl flex-1 truncate text-left tracking-[0.16em]">
        {renderLabel(label)}
      </span>
      {hasBadge && (
        <span className={cn("delta", deltaTone)}>{badge}</span>
      )}
    </>
  );

  if (disabled) {
    return (
      <div aria-disabled="true" className={className}>
        {content}
      </div>
    );
  }

  if (href) {
    return (
      <Link href={href} className={className}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={className}>
      {content}
    </button>
  );
}

/**
 * FreshCountNavRow — wraps V2NavRow with the `useFreshCount` hook so the
 * badge automatically swaps between cumulative total ("840") and
 * fresh-since-last-visit delta ("+521") depending on whether the user
 * has visited this route before. First-visit users see the cumulative
 * total; on subsequent visits, the badge shows new items added in
 * between (or stays empty when there are none).
 *
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

export function SidebarContent({
  metaCounts,
  watchlistPreview,
  sourceCounts,
  trendingReposCount,
  onClose,
}: SidebarContentProps) {
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const prepareAgentReposView = useFilterStore((s) => s.prepareAgentReposView);

  const watchCount = useWatchlistStore((s) => s.repos.length);
  const compareCount = useCompareStore((s) => s.repos.length);

  function goToAgentRepos() {
    prepareAgentReposView();
    onClose?.();
    if (pathname !== "/agent-repos") {
      startTransition(() => {
        router.push("/agent-repos");
      });
    }
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
        <V2Section label="TREND TERMINAL" pipState="live">
          <FreshCountNavRow
            routeKey="trendingRepos"
            currentCount={trendingReposCount ?? 0}
            href="/githubrepo"
            icon={TrendingUp}
            label="Trending Repos"
            active={pathname === "/githubrepo"}
          />
          <FreshCountNavRow
            routeKey="skills"
            currentCount={sourceCounts?.skillsItems ?? 0}
            href="/skills"
            icon={GraduationCap}
            label="Trending Skills"
            active={pathname === "/skills" || pathname.startsWith("/skills/")}
          />
          <FreshCountNavRow
            routeKey="mcp"
            currentCount={sourceCounts?.mcpItems ?? 0}
            href="/mcp"
            icon={Plug}
            label="Trending MCP"
            active={pathname === "/mcp" || pathname.startsWith("/mcp/")}
          />
          <FreshCountNavRow
            routeKey="agentRepos"
            currentCount={sourceCounts?.agentRepos ?? 0}
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
            href="/consensus"
            icon={Radar}
            label="Consensus"
            badge="3X"
            badgeTone="accent"
            active={pathname === "/consensus"}
          />
        </V2Section>

        {/* SIGNAL TERMINAL */}
        <V2Section label="SIGNAL TERMINAL" pipState="live">
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
        <V2Section label="LLM / PACK TERMINAL" pipState="live">
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
          {/* AGN-365: single HF entry. Datasets/Spaces are tabs on the host page,
              not separate sidebar items. Pathname startsWith /huggingface still
              keeps the row active across all three tabs. */}
          <FreshCountNavRow
            routeKey="hfModels"
            currentCount={sourceCounts?.hfModels ?? 0}
            href="/huggingface/trending"
            icon={Brain}
            label="HF Models"
            active={pathname.startsWith("/huggingface")}
          />
        </V2Section>

        {/* LAUNCH TERMINAL */}
        <V2Section label="LAUNCH TERMINAL" pipState="live">
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
            href="/agent-commerce"
            icon={Coins}
            label="Agent Commerce"
            badge="x402"
            badgeTone="accent"
            active={
              pathname === "/agent-commerce" ||
              pathname.startsWith("/agent-commerce/")
            }
          />
          {/* "Drop Revenue" sidebar entry hidden 2026-05-03 — page kept on
              disk so direct links still work, but the audit flagged it as
              having no shared data source and no production traffic. Re-enable
              once the submission pipeline is wired into the data-store. */}
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
        <V2Section label="RESEARCH TERMINAL" pipState="stale">
          <FreshCountNavRow
            routeKey="arxivPapers"
            currentCount={sourceCounts?.arxivPapers ?? 0}
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
          <FreshCountNavRow
            routeKey="citedRepos"
            currentCount={sourceCounts?.citedRepos ?? 0}
            href="/research"
            icon={Bot}
            label="Cited Repos"
            active={pathname === "/research" || pathname.startsWith("/research/")}
          />
        </V2Section>

        {/* EXPLORE */}
        <V2Section label="EXPLORE" pipState="live">
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
          {/* "Predict" sidebar entry hidden 2026-05-03 — page kept on disk
              (direct links still work) but the audit flagged the underlying
              data shape (.data/predictions.jsonl) as un-routed through the
              data-store, so freshness can't be tracked. Re-enable once
              predictions land in Redis like the other surfaces. */}
          <V2NavRow
            href="/collections"
            icon={Library}
            label="Collections"
            active={
              pathname === "/collections" ||
              pathname.startsWith("/collections/")
            }
          />
        </V2Section>

        {/* TOOLS */}
        <V2Section label="TOOLS" pipState="live">
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
            href="/top10"
            icon={BarChart3}
            label="Top 10"
            badge="New"
            badgeTone="accent"
            active={pathname === "/top10" || pathname.startsWith("/top10/")}
          />
        </V2Section>

        {/* RECENT — last ~5 repos the user opened, persisted client-side
            in localStorage. The widget self-hides on first-visit users
            (returns `null` until something is tracked) so the V2Section
            label only appears once there's something to show. */}
        <V2Section label="RECENT">
          <SidebarRecentViewedRepos />
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
