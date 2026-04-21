// Subreddit Heat Map — finviz-style treemap of AI subreddits.
//
// Replaces the bubble-cluster SubredditMindshareMap as the hero of
// /reddit/trending. Each rectangle is a SUBREDDIT. Cell area is sized by
// activity, color encodes momentum tier (cooling → stable → heating →
// breakout), and the cell content (name, big number, momentum delta,
// 7-day mini-sparkline) is dense and Bloomberg-terminal-grade.
//
// Server component. Builds the per-window aggregates (24h + 7d) once and
// hands a single, fully-resolved `cells` payload down to the client
// renderer, which only owns toggle / sort / hover state.

import type { RedditAllPost } from "@/lib/reddit-all";
import {
  SubredditHeatMapCanvas,
  type HeatCell,
  type HeatWindowKey,
  type HeatWindowSet,
} from "./SubredditHeatMapCanvas";

interface SubredditHeatMapProps {
  posts: RedditAllPost[];
  /** Max subreddits surfaced per window. Default 60. */
  limit?: number;
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_SECONDS = 24 * 60 * 60;
const SPARKLINE_DAYS = 7;
const TOOLTIP_TITLE_MAX = 60;
const TOOLTIP_TITLE_LIMIT = 3;

interface SubAggregate {
  subreddit: string;
  activityScore: number;
  breakoutCount: number;
  aboveAvgCount: number;
  totalPosts: number;
  windowPosts: RedditAllPost[];
}

function aggregateBySubreddit(posts: RedditAllPost[]): SubAggregate[] {
  const byId = new Map<string, SubAggregate>();
  for (const p of posts) {
    if (!p.subreddit) continue;
    const cur = byId.get(p.subreddit) ?? {
      subreddit: p.subreddit,
      activityScore: 0,
      breakoutCount: 0,
      aboveAvgCount: 0,
      totalPosts: 0,
      windowPosts: [],
    };
    cur.activityScore += p.trendingScore ?? p.score ?? 0;
    if (p.baselineTier === "breakout") cur.breakoutCount += 1;
    if (p.baselineTier === "above-average") cur.aboveAvgCount += 1;
    cur.totalPosts += 1;
    cur.windowPosts.push(p);
    byId.set(p.subreddit, cur);
  }
  return Array.from(byId.values());
}

function momentumRatio(activity24h: number, avg7d: number): number {
  if (avg7d <= 0) return activity24h > 0 ? 2 : 1;
  return activity24h / avg7d;
}

interface MomentumStyle {
  fill: string;
  gradientEnd: string;
  textColor: string;
  tier: "breakout" | "heating" | "stable" | "cooling";
}

function momentumColor(ratio: number, breakoutCount: number): MomentumStyle {
  if (breakoutCount >= 3 || ratio > 5) {
    return {
      fill: "#ff6600",
      gradientEnd: "#ff4500",
      textColor: "#ffffff",
      tier: "breakout",
    };
  }
  if (ratio > 1.3) {
    return {
      fill: "#10B981",
      gradientEnd: "#22c55e",
      textColor: "#ffffff",
      tier: "heating",
    };
  }
  if (ratio >= 0.7) {
    return {
      fill: "#2D5A3D",
      gradientEnd: "#22c55e",
      textColor: "#ffffff",
      tier: "stable",
    };
  }
  return {
    fill: "#4A5568",
    gradientEnd: "#6B7B8D",
    textColor: "#ffffff",
    tier: "cooling",
  };
}

function topPostTitles(windowPosts: RedditAllPost[]): string[] {
  return [...windowPosts]
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, TOOLTIP_TITLE_LIMIT)
    .map((p) => {
      const t = (p.title ?? "").trim();
      return t.length > TOOLTIP_TITLE_MAX
        ? `${t.slice(0, TOOLTIP_TITLE_MAX - 1)}…`
        : t;
    });
}

