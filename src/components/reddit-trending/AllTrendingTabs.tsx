// Feed tabs + rows below the mindshare map.
//
// Tabs: TRENDING NOW (<24h, trending_score desc) /
//       HOT 7D (<7d, baseline_ratio × score) /
//       BY SUBREDDIT (grouped, top-3/sub).
// URL param: ?tab=trending-now|hot-7d|by-subreddit (+ optional ?topic=phrase)
// When ?topic is set, feed filters to posts whose title includes the phrase,
// and a "filter active" chip appears with a clear-X.

import Link from "next/link";
import dynamic from "next/dynamic";
import { Flame, TrendingUp, Users } from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import { ContentTagChips } from "@/components/reddit/ContentTagChips";
import type { RedditAllPost } from "@/lib/reddit-all";
import { cn } from "@/lib/utils";
import type { VelocityStats } from "./trending-helpers";
const TrendingNowTab = dynamic(() =>
  import("@/components/reddit-trending/TrendingNowTab").then(
    (mod) => mod.TrendingNowTab,
  ),
);
const HotWindowTab = dynamic(() =>
  import("@/components/reddit-trending/HotWindowTab").then(
    (mod) => mod.HotWindowTab,
  ),
);
const BySubredditTab = dynamic(() =>
  import("@/components/reddit-trending/BySubredditTab").then(
    (mod) => mod.BySubredditTab,
  ),
);

export type TrendingTab =
  | "trending-now"
  | "hot-7d"
  | "hot-30d"
  | "by-subreddit";

const TAB_IDS: TrendingTab[] = [
  "trending-now",
  "hot-7d",
  "hot-30d",
  "by-subreddit",
];
const TAB_LABELS: Record<TrendingTab, string> = {
  "trending-now": "Trending 24h",
  "hot-7d": "Hot 7d",
  "hot-30d": "Hot 30d",
  "by-subreddit": "By Subreddit",
};
const POSTS_PER_PAGE = 50;
interface ContentChipDef {
  key: string;
  contentTag: string;
}
const CONTENT_CHIPS = [
  { key: "repos", contentTag: "has-github-repo" },
  { key: "skills", contentTag: "has-skill" },
  { key: "mcp", contentTag: "has-mcp" },
  { key: "prompts", contentTag: "has-prompt" },
  { key: "code", contentTag: "has-code-block" },
  { key: "tutorials", contentTag: "has-tutorial" },
  { key: "cli", contentTag: "has-cli" },
  { key: "agents", contentTag: "has-agent" },
  { key: "news", contentTag: "is-news" },
  { key: "announcements", contentTag: "is-announcement" },
] as ContentChipDef[];
const CHIP_KEYS = new Set(CONTENT_CHIPS.map((chip) => chip.key));

type TabIcon = ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;
const TAB_ICONS: Record<TrendingTab, TabIcon> = {
  "trending-now": TrendingUp,
  "hot-7d": Flame,
  "hot-30d": Flame,
  "by-subreddit": Users,
};

function parseTab(raw: string | null): TrendingTab {
  if (raw && (TAB_IDS as string[]).includes(raw)) return raw as TrendingTab;
  return "trending-now";
}

function parsePage(raw: string | null): number {
  if (!raw) return 1;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return parsed;
}

function parseActiveChips(tags: string | null): Set<string> {
  if (!tags) return new Set();
  const out = new Set<string>();
  for (const key of tags.split(",")) {
    const trimmed = key.trim();
    if (CHIP_KEYS.has(trimmed)) out.add(trimmed);
  }
  return out;
}

function applyChipFilter<
  P extends { content_tags?: string[]; value_score?: number },
>(posts: P[], activeTags: Set<string>, showAll: boolean): P[] {
  if (activeTags.size === 0) {
    if (showAll) return posts;
    return posts.filter((p) => (p.value_score ?? 0) >= 1);
  }
  const contentTags = new Set(
    CONTENT_CHIPS.filter((chip) => activeTags.has(chip.key)).map((chip) => chip.contentTag),
  );
  return posts.filter((p) =>
    Array.isArray(p.content_tags)
      ? p.content_tags.some((tag) => contentTags.has(tag))
      : false,
  );
}

