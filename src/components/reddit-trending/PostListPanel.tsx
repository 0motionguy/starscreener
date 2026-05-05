"use client";

// Lazy-loaded panel for the list-style tabs (trending-now / hot-7d / hot-30d).
// Split out of AllTrendingTabs (AGN-455) so the framer-motion `motion.li`
// row component only ships when one of these tabs is actually selected.

import { motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { ChevronUp, MessageSquare } from "lucide-react";
import { BaselinePill } from "@/components/reddit/BaselinePill";
import { VelocityIndicator } from "@/components/reddit/VelocityIndicator";
import { ContentTagIcons } from "@/components/reddit/ContentTagIcons";
import { LetterAvatar } from "@/components/shared/LetterAvatar";
import type { RedditAllPost } from "@/lib/reddit-all";
import { redditPostHref, repoFullNameToHref } from "@/lib/reddit";
import { cn, formatNumber } from "@/lib/utils";
import {
  getPostTier,
  tierClasses,
  subredditColorHash,
  formatPostAge,
  type VelocityStats,
} from "./trending-helpers";

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
  const reduceMotion = useReducedMotion();
  const primaryRepo =
    p.linkedRepos && p.linkedRepos.length > 0
      ? p.linkedRepos[0].fullName
      : p.repoFullName ?? null;
  const velocityNum =
    typeof p.velocity === "number" && p.velocity > 0 ? Math.round(p.velocity) : 0;
  const velocityHasData = velocityNum > 0;
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
      whileHover={reduceMotion ? undefined : { y: -2, scale: 1.005 }}
      transition={
        reduceMotion ? { duration: 0 } : { duration: 0.15, ease: "easeOut" }
      }
      className={cn(
        "group relative block border border-border-primary rounded-xl bg-bg-card shadow-card p-4 sm:p-5",
        "transition-[border-color,box-shadow,background-color] duration-200",
        "hover:border-brand/40 hover:shadow-[0_8px_24px_-8px_rgba(245,110,15,0.25)]",
        tc.row,
        tc.contentOpacity,
      )}
    >
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
          "mt-3 block text-text-primary leading-tight line-clamp-2 transition-colors",
          "group-hover:text-brand",
          tc.title,
        )}
      >
        {p.title}
      </a>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
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

        <div className="sm:ml-auto inline-flex items-center gap-3 px-3 py-1.5 rounded-lg bg-bg-secondary/50 border border-border-primary/40 shrink-0 self-start sm:self-auto">
          <span className="inline-flex items-center gap-1 text-sm font-bold font-mono tabular-nums text-text-primary leading-none">
            <ChevronUp
              size={14}
              className={velocityIsHot ? "text-[var(--v4-money)]" : "text-text-muted"}
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

interface PostListPanelProps {
  posts: RedditAllPost[];
  velocityP90: number;
  velocityStats: VelocityStats;
  onSubClick: (sub: string) => void;
}

export default function PostListPanel({
  posts,
  velocityP90,
  velocityStats,
  onSubClick,
}: PostListPanelProps) {
  return (
    <ul className="space-y-2">
      {posts.map((p) => (
        <PostRow
          key={p.id}
          post={p}
          velocityP90={velocityP90}
          velocityStats={velocityStats}
          onSubClick={onSubClick}
        />
      ))}
    </ul>
  );
}
