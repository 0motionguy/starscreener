"use client";

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
import { useCallback, useMemo } from "react";
import { useSearchParams, usePathname, useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { Flame, TrendingUp, Users } from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import {
  ContentTagChips,
  CONTENT_CHIPS,
  applyChipFilter,
  parseActiveChips,
} from "@/components/reddit/ContentTagChips";
import type { RedditAllPost } from "@/lib/reddit-all";
import { cn } from "@/lib/utils";
import type { VelocityStats } from "./trending-helpers";

// Lazy-load tab panel chunks (AGN-455). Each tab's framer-motion-heavy row
// component (PostRow / PostRowCompact) only ships once that tab is selected.
// `ssr:false` keeps the panels off the server bundle so the initial HTML is
// just the tab strip + skeleton; activating a tab swaps in the real list.
const PostListPanel = dynamic(() => import("./PostListPanel"), {
  ssr: false,
  loading: () => <PanelSkeleton />,
});
const SubredditGroupPanel = dynamic(() => import("./SubredditGroupPanel"), {
  ssr: false,
  loading: () => <PanelSkeleton />,
});

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

function PanelSkeleton() {
  // Reserves vertical space while the dynamic chunk fetches so the page
  // doesn't shift (CLS) on tab switch. Three rough card heights ~= a
  // typical above-the-fold list view.
  return (
    <div className="space-y-2" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-[120px] rounded-xl border border-border-primary bg-bg-card/40"
        />
      ))}
    </div>
  );
}

export function AllTrendingTabs({ posts }: { posts: RedditAllPost[] }) {
  const reduceMotion = useReducedMotion();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const activeTab = parseTab(searchParams.get("tab"));
  const activeTopic = searchParams.get("topic") ?? "";
  const activeChips = parseActiveChips(searchParams.get("tags"));
  const showAll = searchParams.get("showAll") === "1";

  const nowMs = Date.now();

  // Hoisted: topic-filtered pool. Three useMemo blocks below + tabCounts
  // were each recomputing this filter. Computing once and depending on
  // the result everywhere downstream cuts redundant work on every
  // posts/topic change. Audit finding UI-12.
  const topicFiltered = useMemo(
    () =>
      activeTopic
        ? posts.filter((p) => postMatchesTopic(p, activeTopic))
        : posts,
    [posts, activeTopic],
  );

  // Chip-filtered pool (default-hides value_score<1 unless showAll). Counts
  // below are computed off the pool AFTER topic filter but BEFORE chip
  // selection so toggling a chip doesn't zero out its own count.
  const chipCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const chip of CONTENT_CHIPS) {
      counts[chip.key] = topicFiltered.filter((p) =>
        Array.isArray(p.content_tags) && p.content_tags.includes(chip.contentTag),
      ).length;
    }
    return counts;
  }, [topicFiltered]);

  const hiddenCount = useMemo(
    () => topicFiltered.filter((p) => (p.value_score ?? 0) < 1).length,
    [topicFiltered],
  );

  // Auto-degrade: when the chip filter is in default state (no chips +
  // showAll off) and that default would zero out the visible feed (the
  // degraded-data scenario where Reddit's RSS fallback never sets
  // value_score so 80%+ of posts get hidden), bypass the value_score gate
  // so the page still shows content. Active chips OR explicit showAll are
  // user intent — never override those.
  const defaultFilterWouldHideAll = useMemo(() => {
    if (activeChips.size > 0 || showAll) return false;
    if (topicFiltered.length === 0) return false;
    const passing = topicFiltered.filter((p) => (p.value_score ?? 0) >= 1);
    return passing.length === 0;
  }, [activeChips, showAll, topicFiltered]);
  const effectiveShowAll = showAll || defaultFilterWouldHideAll;

  const filtered = useMemo(() => {
    const chipFiltered = applyChipFilter(
      topicFiltered,
      activeChips,
      effectiveShowAll,
    );
    switch (activeTab) {
      case "trending-now":
        return sortTrendingNow(filterByWindow(chipFiltered, 24, nowMs)).slice(0, 50);
      case "hot-7d":
        return sortHot7d(filterByWindow(chipFiltered, 168, nowMs)).slice(0, 50);
      case "hot-30d":
        return sortHot7d(filterByWindow(chipFiltered, 30 * 24, nowMs)).slice(0, 50);
      case "by-subreddit":
        return filterByWindow(chipFiltered, 168, nowMs);
    }
  }, [activeTab, topicFiltered, activeChips, effectiveShowAll, nowMs]);

  function clearTopic() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("topic");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  // Click-to-filter on subreddit chip — pushes ?sub={name} the same way
  // the bubble map does. Feed consumption of ?sub is wired in commit 3.
  const pushSubFilter = useCallback(
    (sub: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("sub", sub);
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  // p90 of trending_score across the currently-visible feed. Used to gate
  // the VelocityIndicator so chevrons only flag the top decile of activity.
  const velocityP90 = useMemo(
    () => computeTrendingP90(filtered),
    [filtered],
  );

  // p50/p90 of *velocity* (upvotes/hour) — drives the right-stats velocity
  // bar fill ratio + color (green if above p50). Distinct from
  // `velocityP90` above which is a trending-score percentile.
  const velocityStats = useMemo(
    () => computeVelocityStats(filtered),
    [filtered],
  );

  // Per-tab counts (post-topic, post-chip, post-showAll, post-window). Drives
  // the inset count badge on each tab in the strip below.
  const tabCounts = useMemo<Record<TrendingTab, number>>(() => {
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
  }, [topicFiltered, activeChips, effectiveShowAll, nowMs]);

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
          const params = new URLSearchParams(searchParams.toString());
          params.set("tab", tab);
          const Icon = TAB_ICONS[tab];
          const count = tabCounts[tab];
          return (
            <Link
              key={tab}
              role="tab"
              aria-selected={active}
              href={`${pathname}?${params.toString()}`}
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
                <motion.span
                  layoutId="trendingTabIndicator"
                  aria-hidden="true"
                  className="pointer-events-none absolute bottom-0 left-0 right-0 h-[2px] bg-brand"
                  transition={
                    reduceMotion
                      ? { duration: 0 }
                      : { type: "spring", stiffness: 380, damping: 30 }
                  }
                />
              ) : null}
            </Link>
          );
        })}
        {activeTopic ? (
          <button
            type="button"
            onClick={clearTopic}
            className="ml-auto mb-1 shrink-0 inline-flex items-center gap-1.5 px-2 h-7 rounded text-[11px] font-mono bg-brand/10 text-brand border border-brand/40 hover:bg-brand/20"
            aria-label={`Clear topic filter "${activeTopic}"`}
          >
            topic: {activeTopic}
            <span className="text-sm leading-none">×</span>
          </button>
        ) : null}
      </div>

      {filtered.length === 0 ? (
        <EmptyWindow
          activeTab={activeTab}
          activeTopic={activeTopic}
          totalPosts={topicFiltered.length}
          tabCounts={tabCounts}
          pathname={pathname}
          searchParams={searchParams}
        />
      ) : activeTab === "by-subreddit" ? (
        <SubredditGroupPanel
          posts={filtered}
          velocityP90={velocityP90}
          velocityStats={velocityStats}
        />
      ) : (
        <PostListPanel
          posts={filtered}
          velocityP90={velocityP90}
          velocityStats={velocityStats}
          onSubClick={pushSubFilter}
        />
      )}
    </section>
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
  searchParams: ReturnType<typeof useSearchParams>;
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
