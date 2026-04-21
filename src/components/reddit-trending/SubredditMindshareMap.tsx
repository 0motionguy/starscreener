// Subreddit Mindshare Map — replaces TopicMindshareMap on /reddit/trending.
//
// Each bubble is a SUBREDDIT. Color encodes MOMENTUM (24h activity vs 7d
// daily average), ring encodes BREAKOUT intensity. Size encodes activity —
// available in linear or log10 scale (toggle on the canvas).
//
// Aggregation per sub (within window):
//   activityScore  = sum of trendingScore (fallback: score) across posts
//   breakoutCount  = posts where baselineTier === "breakout"
//   aboveAvgCount  = posts where baselineTier === "above-average"
//   totalPosts     = total post count
//
// Server component. Computes circle-pack seeds for BOTH windows (24h / 7d) in
// BOTH scales (log / linear) so the client toggle has zero re-pack cost.
// Also pre-computes per-sub momentum, top-3 post titles, and 7-day daily
// activity sparkline for the rich hover tooltip.

import { packBubbles } from "@/lib/bubble-pack";
import type { RedditAllPost } from "@/lib/reddit-all";
import {
  SubredditMindshareCanvas,
  type SubredditSeed,
  type SubredditWindowKey,
  type SubredditWindowSeedSet,
} from "./SubredditMindshareCanvas";

interface SubredditMindshareMapProps {
  posts: RedditAllPost[];
  /** Max subreddits packed per window. Default 60. */
  limit?: number;
}

const MAP_WIDTH = 1200;
const MAP_HEIGHT = 400;
// Match the topic map scale so the visual rhythm of the page is consistent.
const MIN_RADIUS = 22;
const MAX_RADIUS = 70;

const BREAKOUT_RING = "#ff4500"; // canonical Reddit orange
const NO_BREAKOUT_RING = "rgba(148, 163, 184, 0.35)"; // neutral border-primary tone

// Cap top-post titles at 60 chars so the tooltip stays a single line each.
const TOOLTIP_TITLE_MAX = 60;
const TOOLTIP_TITLE_LIMIT = 3;
const SPARKLINE_DAYS = 7;
const HOUR_MS = 60 * 60 * 1000;
const DAY_SECONDS = 24 * 60 * 60;

