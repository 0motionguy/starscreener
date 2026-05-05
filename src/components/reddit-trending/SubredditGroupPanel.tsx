"use client";

// Lazy-loaded panel for the by-subreddit tab.
// Split out of AllTrendingTabs (AGN-455) so the framer-motion `motion.li`
// compact row component only ships when this tab is actually selected.

import { motion, useReducedMotion } from "framer-motion";
import { useMemo } from "react";
import { ChevronUp, MessageSquare } from "lucide-react";
import { BaselinePill } from "@/components/reddit/BaselinePill";
import { VelocityIndicator } from "@/components/reddit/VelocityIndicator";
import { ContentTagIcons } from "@/components/reddit/ContentTagIcons";
import type { RedditAllPost } from "@/lib/reddit-all";
import { redditPostHref } from "@/lib/reddit";
import { cn, formatNumber } from "@/lib/utils";
import {
  getPostTier,
  tierClassesCompact,
  subredditColorHash,
  formatPostAge,
  type VelocityStats,
} from "./trending-helpers";

function postHref(p: RedditAllPost): string {
  return redditPostHref(p.permalink, p.url);
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
  const reduceMotion = useReducedMotion();
  const tier = getPostTier(p.baselineRatio);
  const tc = tierClassesCompact(tier);
  const showVelocity = (p.trendingScore ?? 0) >= velocityP90;
  const velocityNum =
    typeof p.velocity === "number" && p.velocity > 0 ? Math.round(p.velocity) : 0;
  const velocityIsHot =
    velocityNum > 0 && (p.velocity ?? 0) > velocityStats.p50 && velocityStats.p50 > 0;

  return (
    <motion.li
      whileHover={reduceMotion ? undefined : { y: -1, scale: 1.003 }}
      transition={
        reduceMotion ? { duration: 0 } : { duration: 0.12, ease: "easeOut" }
      }
      className={cn(
        "group relative block border border-border-primary rounded-xl bg-bg-card shadow-card p-3",
        "transition-[border-color,box-shadow,background-color] duration-200",
        "hover:border-brand/40 hover:shadow-[0_6px_18px_-8px_rgba(245,110,15,0.22)]",
        tc.row,
        tc.contentOpacity,
      )}
    >
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

      <div className="mt-2.5 flex items-center gap-2 flex-wrap">
        <ContentTagIcons tags={p.content_tags} max={4} size={12} />
        <span className="ml-auto inline-flex items-center gap-2 px-2 py-1 rounded-md bg-bg-secondary/50 border border-border-primary/40 shrink-0">
          <span className="inline-flex items-center gap-0.5 text-xs font-bold font-mono tabular-nums text-text-primary leading-none">
            <ChevronUp
              size={12}
              className={velocityIsHot ? "text-[var(--v4-money)]" : "text-text-muted"}
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

interface SubredditGroupPanelProps {
  posts: RedditAllPost[];
  velocityP90: number;
  velocityStats: VelocityStats;
}

export default function SubredditGroupPanel({
  posts,
  velocityP90,
  velocityStats,
}: SubredditGroupPanelProps) {
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
              Σ trending {Math.round(g.trendingScoreSum).toLocaleString("en-US")}
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