// p90 trending score across the currently-visible feed. Used to gate the
// VelocityIndicator render so chevrons only show on the noisiest top decile.
function computeTrendingP90(posts: RedditAllPost[]): number {
  if (posts.length === 0) return Number.POSITIVE_INFINITY;
  const scores = posts
    .map((p) => p.trendingScore ?? 0)
    .sort((a, b) => a - b);
  const idx = Math.floor(scores.length * 0.9);
  return scores[Math.min(idx, scores.length - 1)] ?? 0;
}

// p50 + p90 of `velocity` (upvotes/hour) across the currently-visible feed.
// Drives the right-stats velocity bar — bar fill is `velocity / p90`,
// fill color goes green when `velocity > p50` else muted.
function computeVelocityStats(posts: RedditAllPost[]): VelocityStats {
  const vals = posts
    .map((p) => p.velocity ?? 0)
    .filter((v) => v > 0)
    .sort((a, b) => a - b);
  if (vals.length === 0) return { p50: 0, p90: 0 };
  const p50Idx = Math.floor(vals.length * 0.5);
  const p90Idx = Math.floor(vals.length * 0.9);
  return {
    p50: vals[Math.min(p50Idx, vals.length - 1)] ?? 0,
    p90: vals[Math.min(p90Idx, vals.length - 1)] ?? 0,
  };
}

function postMatchesTopic(p: RedditAllPost, topic: string): boolean {
  if (!topic) return true;
  const needle = topic.toLowerCase();
  const hay = `${p.title ?? ""} ${p.selftext ?? ""}`.toLowerCase();
  return hay.includes(needle);
}

function filterByWindow(
  posts: RedditAllPost[],
  windowHours: number,
  nowMs: number,
): RedditAllPost[] {
  const cutoff = nowMs - windowHours * 60 * 60 * 1000;
  return posts.filter((p) => p.createdUtc * 1000 >= cutoff);
}

function sortTrendingNow(posts: RedditAllPost[]): RedditAllPost[] {
  // When trendingScore is uniformly 0 (RSS-fallback degraded mode where
  // Reddit /new.json doesn't expose upvotes for unauthenticated GH-Actions
  // egress) the velocity sort collapses and the feed looks frozen. Fall
  // back to chronological (newest first) so the 24h tab is still useful.
  const hasSignal = posts.some((p) => (p.trendingScore ?? 0) > 0);
  if (!hasSignal) {
    return posts.slice().sort((a, b) => b.createdUtc - a.createdUtc);
  }
  return posts
    .slice()
    .sort((a, b) => (b.trendingScore ?? 0) - (a.trendingScore ?? 0));
}

function sortHot7d(posts: RedditAllPost[]): RedditAllPost[] {
  // Same degraded-mode guard as sortTrendingNow — when score is uniformly 0
  // the (ratio × score) sort produces undefined order. Newest-first is the
  // only signal we have left.
  const hasSignal = posts.some((p) => p.score > 0);
  if (!hasSignal) {
    return posts.slice().sort((a, b) => b.createdUtc - a.createdUtc);
  }
  return posts.slice().sort((a, b) => {
    const av = (a.baselineRatio ?? 1) * a.score;
    const bv = (b.baselineRatio ?? 1) * b.score;
    return bv - av;
  });
}