interface SubAggregate {
  subreddit: string;
  activityScore: number;
  breakoutCount: number;
  aboveAvgCount: number;
  totalPosts: number;
  /** Posts that fell in this window — kept so we can derive top titles. */
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

// Momentum = 24h activity / (7d activity / 7). Ratio > 1 means the sub is
// running hotter than its 7d average. We expose it on every seed so the
// canvas can color and label it.
function momentumRatio(activity24h: number, avg7d: number): number {
  if (avg7d <= 0) return activity24h > 0 ? 2 : 1; // new sub spiking from 0
  return activity24h / avg7d;
}

interface MomentumStyle {
  fill: string;          // gradient inner stop hex
  gradientEnd: string;   // gradient outer stop hex
  glow: string;          // outer glow rgba
  textColor: string;     // label color
}

function momentumColor(ratio: number, breakoutCount: number): MomentumStyle {
  // BREAKOUT supersedes (≥3 breakouts OR ratio > 5)
  if (breakoutCount >= 3 || ratio > 5) {
    return {
      fill: "#ff6600",
      gradientEnd: "#ff4500",
      glow: "rgba(255, 102, 0, 0.25)",
      textColor: "#ffffff",
    };
  }
  // HEATING (1.3 - 5)
  if (ratio > 1.3) {
    return {
      fill: "#10B981",
      gradientEnd: "#22c55e",
      glow: "rgba(16, 185, 129, 0.20)",
      textColor: "#ffffff",
    };
  }
  // STABLE (0.7 - 1.3)
  if (ratio >= 0.7) {
    return {
      fill: "#2D5A3D",
      gradientEnd: "#22c55e",
      glow: "rgba(45, 90, 61, 0.15)",
      textColor: "#ffffff",
    };
  }
  // COOLING (< 0.7)
  return {
    fill: "#4A5568",
    gradientEnd: "#6B7B8D",
    glow: "rgba(74, 85, 104, 0.20)",
    textColor: "#ffffff",
  };
}

function ringFor(breakoutCount: number): { stroke: string; strokeWidth: number } {
  if (breakoutCount >= 3) return { stroke: BREAKOUT_RING, strokeWidth: 2 };
  if (breakoutCount >= 1) return { stroke: BREAKOUT_RING, strokeWidth: 1.5 };
  return { stroke: NO_BREAKOUT_RING, strokeWidth: 1 };
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

function sparkline7d(
  windowPosts: RedditAllPost[],
  nowMs: number,
): number[] {
  // Bin by day index = floor(createdUtc / 86400). Newest bin = today.
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

interface SeedsBuildContext {
  /** Total 24h activity per sub — numerator for momentum. Pre-computed once
   * on the parent and passed down so packForScale stays O(subs). */
  total24hBySub: Map<string, number>;
  nowMs: number;
}

function buildAggregatesForWindow(
  posts: RedditAllPost[],
  window: SubredditWindowKey,
  nowMs: number,
): SubAggregate[] {
  const cutoff = nowMs - (window === "24h" ? 24 : 168) * HOUR_MS;
  const windowed = posts.filter((p) => p.createdUtc * 1000 >= cutoff);
  if (windowed.length === 0) return [];
  return aggregateBySubreddit(windowed).filter((a) => a.activityScore > 0);
}

function packForScale(
  aggregates: SubAggregate[],
  scale: "log" | "linear",
  window: SubredditWindowKey,
  ctx: SeedsBuildContext,
  /** activityScore7d per sub, for momentum. */
  total7dBySub: Map<string, number>,
): SubredditSeed[] {
  if (aggregates.length === 0) return [];

  // Stable id per (window, scale, index in aggregate order). The packer
  // returns the same id we pass in.
  const idOf = (i: number) => `sub-${window}-${scale}-${i}`;

  const packed = packBubbles(
    aggregates.map((agg, i) => ({
      id: idOf(i),
      // Log scale compresses dynamic range so r/ChatGPT-style outliers
      // don't dwarf the rest of the map. Floor at 10 to keep log10 ≥ 1.
      value:
        scale === "log"
          ? Math.log10(Math.max(10, agg.activityScore))
          : Math.max(1, agg.activityScore),
    })),
    {
      width: MAP_WIDTH,
      height: MAP_HEIGHT,
      minRadius: MIN_RADIUS,
      maxRadius: MAX_RADIUS,
      padding: 2,
      fillRatio: 0.90,
      edgeMargin: 6,
    },
  );

  const byId = new Map(aggregates.map((a, i) => [idOf(i), a]));

  return packed
    .map((p) => {
      const agg = byId.get(p.id);
      if (!agg) return null;

      const total7d = total7dBySub.get(agg.subreddit) ?? 0;
      // Momentum = 24h activity / (7d activity / 7), regardless of which
      // size-window the user picked. "Heating up right now" is always a
      // 24h-vs-7d-avg comparison.
      const avg7d = total7d / 7;
      const total24h = ctx.total24hBySub.get(agg.subreddit) ?? 0;
      const ratio24 = momentumRatio(total24h, avg7d);

      const style = momentumColor(ratio24, agg.breakoutCount);
      const ring = ringFor(agg.breakoutCount);

      const seed: SubredditSeed = {
        id: p.id,
        cx: p.cx,
        cy: p.cy,
        r: p.r,
        subreddit: agg.subreddit,
        activityScore: agg.activityScore,
        breakoutCount: agg.breakoutCount,
        aboveAvgCount: agg.aboveAvgCount,
        totalPosts: agg.totalPosts,
        momentumRatio: ratio24,
        fill: style.fill,
        gradientEnd: style.gradientEnd,
        glow: style.glow,
        stroke: ring.stroke,
        strokeWidth: ring.strokeWidth,
        textColor: style.textColor,
        topPostTitles: topPostTitles(agg.windowPosts),
        sparkline7d: sparkline7d(agg.windowPosts, ctx.nowMs),
      };
      return seed;
    })
    .filter((s): s is SubredditSeed => s !== null);
}

function buildWindow(
  posts: RedditAllPost[],
  window: SubredditWindowKey,
  limit: number,
  ctx: SeedsBuildContext,
  total7dBySub: Map<string, number>,
): { log: SubredditSeed[]; linear: SubredditSeed[] } {
  // Aggregate once, then pack twice (log + linear). Top-N selection uses
  // raw activity so both scales surface the same set of subs.
  const aggregates = buildAggregatesForWindow(posts, window, ctx.nowMs)
    .sort((a, b) => b.activityScore - a.activityScore)
    .slice(0, limit);

  return {
    log: packForScale(aggregates, "log", window, ctx, total7dBySub),
    linear: packForScale(aggregates, "linear", window, ctx, total7dBySub),
  };
}

export function SubredditMindshareMap({
  posts,
  limit = 60,
}: SubredditMindshareMapProps) {
  const now = Date.now();

  // Pre-compute per-sub totals for both windows in a single pass. The
  // client never sees these — we just use them to derive momentum and to
  // gate which subs make the cut.
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

  const ctx: SeedsBuildContext = { total24hBySub, nowMs: now };

  const windows: SubredditWindowSeedSet = {
    "24h": buildWindow(posts, "24h", limit, ctx, total7dBySub),
    "7d": buildWindow(posts, "7d", limit, ctx, total7dBySub),
  };

  const hasAny =
    windows["24h"].log.length > 0 || windows["7d"].log.length > 0;
  if (!hasAny) return null;

  const headlineCount =
    windows["24h"].log.length || windows["7d"].log.length;

  return (
    <div className="space-y-2">
      <div className="px-1 text-[11px] font-mono uppercase tracking-wider text-text-tertiary">
        {`// ${headlineCount} subreddits · color = momentum vs 7d avg · orange ring = breakout intensity`}
      </div>
      <SubredditMindshareCanvas
        windows={windows}
        width={MAP_WIDTH}
        height={MAP_HEIGHT}
      />
    </div>
  );
}
