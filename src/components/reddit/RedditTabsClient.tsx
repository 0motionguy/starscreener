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

  const REDDIT_ORANGE = "#ff4500";

  return (
    <section>
      {/* Content-type chips */}
      <ContentTagChips counts={chipCounts} hiddenCount={hiddenCount} />

      {/* Tabs strip */}
      <div
        role="tablist"
        className="mb-4 flex gap-1"
        style={{ borderBottom: "1px solid var(--v3-line-100)" }}
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
                "v2-mono -mb-[2px] px-3 py-2 text-[11px] uppercase tracking-[0.18em] transition-colors",
              )}
              style={{
                color: active ? "var(--v3-ink-100)" : "var(--v3-ink-400)",
                borderBottom: active
                  ? `2px solid ${REDDIT_ORANGE}`
                  : "2px solid transparent",
              }}
            >
              {REDDIT_TAB_LABELS[tab]}
            </Link>
          );
        })}
      </div>

      {/* Feed */}
      {filtered.length === 0 ? (
        <div
          className="p-6 text-sm"
          style={{
            background: "var(--v3-bg-025)",
            border: "1px dashed var(--v3-line-100)",
            borderRadius: 2,
            color: "var(--v3-ink-400)",
          }}
        >
          No posts in this window. Try another tab or re-run{" "}
          <code style={{ color: "var(--v3-ink-100)" }}>npm run scrape:reddit</code>.
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((p, i) => {
            const stagger = Math.min(i, 6) * 50;
            return (
              <li
                key={`${p.id}-${p.repoFullName ?? "nomatch"}`}
                className="v2-row group px-4 py-3"
                style={{
                  background: "var(--v3-bg-050)",
                  border: "1px solid var(--v3-line-200)",
                  borderRadius: 2,
                  animation: "slide-up 0.35s cubic-bezier(0.2, 0.8, 0.2, 1) both",
                  animationDelay: stagger > 0 ? `${stagger}ms` : undefined,
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div
                      className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]"
                      style={{ color: "var(--v3-ink-400)" }}
                    >
                      <span
                        className="font-semibold"
                        style={{ color: REDDIT_ORANGE }}
                      >
                        r/{p.subreddit}
                      </span>
                      <span aria-hidden style={{ color: "var(--v3-line-300)" }}>·</span>
                      <span>u/{p.author}</span>
                      <span aria-hidden style={{ color: "var(--v3-line-300)" }}>·</span>
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
                          <span aria-hidden style={{ color: "var(--v3-line-300)" }}>·</span>
                          <Link
                            href={repoFullNameToHref(p.repoFullName)}
                            className="truncate hover:underline"
                            style={{ color: "var(--v3-sig-green)" }}
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
                      className="line-clamp-2 text-sm font-medium transition-colors hover:text-[color:var(--v3-acc)]"
                      style={{ color: "var(--v3-ink-100)" }}
                    >
                      {p.title}
                    </a>
                  </div>
                  <div
                    className="flex flex-shrink-0 flex-col items-end text-[11px] tabular-nums"
                    style={{ color: "var(--v3-ink-400)" }}
                  >
                    <span
                      className="text-sm font-bold"
                      style={{ color: "var(--v3-ink-100)" }}
                    >
                      ▲ {p.score}
                    </span>
                    <span>{p.numComments} comments</span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