function sparkline7d(windowPosts: RedditAllPost[], nowMs: number): number[] {
  const todayDay = Math.floor(nowMs / 1000 / DAY_SECONDS);
  const bins = new Array<number>(SPARKLINE_DAYS).fill(0);
  for (const p of windowPosts) {
    const day = Math.floor(p.createdUtc / DAY_SECONDS);
    const idx = SPARKLINE_DAYS - 1 - (todayDay - day);
    if (idx >= 0 && idx < SPARKLINE_DAYS) {
      bins[idx] += p.trendingScore ?? p.score ?? 0;
    }
  }
  return bins;
}

function buildAggregatesForWindow(
  posts: RedditAllPost[],
  window: HeatWindowKey,
  nowMs: number,
): SubAggregate[] {
  const cutoff = nowMs - (window === "24h" ? 24 : 168) * HOUR_MS;
  const windowed = posts.filter((p) => p.createdUtc * 1000 >= cutoff);
  if (windowed.length === 0) return [];
  return aggregateBySubreddit(windowed).filter((a) => a.activityScore > 0);
}

function buildCells(
  aggregates: SubAggregate[],
  total24hBySub: Map<string, number>,
  total7dBySub: Map<string, number>,
  nowMs: number,
): HeatCell[] {
  return aggregates.map((agg) => {
    const total7d = total7dBySub.get(agg.subreddit) ?? 0;
    const avg7d = total7d / 7;
    const total24h = total24hBySub.get(agg.subreddit) ?? 0;
    const ratio = momentumRatio(total24h, avg7d);
    const style = momentumColor(ratio, agg.breakoutCount);

    return {
      id: agg.subreddit,
      subreddit: agg.subreddit,
      activityScore: agg.activityScore,
      breakoutCount: agg.breakoutCount,
      aboveAvgCount: agg.aboveAvgCount,
      totalPosts: agg.totalPosts,
      momentumRatio: ratio,
      tier: style.tier,
      fill: style.fill,
      gradientEnd: style.gradientEnd,
      textColor: style.textColor,
      topPostTitles: topPostTitles(agg.windowPosts),
      sparkline7d: sparkline7d(agg.windowPosts, nowMs),
    };
  });
}

export function SubredditHeatMap({ posts, limit = 60 }: SubredditHeatMapProps) {
  const now = Date.now();

  // Pre-compute per-sub totals for both windows in a single pass.
  const cutoff7d = now - 168 * HOUR_MS;
  const cutoff24h = now - 24 * HOUR_MS;
  const total7dBySub = new Map<string, number>();
  const total24hBySub = new Map<string, number>();
  for (const p of posts) {
    if (!p.subreddit) continue;
    const created = p.createdUtc * 1000;
    if (created < cutoff7d) continue;
    const v = p.trendingScore ?? p.score ?? 0;
    total7dBySub.set(p.subreddit, (total7dBySub.get(p.subreddit) ?? 0) + v);
    if (created >= cutoff24h) {
      total24hBySub.set(
        p.subreddit,
        (total24hBySub.get(p.subreddit) ?? 0) + v,
      );
    }
  }

  const build = (window: HeatWindowKey): HeatCell[] => {
    const aggregates = buildAggregatesForWindow(posts, window, now)
      .sort((a, b) => b.activityScore - a.activityScore)
      .slice(0, limit);
    return buildCells(aggregates, total24hBySub, total7dBySub, now);
  };

  const windows: HeatWindowSet = {
    "24h": build("24h"),
    "7d": build("7d"),
  };

  const hasAny = windows["24h"].length > 0 || windows["7d"].length > 0;
  if (!hasAny) return null;

  const headlineCount = windows["24h"].length || windows["7d"].length;

  return (
    <div className="space-y-2">
      <div className="px-1 text-[11px] font-mono uppercase tracking-wider text-text-tertiary">
        {`// ${headlineCount} subreddits · area = activity · color = momentum vs 7d avg · orange = breakout`}
      </div>
      <SubredditHeatMapCanvas windows={windows} />
    </div>
  );
}
