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
import { useCallback, useMemo } from "react";
import { useSearchParams, usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ChevronUp, Flame, MessageSquare, TrendingUp, Users } from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import { BaselinePill, type BaselinePillSize } from "@/components/reddit/BaselinePill";
import { VelocityIndicator } from "@/components/reddit/VelocityIndicator";
import {
  ContentTagChips,
  CONTENT_CHIPS,
  applyChipFilter,
  parseActiveChips,
} from "@/components/reddit/ContentTagChips";
import { ContentTagIcons } from "@/components/reddit/ContentTagIcons";
import { LetterAvatar } from "@/components/shared/LetterAvatar";
import type { RedditAllPost } from "@/lib/reddit-all";
import { redditPostHref, repoFullNameToHref } from "@/lib/reddit";
import { cn, formatNumber } from "@/lib/utils";

export type TrendingTab = "trending-now" | "hot-7d" | "by-subreddit";

const TAB_IDS: TrendingTab[] = ["trending-now", "hot-7d", "by-subreddit"];
const TAB_LABELS: Record<TrendingTab, string> = {
  "trending-now": "Trending Now",
  "hot-7d": "Hot 7d",
  "by-subreddit": "By Subreddit",
};

type TabIcon = ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;
const TAB_ICONS: Record<TrendingTab, TabIcon> = {
  "trending-now": TrendingUp,
  "hot-7d": Flame,
  "by-subreddit": Users,
};

function parseTab(raw: string | null): TrendingTab {
  if (raw && (TAB_IDS as string[]).includes(raw)) return raw as TrendingTab;
  return "trending-now";
}

function formatPostAge(hours: number | undefined): string {
  if (hours == null) return "—";
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 24) return `${Math.round(hours)}h`;
  const days = hours / 24;
  return `${Math.round(days)}d`;
}

// ---------------------------------------------------------------------------
// Tier classification (Fix 8)
// ---------------------------------------------------------------------------

type PostTier = "hyperviral" | "breakout" | "above-avg" | "baseline";

interface TierClasses {
  row: string;
  title: string;
  baselinePillSize: BaselinePillSize;
  contentOpacity: string;
}

function getPostTier(ratio: number | null | undefined): PostTier {
  if (ratio == null) return "baseline";
  if (ratio >= 100) return "hyperviral";
  if (ratio >= 10) return "breakout";
  if (ratio >= 1) return "above-avg";
  return "baseline";
}

// Premium card-aesthetic tiers. The card *itself* (border, shadow, fill,
// gradient wash) lives here; the title/baseline pill scaling lives here too.
// HYPERVIRAL gets a bold orange left border + faint orange wash gradient so
// the row screams across the feed at a single glance.
function tierClasses(tier: PostTier): TierClasses {
  switch (tier) {
    case "hyperviral":
      return {
        row: "border-l-4 border-l-[#ff6600] bg-gradient-to-br from-bg-card via-bg-card to-[#ff6600]/[0.06]",
        title: "text-lg sm:text-xl font-bold",
        baselinePillSize: "lg",
        contentOpacity: "",
      };
    case "breakout":
      return {
        row: "border-l-2 border-l-[#ff4500]/70",
        title: "text-base sm:text-lg font-bold",
        baselinePillSize: "md",
        contentOpacity: "",
      };
    case "above-avg":
      return {
        row: "",
        title: "text-base font-semibold",
        baselinePillSize: "sm",
        contentOpacity: "",
      };
    case "baseline":
      return {
        row: "opacity-75 hover:opacity-100",
        title: "text-sm font-semibold",
        baselinePillSize: "sm",
        contentOpacity: "",
      };
  }
}

// Compact form factor — same card aesthetic as `tierClasses` but with
// tighter padding and a flat font ramp (`text-sm font-bold` for all tiers
// except baseline) since SubredditGroupView is dense by design.
function tierClassesCompact(tier: PostTier): TierClasses {
  switch (tier) {
    case "hyperviral":
      return {
        row: "border-l-4 border-l-[#ff6600] bg-gradient-to-br from-bg-card via-bg-card to-[#ff6600]/[0.06]",
        title: "text-sm font-bold",
        baselinePillSize: "md",
        contentOpacity: "",
      };
    case "breakout":
      return {
        row: "border-l-2 border-l-[#ff4500]/70",
        title: "text-sm font-bold",
        baselinePillSize: "sm",
        contentOpacity: "",
      };
    case "above-avg":
      return {
        row: "",
        title: "text-sm font-semibold",
        baselinePillSize: "sm",
        contentOpacity: "",
      };
    case "baseline":
      return {
        row: "opacity-75 hover:opacity-100",
        title: "text-xs font-semibold",
        baselinePillSize: "sm",
        contentOpacity: "",
      };
  }
}

