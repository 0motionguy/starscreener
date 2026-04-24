"use client";

// Tabbed mentions feed — All · Reddit · HackerNews · Bluesky · dev.to · ProductHunt.
//
// Client component for the tab interaction; data is fully prefetched
// on the server and passed in as a normalized list so the bundle never
// reaches into per-source mention JSON.
//
// Each row: source badge, title, author, score/likes, age, click→opens
// the source URL in a new tab. Source-canonical color on the badge so
// users can scan by channel.

import { useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";
import { getRelativeTime } from "@/lib/utils";
import type { FreshnessSnapshot } from "@/lib/source-health";
import { FreshnessChips } from "./FreshnessChips";
import { MentionsLoadMore } from "./MentionsLoadMore";
import {
  MENTION_ALL_DESCRIPTION,
  MENTION_SOURCE_BADGE_TEXT,
  MENTION_SOURCE_COLORS,
  MENTION_SOURCE_DESCRIPTIONS,
  MENTION_SOURCE_LABELS,
  MENTION_SOURCE_SHORT_LABEL,
  MENTION_TAB_LABELS,
  MENTION_TABS,
  type MentionItem,
  type MentionSource,
  type MentionTab,
} from "./MentionMeta";

interface RecentMentionsFeedProps {
  mentions: MentionItem[];
  /**
   * Optional per-source scanner freshness. When provided, a chip row
   * renders above the tab bar so users can see whether each channel was
   * scanned minutes or days ago. Omitting it hides the row entirely so
   * existing callers continue to render without change.
   */
  freshness?: FreshnessSnapshot;
  /**
   * When provided, the feed renders a `<MentionsLoadMore>` button under
   * the list so users can page past the SSR-capped first slice. Pass the
   * canonical `owner/name` string — the client component builds the API
   * URL from it. Omitting it keeps the existing (non-paginated) behaviour
   * for any caller that hasn't yet migrated to pass a cursor.
   */
  repoFullName?: string;
  /**
   * Opaque cursor returned by the first page fetch. `null` means "the
   * server-rendered slice exhausted the mention set, no more pages
   * exist" — in which case the load-more button simply doesn't render.
   * Undefined (along with `repoFullName`) means the paginated path isn't
   * wired up for this caller.
   */
  initialCursor?: string | null;
}

export function RecentMentionsFeed({
  mentions,
  freshness,
  repoFullName,
  initialCursor,
}: RecentMentionsFeedProps) {
  const [tab, setTab] = useState<MentionTab>("all");

  // Build per-source counts + visible list memoized so tab clicks don't
  // walk the full mention array each time.
  const counts = useMemo(() => {
    const c: Record<MentionSource, number> = {
      reddit: 0,
      hn: 0,
      bluesky: 0,
      devto: 0,
      ph: 0,
      twitter: 0,
    };
    for (const m of mentions) c[m.source] += 1;
    return c;
  }, [mentions]);

  const visible = useMemo(() => {
    const filtered =
      tab === "all" ? mentions : mentions.filter((m) => m.source === tab);
    // Newest first across the merged + per-source views.
    return filtered.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }, [mentions, tab]);

  const totalCount = mentions.length;

  return (
    <section
      aria-label="All mentions"
      className="rounded-card border border-border-primary bg-bg-card p-4 shadow-card"
    >
      <header className="flex items-baseline justify-between gap-3 mb-3 flex-wrap">
        <h2 className="font-mono text-[11px] uppercase tracking-wider text-text-secondary">
          All mentions
          <span className="ml-2 text-text-tertiary">{"// evidence feed"}</span>
        </h2>
        <span className="font-mono text-[11px] text-text-tertiary tabular-nums">
          {visible.length} shown / {totalCount} total
        </span>
      </header>

      {/* Freshness chips — per-source "last scan" strip. Renders only when
          a freshness snapshot is passed in, so existing callers stay
          unaffected. Placed above the tab bar so the chips read as a
          legend for the tabs directly below. */}
      {freshness ? (
        <div className="mb-2">
          <FreshnessChips sources={freshness.sources} />
        </div>
      ) : null}

      {/* Tabs — horizontal scroll on narrow viewports so they don't wrap
          mid-label. Touch targets ≥ 36px high which keeps the row reachable
          on mobile without dwarfing the surrounding content. */}
      <div className="flex gap-1 overflow-x-auto bg-bg-secondary rounded-badge p-0.5 -mx-1 px-1 scrollbar-hide">
        {MENTION_TABS.map((key) => {
          const active = key === tab;
          const count =
            key === "all" ? totalCount : counts[key as MentionSource];
          const disabled = count === 0;
          const tabTitle =
            key === "all"
              ? MENTION_ALL_DESCRIPTION
              : MENTION_SOURCE_DESCRIPTIONS[key as MentionSource];
          return (
            <button
              key={key}
              type="button"
              onClick={() => !disabled && setTab(key)}
              disabled={disabled}
              aria-pressed={active}
              title={tabTitle}
              className={`min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-badge text-[11px] font-mono uppercase tracking-wider whitespace-nowrap transition-colors ${
                active
                  ? "bg-bg-card text-text-primary shadow-card"
                  : disabled
                    ? "text-text-tertiary/50 cursor-not-allowed"
                    : "text-text-tertiary hover:text-text-secondary"
              }`}
            >
              {MENTION_TAB_LABELS[key]}
              <span className="tabular-nums opacity-60">{count}</span>
            </button>
          );
        })}
      </div>

      {/* List */}
      {visible.length === 0 ? (
        <div className="mt-4 border border-dashed border-border-primary rounded-md p-6 bg-bg-secondary/40">
          <p className="text-sm text-text-secondary">
            No mentions on this channel in the last 7 days.
          </p>
          <p className="mt-1 text-[11px] text-text-tertiary">
            {"// quiet here doesn't mean the repo is dead — check the other tabs"}
          </p>
        </div>
      ) : (
        <ul className="mt-3 divide-y divide-border-primary/40">
          {visible.map((m) => (
            <MentionRow key={m.id} item={m} />
          ))}
        </ul>
      )}

      {/* Paginated tail — the button vanishes when the server says there
          are no more pages (null cursor), and resets on every tab switch
          via the `key` so per-source paging starts from page 1. Only
          renders when the parent opted in by passing both props. */}
      {repoFullName && visible.length > 0 ? (
        <MentionsLoadMore
          key={tab}
          repoFullName={repoFullName}
          source={tab}
          initialCursor={tab === "all" ? (initialCursor ?? null) : undefined}
        />
      ) : null}
    </section>
  );
}

/**
 * A single row in the mentions list. Exported so the client paginator
 * (`MentionsLoadMore`) can render newly-fetched items with pixel-perfect
 * parity — the alternative of duplicating this markup drifts over time.
 *
 * Shape: source badge · title · metadata strip. The metadata strip
 * collapses to a column on narrow viewports because Tailwind's flex-wrap
 * already does the right thing here; nothing source-specific is hidden.
 */
export function MentionRow({ item: m }: { item: MentionItem }) {
  return (
    <li>
      <a
        href={m.url}
        target="_blank"
        rel="noopener noreferrer"
        className="group flex items-start gap-3 py-3 min-h-[44px] hover:bg-bg-card-hover/60 -mx-2 px-2 rounded-md transition-colors"
      >
        <SourceBadge source={m.source} />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-text-primary leading-snug line-clamp-2 group-hover:text-brand transition-colors">
            {m.title}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono text-[11px] text-text-tertiary">
            <span className="truncate max-w-[140px] sm:max-w-[220px]">
              {m.author}
            </span>
            <span className="tabular-nums">
              <span className="text-text-secondary">
                {m.score.toLocaleString()}
              </span>{" "}
              {m.scoreLabel ?? "pts"}
            </span>
            {m.secondary && (
              <span className="tabular-nums">
                <span className="text-text-secondary">
                  {m.secondary.value.toLocaleString()}
                </span>{" "}
                {m.secondary.label}
              </span>
            )}
            <span>{getRelativeTime(m.createdAt)}</span>
            {m.matchReason && (
              <span className="hidden md:inline text-text-tertiary/80">
                matched: {m.matchReason}
              </span>
            )}
            <span className="ml-auto inline-flex items-center gap-1 text-text-tertiary uppercase tracking-wider">
              {MENTION_SOURCE_SHORT_LABEL[m.source]}
              <ExternalLink size={10} aria-hidden />
            </span>
          </div>
        </div>
      </a>
    </li>
  );
}

function SourceBadge({ source }: { source: MentionSource }) {
  const color = MENTION_SOURCE_COLORS[source];
  return (
    <span
      className="mt-0.5 shrink-0 size-6 rounded-md inline-flex items-center justify-center font-bold text-white text-[10px]"
      style={{ backgroundColor: color }}
      aria-label={MENTION_SOURCE_LABELS[source]}
      title={MENTION_SOURCE_LABELS[source]}
    >
      {MENTION_SOURCE_BADGE_TEXT[source]}
    </span>
  );
}

export default RecentMentionsFeed;
