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
import {
  MENTION_SOURCE_BADGE_TEXT,
  MENTION_SOURCE_COLORS,
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
}

export function RecentMentionsFeed({ mentions }: RecentMentionsFeedProps) {
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

      {/* Tabs — horizontal scroll on narrow viewports so they don't wrap
          mid-label. Touch targets ≥ 36px high which keeps the row reachable
          on mobile without dwarfing the surrounding content. */}
      <div className="flex gap-1 overflow-x-auto bg-bg-secondary rounded-badge p-0.5 -mx-1 px-1 scrollbar-hide">
        {MENTION_TABS.map((key) => {
          const active = key === tab;
          const count =
            key === "all" ? totalCount : counts[key as MentionSource];
          const disabled = count === 0;
          return (
            <button
              key={key}
              type="button"
              onClick={() => !disabled && setTab(key)}
              disabled={disabled}
              aria-pressed={active}
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
            <li key={m.id}>
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
          ))}
        </ul>
      )}
    </section>
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