function pickFirst(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function buildParams(
  searchParams?: Record<string, string | string[] | undefined>,
): URLSearchParams {
  const params = new URLSearchParams();
  if (!searchParams) return params;
  for (const [k, v] of Object.entries(searchParams)) {
    const first = pickFirst(v);
    if (typeof first === "string" && first.length > 0) {
      params.set(k, first);
    }
  }
  return params;
}

export interface TrendingRowsDto {
  tab: TrendingTab;
  rows: RedditAllPost[];
  counts: Record<TrendingTab, number>;
  totalItems: number;
  totalPages: number;
  activePage: number;
  topicPoolSize: number;
  chipCounts: Record<string, number>;
  hiddenCount: number;
  velocityP90: number;
  velocityStats: VelocityStats;
}

export function buildTrendingRowsDto(
  posts: RedditAllPost[],
  searchParams?: Record<string, string | string[] | undefined>,
): TrendingRowsDto {
  const params = buildParams(searchParams);
  const activeTab = parseTab(params.get("tab"));
  const requestedPage = parsePage(params.get("page"));
  const activeTopic = params.get("topic") ?? "";
  const activeChips = parseActiveChips(params.get("tags"));
  const showAll = params.get("showAll") === "1";
  const nowMs = Date.now();

  const topicFiltered = activeTopic
    ? posts.filter((p) => postMatchesTopic(p, activeTopic))
    : posts;

  const chipCounts: Record<string, number> = {};
  for (const chip of CONTENT_CHIPS) {
    chipCounts[chip.key] = topicFiltered.filter((p) =>
      Array.isArray(p.content_tags) && p.content_tags.includes(chip.contentTag),
    ).length;
  }
  const hiddenCount = topicFiltered.filter((p) => (p.value_score ?? 0) < 1).length;

  const defaultFilterWouldHideAll =
    activeChips.size === 0 &&
    !showAll &&
    topicFiltered.length > 0 &&
    topicFiltered.filter((p) => (p.value_score ?? 0) >= 1).length === 0;
  const effectiveShowAll = showAll || defaultFilterWouldHideAll;
  const chipFiltered = applyChipFilter(topicFiltered, activeChips, effectiveShowAll);

  const byTab: Record<TrendingTab, RedditAllPost[]> = {
    "trending-now": sortTrendingNow(filterByWindow(chipFiltered, 24, nowMs)),
    "hot-7d": sortHot7d(filterByWindow(chipFiltered, 168, nowMs)),
    "hot-30d": sortHot7d(filterByWindow(chipFiltered, 30 * 24, nowMs)),
    "by-subreddit": filterByWindow(chipFiltered, 168, nowMs),
  };
  const filtered = byTab[activeTab];
  const totalItems = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / POSTS_PER_PAGE));
  const activePage = Math.min(requestedPage, totalPages);
  const pageStart = (activePage - 1) * POSTS_PER_PAGE;
  const rows = filtered.slice(pageStart, pageStart + POSTS_PER_PAGE);

  return {
    tab: activeTab,
    rows,
    counts: {
      "trending-now": byTab["trending-now"].length,
      "hot-7d": byTab["hot-7d"].length,
      "hot-30d": byTab["hot-30d"].length,
      "by-subreddit": byTab["by-subreddit"].length,
    },
    totalItems,
    totalPages,
    activePage,
    topicPoolSize: topicFiltered.length,
    chipCounts,
    hiddenCount,
    velocityP90: computeTrendingP90(rows),
    velocityStats: computeVelocityStats(rows),
  };
}