// 12 stable hues per subreddit (60% sat, 65% lightness) → readable on dark
// theme as TEXT color, unlike LetterAvatar's 50/35 background variant.
function subredditColorHash(seed: string): string {
  let sum = 0;
  for (let i = 0; i < seed.length; i++) sum += seed.charCodeAt(i);
  const hue = (Math.round(sum / 30) * 30) % 360;
  return `hsl(${hue}, 60%, 65%)`;
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
interface VelocityStats {
  p50: number;
  p90: number;
}
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
  return posts
    .slice()
    .sort((a, b) => (b.trendingScore ?? 0) - (a.trendingScore ?? 0));
}

function sortHot7d(posts: RedditAllPost[]): RedditAllPost[] {
  return posts.slice().sort((a, b) => {
    const av = (a.baselineRatio ?? 1) * a.score;
    const bv = (b.baselineRatio ?? 1) * b.score;
    return bv - av;
  });
}

export function AllTrendingTabs({ posts }: { posts: RedditAllPost[] }) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const activeTab = parseTab(searchParams.get("tab"));
  const activeTopic = searchParams.get("topic") ?? "";
  const activeChips = parseActiveChips(searchParams.get("tags"));
  const showAll = searchParams.get("showAll") === "1";

  const nowMs = Date.now();

  // Chip-filtered pool (default-hides value_score<1 unless showAll). Counts
  // below are computed off the pool AFTER topic filter but BEFORE chip
  // selection so toggling a chip doesn't zero out its own count.
  const chipCounts = useMemo(() => {
    const topicFiltered = activeTopic
      ? posts.filter((p) => postMatchesTopic(p, activeTopic))
      : posts;
    const counts: Record<string, number> = {};
    for (const chip of CONTENT_CHIPS) {
      counts[chip.key] = topicFiltered.filter((p) =>
        Array.isArray(p.content_tags) && p.content_tags.includes(chip.contentTag),
      ).length;
    }
    return counts;
  }, [posts, activeTopic]);

  const hiddenCount = useMemo(() => {
    const topicFiltered = activeTopic
      ? posts.filter((p) => postMatchesTopic(p, activeTopic))
      : posts;
    return topicFiltered.filter((p) => (p.value_score ?? 0) < 1).length;
  }, [posts, activeTopic]);

  const filtered = useMemo(() => {
    const topicFiltered = activeTopic
      ? posts.filter((p) => postMatchesTopic(p, activeTopic))
      : posts;
    const chipFiltered = applyChipFilter(topicFiltered, activeChips, showAll);
    switch (activeTab) {
      case "trending-now":
        return sortTrendingNow(filterByWindow(chipFiltered, 24, nowMs)).slice(0, 50);
      case "hot-7d":
        return sortHot7d(filterByWindow(chipFiltered, 168, nowMs)).slice(0, 50);
      case "by-subreddit":
        return filterByWindow(chipFiltered, 168, nowMs);
    }
  }, [activeTab, activeTopic, activeChips, showAll, posts, nowMs]);

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
    const topicFiltered = activeTopic
      ? posts.filter((p) => postMatchesTopic(p, activeTopic))
      : posts;
    const chipFiltered = applyChipFilter(topicFiltered, activeChips, showAll);
    return {
      "trending-now": filterByWindow(chipFiltered, 24, nowMs).length,
      "hot-7d": filterByWindow(chipFiltered, 168, nowMs).length,
      "by-subreddit": filterByWindow(chipFiltered, 168, nowMs).length,
    };
  }, [posts, activeTopic, activeChips, showAll, nowMs]);

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
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
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
        <div className="border border-dashed border-border-primary rounded-md p-6 bg-bg-secondary/40 text-sm text-text-tertiary">
          No posts in this window{activeTopic ? ` matching "${activeTopic}"` : ""}.
        </div>
      ) : activeTab === "by-subreddit" ? (
        <SubredditGroupView
          posts={filtered}
          velocityP90={velocityP90}
          velocityStats={velocityStats}
        />
      ) : (
        <ul className="space-y-2">
          {filtered.map((p) => (
            <PostRow
              key={p.id}
              post={p}
              velocityP90={velocityP90}
              velocityStats={velocityStats}
              onSubClick={pushSubFilter}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Row + grouped view
// ---------------------------------------------------------------------------

function postHref(p: RedditAllPost): string {
  return redditPostHref(p.permalink, p.url);
}

interface PostRowProps {
  post: RedditAllPost;
  velocityP90: number;
  velocityStats: VelocityStats;
  onSubClick: (sub: string) => void;
}

function PostRow({ post: p, velocityP90, velocityStats, onSubClick }: PostRowProps) {
  const primaryRepo =
    p.linkedRepos && p.linkedRepos.length > 0
      ? p.linkedRepos[0].fullName
      : p.repoFullName ?? null;
  const velocityNum =
    typeof p.velocity === "number" && p.velocity > 0 ? Math.round(p.velocity) : 0;
  const velocityHasData = velocityNum > 0;
  // Bar fill ratio — clamped 0..1 against the visible-feed p90 so the
  // longest bar in the feed is always ~full.
  const velocityFillRatio = (() => {
    if (!velocityHasData || velocityStats.p90 <= 0) return 0;
    return Math.min(1, (p.velocity ?? 0) / velocityStats.p90);
  })();
  const velocityIsHot =
    velocityHasData && (p.velocity ?? 0) > velocityStats.p50 && velocityStats.p50 > 0;

  const tier = getPostTier(p.baselineRatio);
  const tc = tierClasses(tier);
  const subColor = subredditColorHash(p.subreddit);
  const showVelocity = (p.trendingScore ?? 0) >= velocityP90;

  return (
    <motion.li
      whileHover={{ y: -2, scale: 1.005 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
      className={cn(
        // PREMIUM CARD — Linear changelog × Vercel feed × TweetDeck dense
        // Big breathing room, rounded-xl, hover-lift via framer + shadow.
        "group relative block border border-border-primary rounded-xl bg-bg-card shadow-card p-4 sm:p-5",
        "transition-[border-color,box-shadow,background-color] duration-200",
        "hover:border-brand/40 hover:shadow-[0_8px_24px_-8px_rgba(245,110,15,0.25)]",
        tc.row,
        tc.contentOpacity,
      )}
    >
      {/* ── Top meta row: avatar · sub · user · age · velocity ──── pill (right) ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <LetterAvatar seed={p.subreddit} size={28} />
        <button
          type="button"
          onClick={() => onSubClick(p.subreddit)}
          className="text-sm font-mono font-semibold hover:underline truncate max-w-[200px]"
          style={{ color: subColor }}
          title={`Filter feed to r/${p.subreddit}`}
        >
          r/{p.subreddit}
        </button>
        <a
          href={`https://reddit.com/r/${p.subreddit}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-text-muted hover:text-accent-green text-xs leading-none -ml-1"
          aria-label={`Open r/${p.subreddit} on Reddit`}
          title="Open on reddit.com"
        >
          ↗
        </a>
        <span className="text-text-muted text-xs">·</span>
        <a
          href={`https://reddit.com/u/${p.author}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-text-muted hover:text-accent-green text-xs font-mono truncate max-w-[140px]"
        >
          u/{p.author}
        </a>
        <span className="text-text-muted text-xs">·</span>
        <span className="text-text-muted text-xs font-mono">
          {formatPostAge(p.ageHours)}
        </span>
        <VelocityIndicator
          trendingScore={p.trendingScore}
          gated={showVelocity}
        />
        {/* BaselinePill pinned to right edge — the big trend signal */}
        <span className="ml-auto inline-flex items-center">
          <BaselinePill
            sub={p.subreddit}
            ratio={p.baselineRatio}
            tier={p.baselineTier}
            confidence={p.baselineConfidence}
            size={tc.baselinePillSize}
          />
        </span>
      </div>

      {/* ── Title row: THE HERO ─────────────────────────────────────── */}
      <a
        href={postHref(p)}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          "mt-3 block text-text-primary leading-tight line-clamp-2 transition-colors",
          "group-hover:text-brand",
          tc.title,
        )}
      >
        {p.title}
      </a>

      {/* ── Bottom row: tag-icons + repo (left)  /  stats cluster (right) ── */}
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        {/* LEFT cluster — tag icons + linked repo chip */}
        <div className="flex items-center flex-wrap gap-2 min-w-0">
          <ContentTagIcons tags={p.content_tags} max={6} size={14} />
          {primaryRepo ? (
            <Link
              href={repoFullNameToHref(primaryRepo)}
              className="inline-flex items-center px-2 h-6 rounded-md border border-border-primary text-[11px] font-mono text-brand hover:border-brand/60 hover:bg-brand/5 transition-colors truncate max-w-[220px]"
              aria-label={`Tracked repo ${primaryRepo}`}
              title={`linked: ${primaryRepo}`}
            >
              <span className="mr-1 opacity-70">→</span>
              <span className="truncate">{primaryRepo}</span>
            </Link>
          ) : null}
        </div>

        {/* RIGHT cluster — boxed terminal-grade stats dashboard */}
        <div className="sm:ml-auto inline-flex items-center gap-3 px-3 py-1.5 rounded-lg bg-bg-secondary/50 border border-border-primary/40 shrink-0 self-start sm:self-auto">
          <span className="inline-flex items-center gap-1 text-sm font-bold font-mono tabular-nums text-text-primary leading-none">
            <ChevronUp
              size={14}
              className={velocityIsHot ? "text-up" : "text-text-muted"}
              aria-hidden="true"
              strokeWidth={3}
            />
            {formatNumber(p.score)}
          </span>
          <span className="h-3 w-px bg-border-primary/60" aria-hidden="true" />
          <span className="inline-flex items-center gap-1 text-xs font-mono tabular-nums text-text-secondary leading-none">
            <MessageSquare size={13} aria-hidden="true" />
            {formatNumber(p.numComments)}
          </span>
          <span className="h-3 w-px bg-border-primary/60" aria-hidden="true" />
          {velocityHasData ? (
            <span className="inline-flex items-center gap-1.5">
              <span
                aria-hidden="true"
                title={`${velocityNum}/h velocity vs feed p90 ${Math.round(velocityStats.p90)}/h`}
                className="block w-10 h-[3px] rounded-full bg-bg-card-hover overflow-hidden"
              >
                <span
                  className={cn(
                    "block h-full rounded-full",
                    velocityIsHot ? "bg-up" : "bg-text-muted",
                  )}
                  style={{ width: `${Math.max(velocityFillRatio * 100, 4)}%` }}
                />
              </span>
              <span className="text-[11px] text-text-tertiary font-mono tabular-nums leading-none">
                {velocityNum}/h
              </span>
            </span>
          ) : (
            <span className="text-[11px] text-text-tertiary font-mono tabular-nums leading-none">
              0/h
            </span>
          )}
        </div>
      </div>
    </motion.li>
  );
}

function SubredditGroupView({
  posts,
  velocityP90,
  velocityStats,
}: {
  posts: RedditAllPost[];
  velocityP90: number;
  velocityStats: VelocityStats;
}) {
  const grouped = useMemo(() => {
    const bySub = new Map<string, RedditAllPost[]>();
    for (const p of posts) {
      const bucket = bySub.get(p.subreddit) ?? [];
      bucket.push(p);
      bySub.set(p.subreddit, bucket);
    }
    return Array.from(bySub.entries())
      .map(([sub, bucket]) => {
        const sorted = bucket
          .slice()
          .sort((a, b) => (b.trendingScore ?? 0) - (a.trendingScore ?? 0));
        const top3 = sorted.slice(0, 3);
        const breakouts = bucket.filter(
          (p) => p.baselineTier === "breakout",
        ).length;
        const trendingScoreSum = bucket.reduce(
          (acc, p) => acc + (p.trendingScore ?? 0),
          0,
        );
        return { sub, top3, breakouts, trendingScoreSum };
      })
      .filter((g) => g.top3.length > 0)
      .sort((a, b) => b.trendingScoreSum - a.trendingScoreSum);
  }, [posts]);

  if (grouped.length === 0) return null;

  return (
    <ul className="space-y-4">
      {grouped.map((g) => (
        <li
          key={g.sub}
          className="border border-border-primary rounded-md bg-bg-secondary"
        >
          <div className="flex items-center justify-between px-4 py-2 border-b border-border-primary">
            <span
              className="text-sm font-bold"
              style={{ color: subredditColorHash(g.sub) }}
            >
              r/{g.sub}
            </span>
            <span className="text-[11px] text-text-tertiary font-mono">
              {g.breakouts > 0 ? `${g.breakouts} breakout · ` : ""}
              Σ trending {Math.round(g.trendingScoreSum).toLocaleString()}
            </span>
          </div>
          <ul className="p-3 space-y-2">
            {g.top3.map((p) => (
              <PostRowCompact
                key={p.id}
                post={p}
                velocityP90={velocityP90}
                velocityStats={velocityStats}
              />
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

function PostRowCompact({
  post: p,
  velocityP90,
  velocityStats,
}: {
  post: RedditAllPost;
  velocityP90: number;
  velocityStats: VelocityStats;
}) {
  const tier = getPostTier(p.baselineRatio);
  const tc = tierClassesCompact(tier);
  const showVelocity = (p.trendingScore ?? 0) >= velocityP90;
  const velocityNum =
    typeof p.velocity === "number" && p.velocity > 0 ? Math.round(p.velocity) : 0;
  const velocityIsHot =
    velocityNum > 0 && (p.velocity ?? 0) > velocityStats.p50 && velocityStats.p50 > 0;

  return (
    <motion.li
      whileHover={{ y: -1, scale: 1.003 }}
      transition={{ duration: 0.12, ease: "easeOut" }}
      className={cn(
        // Same card aesthetic as PostRow but tighter (p-3 vs p-5).
        "group relative block border border-border-primary rounded-xl bg-bg-card shadow-card p-3",
        "transition-[border-color,box-shadow,background-color] duration-200",
        "hover:border-brand/40 hover:shadow-[0_6px_18px_-8px_rgba(245,110,15,0.22)]",
        tc.row,
        tc.contentOpacity,
      )}
    >
      {/* Top meta — no avatar / no r/sub (parent group owns sub context) */}
      <div className="flex items-center gap-2 flex-wrap">
        <a
          href={`https://reddit.com/u/${p.author}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] font-mono text-text-muted hover:text-accent-green truncate max-w-[160px]"
        >
          u/{p.author}
        </a>
        <span className="text-text-muted text-[11px]">·</span>
        <span className="text-[11px] font-mono text-text-muted">
          {formatPostAge(p.ageHours)}
        </span>
        <VelocityIndicator
          trendingScore={p.trendingScore}
          gated={showVelocity}
        />
        <span className="ml-auto inline-flex items-center">
          <BaselinePill
            sub={p.subreddit}
            ratio={p.baselineRatio}
            tier={p.baselineTier}
            confidence={p.baselineConfidence}
            size={tc.baselinePillSize}
          />
        </span>
      </div>

      {/* Title — bold but compact (no tier scaling) */}
      <a
        href={postHref(p)}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          "mt-2 block text-text-primary leading-snug line-clamp-2 transition-colors",
          "group-hover:text-brand",
          tc.title,
        )}
      >
        {p.title}
      </a>

      {/* Bottom row: tag icons (left) / compact stats cluster (right) */}
      <div className="mt-2.5 flex items-center gap-2 flex-wrap">
        <ContentTagIcons tags={p.content_tags} max={4} size={12} />
        <span className="ml-auto inline-flex items-center gap-2 px-2 py-1 rounded-md bg-bg-secondary/50 border border-border-primary/40 shrink-0">
          <span className="inline-flex items-center gap-0.5 text-xs font-bold font-mono tabular-nums text-text-primary leading-none">
            <ChevronUp
              size={12}
              className={velocityIsHot ? "text-up" : "text-text-muted"}
              aria-hidden="true"
              strokeWidth={3}
            />
            {formatNumber(p.score)}
          </span>
          <span className="h-2.5 w-px bg-border-primary/60" aria-hidden="true" />
          <span className="inline-flex items-center gap-0.5 text-[11px] font-mono tabular-nums text-text-secondary leading-none">
            <MessageSquare size={11} aria-hidden="true" />
            {formatNumber(p.numComments)}
          </span>
          {velocityNum > 0 ? (
            <>
              <span className="h-2.5 w-px bg-border-primary/60" aria-hidden="true" />
              <span className="text-[10px] font-mono tabular-nums text-text-tertiary leading-none">
                {velocityNum}/h
              </span>
            </>
          ) : null}
        </span>
      </div>
    </motion.li>
  );
}
