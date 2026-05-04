"use client";

// V4 — Tabbed mentions feed. All · Reddit · HackerNews · Bluesky · dev.to ·
// ProductHunt · Twitter.
//
// Client component for the tab interaction; data is fully prefetched
// on the server and passed in as a normalized list so the bundle never
// reaches into per-source mention JSON.
//
// Each row uses the V4 <MentionRow> primitive — source pip + author + ts +
// body + stats + open button. Tabs use V4 tokens.

import { useMemo, useState } from "react";
import { getRelativeTime } from "@/lib/utils";
import type { FreshnessSnapshot } from "@/lib/source-health";
import { FreshnessChips } from "./FreshnessChips";
import { MentionsLoadMore } from "./MentionsLoadMore";
import { MentionRow as V4MentionRow } from "@/components/repo-detail/MentionRow";
import { SourcePip, type SourceKey } from "@/components/ui/SourcePip";
import {
  MENTION_ALL_DESCRIPTION,
  MENTION_SOURCE_DESCRIPTIONS,
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

// MentionSource → V4 SourceKey. ph has no V4 equivalent; we use the
// openai pip color as a neutral cyan-ish placeholder and override the
// code text so the badge still reads "PH".
function toV4Source(s: MentionSource): { src: SourceKey; code?: string } {
  switch (s) {
    case "hn":
      return { src: "hn" };
    case "reddit":
      return { src: "reddit" };
    case "bluesky":
      return { src: "bsky" };
    case "devto":
      return { src: "dev" };
    case "twitter":
      return { src: "x" };
    case "ph":
      return { src: "openai", code: "PH" };
    default:
      return { src: "gh" };
  }
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
      lobsters: 0,
      npm: 0,
      huggingface: 0,
      arxiv: 0,
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
    <section aria-label="All mentions">
      {/* Freshness chips */}
      {freshness ? (
        <div style={{ marginBottom: 12 }}>
          <FreshnessChips sources={freshness.sources} />
        </div>
      ) : null}

      {/* V4 tab bar — sharp 2px corners, hairline borders, mono caps */}
      <div
        style={{
          display: "flex",
          gap: 0,
          overflowX: "auto",
          border: "1px solid var(--v4-line-200)",
          borderRadius: 2,
          background: "var(--v4-bg-025)",
        }}
        className="scrollbar-hide"
      >
        {MENTION_TABS.map((key, i) => {
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
              style={{
                fontFamily: "var(--font-geist-mono), monospace",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                whiteSpace: "nowrap",
                minHeight: 36,
                padding: "0 12px",
                fontSize: 10,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                background: active ? "var(--v4-acc-soft)" : "transparent",
                color: active
                  ? "var(--v4-acc)"
                  : disabled
                    ? "var(--v4-ink-500)"
                    : "var(--v4-ink-300)",
                borderRight:
                  i < MENTION_TABS.length - 1
                    ? "1px solid var(--v4-line-200)"
                    : "none",
                cursor: disabled ? "not-allowed" : "pointer",
                opacity: disabled ? 0.5 : 1,
                transition: "background-color 120ms, color 120ms",
              }}
            >
              {MENTION_TAB_LABELS[key]}
              <span
                className="tabular-nums"
                style={{
                  color: active ? "var(--v4-acc)" : "var(--v4-ink-400)",
                }}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* List */}
      {visible.length === 0 ? (
        <div
          style={{
            marginTop: 12,
            padding: 24,
            border: "1px dashed var(--v4-line-200)",
            borderRadius: 2,
            background: "var(--v4-bg-025)",
          }}
        >
          <p style={{ fontSize: 13, color: "var(--v4-ink-200)", margin: 0 }}>
            No mentions on this channel in the last 7 days.
          </p>
          <p
            style={{
              fontFamily: "var(--font-geist-mono), monospace",
              marginTop: 6,
              fontSize: 10,
              color: "var(--v4-ink-400)",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            {"// QUIET HERE DOESN'T MEAN THE REPO IS DEAD — CHECK OTHER TABS"}
          </p>
        </div>
      ) : (
        <div
          style={{
            marginTop: 12,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {visible.map((m) => (
            <MentionRowAdapter key={m.id} item={m} />
          ))}
        </div>
      )}

      {/* Paginated tail */}
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
 * Adapts a MentionItem to the V4 <MentionRow> shape. Exported so the
 * client paginator (`MentionsLoadMore`) renders newly-fetched items with
 * pixel-perfect parity.
 */
export function MentionRow({ item: m }: { item: MentionItem }) {
  return <MentionRowAdapter item={m} />;
}

function MentionRowAdapter({ item: m }: { item: MentionItem }) {
  const { src, code } = toV4Source(m.source);
  const stats = [
    {
      label: (
        <>
          <b style={{ color: "var(--v4-ink-100)" }}>
            {m.score.toLocaleString("en-US")}
          </b>{" "}
          {m.scoreLabel ?? "pts"}
        </>
      ),
    },
    ...(m.secondary
      ? [
          {
            label: (
              <>
                <b style={{ color: "var(--v4-ink-100)" }}>
                  {m.secondary.value.toLocaleString("en-US")}
                </b>{" "}
                {m.secondary.label}
              </>
            ),
          },
        ]
      : []),
    ...(m.matchReason
      ? [{ label: <>matched: {m.matchReason}</> }]
      : []),
  ];

  return (
    <V4MentionRow
      source={src}
      avatar={
        code ? (
          <SourcePip src={src} size="lg" code={code} />
        ) : (
          <SourcePip src={src} size="lg" />
        )
      }
      author={m.author}
      sourceLabel={MENTION_SOURCE_SHORT_LABEL[m.source]}
      ts={getRelativeTime(m.createdAt)}
      body={m.title}
      stats={stats}
      href={m.url}
    />
  );
}

export default RecentMentionsFeed;