export function AllTrendingTabs({
  posts,
  dto,
  searchParams,
  pathname = "/reddit/trending",
}: {
  posts?: RedditAllPost[];
  dto?: TrendingRowsDto;
  searchParams?: Record<string, string | string[] | undefined>;
  pathname?: string;
}) {
  const params = buildParams(searchParams);
  const activeTab = parseTab(params.get("tab"));
  const requestedPage = parsePage(params.get("page"));
  const activeTopic = params.get("topic") ?? "";
  const activeChips = parseActiveChips(params.get("tags"));
  const showAll = params.get("showAll") === "1";

  const nowMs = Date.now();

  // Hoisted: topic-filtered pool. Three useMemo blocks below + tabCounts
  // were each recomputing this filter. Computing once and depending on
  // the result everywhere downstream cuts redundant work on every
  // posts/topic change. Audit finding UI-12.
  const topicFiltered = activeTopic
    ? (posts ?? []).filter((p) => postMatchesTopic(p, activeTopic))
    : (posts ?? []);

  // Chip-filtered pool (default-hides value_score<1 unless showAll). Counts
  // below are computed off the pool AFTER topic filter but BEFORE chip
  // selection so toggling a chip doesn't zero out its own count.
  const chipCounts = (() => {
    if (dto) return dto.chipCounts;
    const counts: Record<string, number> = {};
    for (const chip of CONTENT_CHIPS) {
      counts[chip.key] = topicFiltered.filter((p) =>
        Array.isArray(p.content_tags) && p.content_tags.includes(chip.contentTag),
      ).length;
    }
    return counts;
  })();

  const hiddenCount = (() => {
    if (dto) return dto.hiddenCount;
    return topicFiltered.filter((p) => (p.value_score ?? 0) < 1).length;
  })();

  // Auto-degrade: when the chip filter is in default state (no chips +
  // showAll off) and that default would zero out the visible feed (the
  // degraded-data scenario where Reddit's RSS fallback never sets
  // value_score so 80%+ of posts get hidden), bypass the value_score gate
  // so the page still shows content. Active chips OR explicit showAll are
  // user intent — never override those.
  const defaultFilterWouldHideAll = (() => {
    if (activeChips.size > 0 || showAll) return false;
    if (topicFiltered.length === 0) return false;
    const passing = topicFiltered.filter((p) => (p.value_score ?? 0) >= 1);
    return passing.length === 0;
  })();
  const effectiveShowAll = showAll || defaultFilterWouldHideAll;

  const filtered = (() => {
    if (dto) return dto.rows;
    const chipFiltered = applyChipFilter(
      topicFiltered,
      activeChips,
      effectiveShowAll,
    );
    switch (activeTab) {
      case "trending-now":
        return sortTrendingNow(filterByWindow(chipFiltered, 24, nowMs));
      case "hot-7d":
        return sortHot7d(filterByWindow(chipFiltered, 168, nowMs));
      case "hot-30d":
        return sortHot7d(filterByWindow(chipFiltered, 30 * 24, nowMs));
      case "by-subreddit":
        return filterByWindow(chipFiltered, 168, nowMs);
    }
  })();
  const totalItems = dto?.totalItems ?? filtered.length;
  const totalPages = dto?.totalPages ?? Math.max(1, Math.ceil(totalItems / POSTS_PER_PAGE));
  const activePage = dto?.activePage ?? Math.min(requestedPage, totalPages);
  const pageStart = (activePage - 1) * POSTS_PER_PAGE;
  const pagedPosts = dto?.rows ?? filtered.slice(pageStart, pageStart + POSTS_PER_PAGE);

  const clearTopicHref = (() => {
    const next = new URLSearchParams(params.toString());
    next.delete("topic");
    const qs = next.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  })();

  // Click-to-filter on subreddit chip — pushes ?sub={name} the same way
  // the bubble map does. Feed consumption of ?sub is wired in commit 3.
  // p90 of trending_score across the currently-visible feed. Used to gate
  // the VelocityIndicator so chevrons only flag the top decile of activity.
  const computedVelocityP90 = computeTrendingP90(pagedPosts);
  const velocityP90 = dto?.velocityP90 ?? computedVelocityP90;

  // p50/p90 of *velocity* (upvotes/hour) — drives the right-stats velocity
  // bar fill ratio + color (green if above p50). Distinct from
  // `velocityP90` above which is a trending-score percentile.
  const computedVelocityStats = computeVelocityStats(pagedPosts);
  const velocityStats = dto?.velocityStats ?? computedVelocityStats;

  // Per-tab counts (post-topic, post-chip, post-showAll, post-window). Drives
  // the inset count badge on each tab in the strip below.
  const tabCounts = (() => {
    if (dto) return dto.counts;
    const chipFiltered = applyChipFilter(
      topicFiltered,
      activeChips,
      effectiveShowAll,
    );
    return {
      "trending-now": filterByWindow(chipFiltered, 24, nowMs).length,
      "hot-7d": filterByWindow(chipFiltered, 168, nowMs).length,
      "hot-30d": filterByWindow(chipFiltered, 30 * 24, nowMs).length,
      "by-subreddit": filterByWindow(chipFiltered, 168, nowMs).length,
    };
  })();

  return (
    <section>
      {/* Content-type chips */}
      <ContentTagChips counts={chipCounts} hiddenCount={hiddenCount} />

      {/* Terminal-grade tab strip — bottom-border indicator animated via
          framer-motion `layoutId` so the brand bar slides between active
          tabs instead of cross-fading. Horizontally scrollable on mobile. */}
      <div
        role="tablist"
        className="relative flex items-center gap-0 mb-3 border-b border-border-primary flex-nowrap overflow-x-auto scrollbar-hide"
      >
        {TAB_IDS.map((tab) => {
          const active = tab === activeTab;
          const nextParams = new URLSearchParams(params.toString());
          nextParams.set("tab", tab);
          const Icon = TAB_ICONS[tab];
          const count = tabCounts[tab];
          return (
            <Link
              key={tab}
              role="tab"
              aria-selected={active}
              href={`${pathname}?${nextParams.toString()}`}
              scroll={false}
              className={cn(
                "group relative h-10 px-4 inline-flex items-center gap-2 shrink-0",
                "text-[12px] font-mono uppercase tracking-wider transition-colors duration-150",
                active
                  ? "text-brand font-semibold"
                  : "text-text-tertiary hover:text-text-secondary",
              )}
            >
              <Icon
                size={14}
                aria-hidden="true"
                className={cn(
                  "shrink-0 transition-colors duration-150",
                  active ? "text-brand" : "text-text-tertiary group-hover:text-text-secondary",
                )}
              />
              <span>{TAB_LABELS[tab]}</span>
              <span
                className={cn(
                  "inline-flex items-center justify-center min-w-[22px] h-[18px] px-1.5 rounded-full",
                  "text-[10px] tabular-nums font-mono transition-colors duration-150",
                  active
                    ? "bg-brand/15 text-brand font-semibold"
                    : "bg-bg-secondary/80 text-text-muted group-hover:text-text-tertiary",
                )}
              >
                {count}
              </span>
              {/* Hover preview underline — only visible on inactive tabs */}
              {!active ? (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute bottom-0 left-0 right-0 h-px bg-brand/0 group-hover:bg-brand/40 transition-colors duration-150"
                />
              ) : null}
              {/* Animated active indicator — shared layoutId slides between tabs */}
              {active ? (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute bottom-0 left-0 right-0 h-[2px] bg-brand"
                />
              ) : null}
            </Link>
          );
        })}
        {activeTopic ? (
          <Link
            href={clearTopicHref}
            scroll={false}
            className="ml-auto mb-1 shrink-0 inline-flex items-center gap-1.5 px-2 h-7 rounded text-[11px] font-mono bg-brand/10 text-brand border border-brand/40 hover:bg-brand/20"
            aria-label={`Clear topic filter "${activeTopic}"`}
          >
            topic: {activeTopic}
            <span className="text-sm leading-none">×</span>
          </Link>
        ) : null}
      </div>

      {filtered.length === 0 ? (
        <EmptyWindow
          activeTab={activeTab}
          activeTopic={activeTopic}
          totalPosts={dto?.topicPoolSize ?? topicFiltered.length}
          tabCounts={tabCounts}
          pathname={pathname}
          searchParams={params}
        />
      ) : activeTab === "by-subreddit" ? (
        <BySubredditTab
          posts={pagedPosts}
          velocityP90={velocityP90}
          velocityStats={velocityStats}
        />
      ) : activeTab === "trending-now" ? (
        <TrendingNowTab
          posts={pagedPosts}
          velocityP90={velocityP90}
          velocityStats={velocityStats}
          pathname={pathname}
          searchParams={params}
        />
      ) : (
        <HotWindowTab
          posts={pagedPosts}
          velocityP90={velocityP90}
          velocityStats={velocityStats}
          pathname={pathname}
          searchParams={params}
        />
      )}

      {totalItems > POSTS_PER_PAGE ? (
        <PaginationNav
          pathname={pathname}
          searchParams={params}
          page={activePage}
          totalPages={totalPages}
          totalItems={totalItems}
        />
      ) : null}
    </section>
  );
}

