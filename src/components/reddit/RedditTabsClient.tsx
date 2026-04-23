"use client";

// Client wrapper for the /reddit tabbed feed. Reads the active tab from
// the URL (`?tab=trending-now|hot-7d|all-mentions`) so sharable links
// carry viewer intent. Falls back to the default "trending-now" when the
// param is absent or unknown.

import Link from "next/link";
import { useMemo } from "react";
import { useSearchParams, usePathname } from "next/navigation";
import {
  REDDIT_TAB_IDS,
  REDDIT_TAB_LABELS,
  getPostsByTab,
  redditPostHref,
  repoFullNameToHref,
  type RedditPost,
  type RedditTab,
} from "@/lib/reddit";
import { BaselinePill } from "./BaselinePill";
import { VelocityIndicator } from "./VelocityIndicator";
import {
  ContentTagChips,
  CONTENT_CHIPS,
  applyChipFilter,
  parseActiveChips,
} from "./ContentTagChips";
import { cn } from "@/lib/utils";

function formatPostAge(hours: number | undefined): string {
  if (hours == null) return "—";
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 24) return `${Math.round(hours)}h`;
  const days = hours / 24;
  if (days < 7) return `${Math.round(days)}d`;
  return `${Math.round(days)}d`;
}

function parseTab(raw: string | null): RedditTab {
  if (raw && (REDDIT_TAB_IDS as string[]).includes(raw)) {
    return raw as RedditTab;
  }
  return "trending-now";
}

export function RedditTabsClient({ posts }: { posts: RedditPost[] }) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const activeTab = parseTab(searchParams.get("tab"));
  const activeChips = parseActiveChips(searchParams.get("tags"));
  const showAll = searchParams.get("showAll") === "1";

  const chipCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const chip of CONTENT_CHIPS) {
      counts[chip.key] = posts.filter((p) =>
        Array.isArray(p.content_tags) && p.content_tags.includes(chip.contentTag),
      ).length;
    }
    return counts;
  }, [posts]);

  const hiddenCount = useMemo(
    () => posts.filter((p) => (p.value_score ?? 0) < 1).length,
    [posts],
  );

  const chipFiltered = useMemo(
    () => applyChipFilter(posts, activeChips, showAll),
    [posts, activeChips, showAll],
  );
  const filtered = getPostsByTab(chipFiltered, activeTab);

  return (
    <section>
      {/* Content-type chips */}
      <ContentTagChips counts={chipCounts} hiddenCount={hiddenCount} />

      {/* Tabs strip */}
      <div
        role="tablist"
        className="flex gap-1 mb-4 border-b border-border-primary"
      >
        {REDDIT_TAB_IDS.map((tab) => {
          const active = tab === activeTab;
          return (
            <Link
              key={tab}
              role="tab"
              aria-selected={active}
              href={`${pathname}?tab=${tab}`}
              scroll={false}
              className={cn(
                "px-3 py-2 text-xs font-mono uppercase tracking-wider transition-colors",
                "border-b-2 -mb-[2px]",
                active
                  ? "border-brand text-brand"
                  : "border-transparent text-text-tertiary hover:text-text-primary",
              )}
            >
              {REDDIT_TAB_LABELS[tab]}
            </Link>
          );
        })}
      </div>

      {/* Feed */}
      {filtered.length === 0 ? (
        <div className="border border-dashed border-border-primary rounded-md p-6 bg-bg-secondary/40 text-sm text-text-tertiary">
          No posts in this window. Try another tab or re-run
          <code className="mx-1 px-1 text-text-secondary">npm run scrape:reddit</code>.
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((p) => (
            <li
              key={`${p.id}-${p.repoFullName ?? "nomatch"}`}
              className="border border-border-primary rounded-md px-4 py-3 bg-bg-secondary hover:border-brand transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-text-tertiary mb-1.5">
                    <span className="text-brand font-semibold">
                      r/{p.subreddit}
                    </span>
                    <span>·</span>
                    <span>u/{p.author}</span>
                    <span>·</span>
                    <span>{formatPostAge(p.ageHours)}</span>
                    <VelocityIndicator trendingScore={p.trendingScore} />
                    <BaselinePill
                      sub={p.subreddit}
                      ratio={p.baselineRatio}
                      tier={p.baselineTier}
                      confidence={p.baselineConfidence}
                    />
                    {p.repoFullName ? (
                      <>
                        <span>·</span>
                        <Link
                          href={repoFullNameToHref(p.repoFullName)}
                          className="text-accent-green hover:underline truncate"
                        >
                          {p.repoFullName}
                        </Link>
                      </>
                    ) : null}
                  </div>
                  <a
                    href={redditPostHref(p.permalink, p.url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-text-primary hover:text-brand line-clamp-2"
                  >
                    {p.title}
                  </a>
                </div>
                <div className="flex-shrink-0 flex flex-col items-end text-[11px] text-text-tertiary">
                  <span className="text-sm font-bold text-text-primary">
                    ▲ {p.score}
                  </span>
                  <span>{p.numComments} comments</span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
