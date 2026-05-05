import Link from "next/link";
import { ChevronUp, MessageSquare } from "lucide-react";

import { BaselinePill, type BaselinePillSize } from "@/components/reddit/BaselinePill";
import { VelocityIndicator } from "@/components/reddit/VelocityIndicator";
import { ContentTagIcons } from "@/components/reddit/ContentTagIcons";
import { LetterAvatar } from "@/components/shared/LetterAvatar";
import type { RedditAllPost } from "@/lib/reddit-all";
import { redditPostHref, repoFullNameToHref } from "@/lib/reddit";
import { cn, formatNumber } from "@/lib/utils";

export interface VelocityStats {
  p50: number;
  p90: number;
}

type PostTier = "hyperviral" | "breakout" | "above-avg" | "baseline";

interface TierClasses {
  row: string;
  title: string;
  baselinePillSize: BaselinePillSize;
  contentOpacity: string;
}

export function formatPostAge(hours: number | undefined): string {
  if (hours == null) return "-";
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 24) return `${Math.round(hours)}h`;
  const days = hours / 24;
  return `${Math.round(days)}d`;
}

function getPostTier(ratio: number | null | undefined): PostTier {
  if (ratio == null) return "baseline";
  if (ratio >= 100) return "hyperviral";
  if (ratio >= 10) return "breakout";
  if (ratio >= 1) return "above-avg";
  return "baseline";
}

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

export function subredditColorHash(seed: string): string {
  let sum = 0;
  for (let i = 0; i < seed.length; i++) sum += seed.charCodeAt(i);
  const hue = (Math.round(sum / 30) * 30) % 360;
  return `hsl(${hue}, 60%, 65%)`;
}

export function computeTrendingP90(posts: RedditAllPost[]): number {
  if (posts.length === 0) return Number.POSITIVE_INFINITY;
  const scores = posts
    .map((p) => p.trendingScore ?? 0)
    .sort((a, b) => a - b);
  const idx = Math.floor(scores.length * 0.9);
  return scores[Math.min(idx, scores.length - 1)] ?? 0;
}

export function computeVelocityStats(posts: RedditAllPost[]): VelocityStats {
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

function postHref(p: RedditAllPost): string {
  return redditPostHref(p.permalink, p.url);
}

interface PostRowProps {
  post: RedditAllPost;
  velocityP90: number;
  velocityStats: VelocityStats;
  pathname: string;
  searchParams: URLSearchParams;
}

export function PostRow({ post: p, velocityP90, velocityStats, pathname, searchParams }: PostRowProps) {
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

  const subHref = (() => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("sub", p.subreddit);
    return `${pathname}?${params.toString()}`;
  })();

  return (
    <li
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
        <Link
          href={subHref}
          scroll={false}
          className="text-sm font-mono font-semibold hover:underline truncate max-w-[200px]"
          style={{ color: subColor }}
          title={`Filter feed to r/${p.subreddit}`}
        >
          r/{p.subreddit}
        </Link>
        <a
          href={`https://reddit.com/r/${p.subreddit}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-text-muted hover:text-accent-green text-xs leading-none -ml-1"
          aria-label={`Open r/${p.subreddit} on Reddit`}
          title="Open on reddit.com"
        >
          ?
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
              <span className="mr-1 opacity-70">?</span>
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
    </li>
  );
}

export function SubredditGroupView({
  posts,
  velocityP90,
  velocityStats,
}: {
  posts: RedditAllPost[];
  velocityP90: number;
  velocityStats: VelocityStats;
}) {
  const grouped = (() => {
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
  })();

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
              S trending {Math.round(g.trendingScoreSum).toLocaleString("en-US")}
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
    <li
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
    </li>
  );
}