function PaginationNav({
  pathname,
  searchParams,
  page,
  totalPages,
  totalItems,
}: {
  pathname: string;
  searchParams: URLSearchParams;
  page: number;
  totalPages: number;
  totalItems: number;
}) {
  const makeHref = (nextPage: number): string => {
    const next = new URLSearchParams(searchParams.toString());
    if (nextPage <= 1) {
      next.delete("page");
    } else {
      next.set("page", String(nextPage));
    }
    const qs = next.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };
  const start = (page - 1) * POSTS_PER_PAGE + 1;
  const end = Math.min(page * POSTS_PER_PAGE, totalItems);
  return (
    <nav
      aria-label="Reddit trending pagination"
      className="mt-4 flex items-center justify-between gap-3 border border-border-primary rounded-md px-3 py-2 bg-bg-secondary/40"
    >
      <span className="text-xs font-mono text-text-tertiary">
        {start.toLocaleString("en-US")}–{end.toLocaleString("en-US")} of{" "}
        {totalItems.toLocaleString("en-US")}
      </span>
      <div className="flex items-center gap-2">
        {page > 1 ? (
          <Link
            href={makeHref(page - 1)}
            scroll={false}
            className="inline-flex h-8 items-center rounded border border-border-primary px-3 text-xs font-mono text-text-secondary hover:border-brand/50 hover:text-brand"
          >
            Prev
          </Link>
        ) : (
          <span className="inline-flex h-8 items-center rounded border border-border-primary/50 px-3 text-xs font-mono text-text-muted">
            Prev
          </span>
        )}
        <span className="text-xs font-mono text-text-tertiary">
          {page} / {totalPages}
        </span>
        {page < totalPages ? (
          <Link
            href={makeHref(page + 1)}
            scroll={false}
            className="inline-flex h-8 items-center rounded border border-border-primary px-3 text-xs font-mono text-text-secondary hover:border-brand/50 hover:text-brand"
          >
            Next
          </Link>
        ) : (
          <span className="inline-flex h-8 items-center rounded border border-border-primary/50 px-3 text-xs font-mono text-text-muted">
            Next
          </span>
        )}
      </div>
    </nav>
  );
}

// Empty-window UI — replaces the silent dead-end "No posts" message with
// an explanation + navigation to a tab that DOES have data. Surfaced when
// the chip/window combo zeros out (e.g. classifier hasn't tagged any post
// in the last 24h, or topic filter excludes everything).
function EmptyWindow({
  activeTab,
  activeTopic,
  totalPosts,
  tabCounts,
  pathname,
  searchParams,
}: {
  activeTab: TrendingTab;
  activeTopic: string;
  totalPosts: number;
  tabCounts: Record<TrendingTab, number>;
  pathname: string;
  searchParams: URLSearchParams;
}) {
  // Suggest the first non-active tab that has matches.
  const suggestion = TAB_IDS.find(
    (t) => t !== activeTab && tabCounts[t] > 0,
  );
  const suggestionHref = suggestion
    ? (() => {
        const params = new URLSearchParams(searchParams.toString());
        params.set("tab", suggestion);
        return `${pathname}?${params.toString()}`;
      })()
    : null;

  return (
    <div className="border border-dashed border-border-primary rounded-md p-6 bg-bg-secondary/40 text-sm text-text-tertiary">
      <p>
        No posts in <span className="font-mono">{TAB_LABELS[activeTab]}</span>
        {activeTopic ? (
          <>
            {" "}matching <span className="font-mono">&ldquo;{activeTopic}&rdquo;</span>
          </>
        ) : null}
        .
      </p>
      {totalPosts > 0 ? (
        <p className="mt-2 text-text-muted">
          {totalPosts.toLocaleString("en-US")} posts available across other windows.
        </p>
      ) : null}
      {suggestion && suggestionHref ? (
        <p className="mt-3">
          Try{" "}
          <Link href={suggestionHref} scroll={false} className="text-brand underline">
            {TAB_LABELS[suggestion]}
          </Link>
          {" "}({tabCounts[suggestion].toLocaleString("en-US")} posts).
        </p>
      ) : null}
    </div>
  );
}

