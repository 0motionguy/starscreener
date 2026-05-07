"use client";

// // 03 MENTIONS — tabbed evidence feed.
//
// Restyled to match the redesign mockup:
//   - bordered chip-style tab strip with per-source counts
//   - 14d timeline strip above the tab bar
//   - rich rows: source pill + author/handle + source label + age,
//     body excerpt, footer meta (score · secondary · age · OPEN)
//
// Client component for the tab interaction; data is fully prefetched on
// the server and passed in as a normalized list so the bundle never
// reaches into per-source mention JSON.

import { useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";
import { getRelativeTime } from "@/lib/utils";
import type { FreshnessSnapshot } from "@/lib/source-health";
import { FreshnessChips } from "./FreshnessChips";
import { MentionsLoadMore } from "./MentionsLoadMore";
import { MentionTimelineStrip } from "./MentionTimelineStrip";
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
   * scanned minutes or days ago.
   */
  freshness?: FreshnessSnapshot;
  /**
   * When provided, the feed renders a `<MentionsLoadMore>` button under
   * the list so users can page past the SSR-capped first slice.
   */
  repoFullName?: string;
  /**
   * Opaque cursor returned by the first page fetch.
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
    return filtered.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }, [mentions, tab]);

  const totalCount = mentions.length;

  return (
    <section
      aria-label="All mentions"
      className="mentions-feed-block"
    >
      <MentionTimelineStrip mentions={mentions} windowDays={14} />

      {freshness ? (
        <div className="mentions-freshness">
          <FreshnessChips sources={freshness.sources} />
        </div>
      ) : null}

      <div className="mentions-tabs" role="tablist" aria-label="Mention source filter">
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
              role="tab"
              onClick={() => !disabled && setTab(key)}
              disabled={disabled}
              aria-selected={active}
              title={tabTitle}
              className={`mentions-tab ${active ? "on" : ""}`}
            >
              <span className="mentions-tab-label">{MENTION_TAB_LABELS[key]}</span>
              <span className="mentions-tab-count">{count}</span>
            </button>
          );
        })}
      </div>

      {visible.length === 0 ? (
        <div className="mentions-empty">
          <p>No mentions on this channel in the last 7 days.</p>
          <p className="mentions-empty-sub">
            {"// QUIET HERE DOESN'T MEAN THE REPO IS DEAD — CHECK OTHER TABS"}
          </p>
        </div>
      ) : (
        <ul className="mentions-list">
          {visible.map((m) => (
            <MentionRow key={m.id} item={m} />
          ))}
        </ul>
      )}

      {repoFullName && visible.length > 0 ? (
        <MentionsLoadMore
          key={tab}
          repoFullName={repoFullName}
          source={tab}
          initialCursor={tab === "all" ? (initialCursor ?? null) : undefined}
        />
      ) : null}

      <style>{`
        .mentions-feed-block {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .mentions-freshness {
          display: block;
        }
        .mentions-tabs {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
          padding: 4px;
          border: 1px solid var(--v3-line-100, rgba(255,255,255,0.08));
          border-radius: 3px;
          background: var(--v3-bg-050, rgba(255,255,255,0.025));
        }
        .mentions-tab {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 7px 12px;
          font-family: var(--font-geist-mono, monospace);
          font-size: 11px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          background: transparent;
          color: var(--v3-ink-300, rgba(255,255,255,0.7));
          border: 1px solid transparent;
          border-radius: 2px;
          cursor: pointer;
          transition: color 120ms, background 120ms, border-color 120ms;
        }
        .mentions-tab:hover:not(:disabled) {
          color: var(--v3-ink-100, #fff);
          border-color: var(--v3-line-200, rgba(255,255,255,0.16));
        }
        .mentions-tab.on {
          color: var(--v3-acc, #ffcb05);
          background: color-mix(in oklab, var(--v3-acc, #ffcb05) 14%, transparent);
          border-color: var(--v3-acc, #ffcb05);
        }
        .mentions-tab:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }
        .mentions-tab-count {
          font-size: 10px;
          color: var(--v3-ink-400);
          padding: 1px 6px;
          background: var(--v3-bg-100, rgba(255,255,255,0.05));
          border-radius: 1px;
        }
        .mentions-tab.on .mentions-tab-count {
          color: var(--v3-acc, #ffcb05);
        }
        .mentions-empty {
          padding: 24px;
          border: 1px dashed var(--v3-line-200);
          border-radius: 2px;
          background: var(--v3-bg-050);
          text-align: center;
        }
        .mentions-empty p {
          margin: 0;
          font-size: 13px;
          color: var(--v3-ink-200);
        }
        .mentions-empty-sub {
          margin-top: 4px !important;
          font-family: var(--font-geist-mono, monospace);
          font-size: 10px;
          color: var(--v3-ink-400) !important;
          letter-spacing: 0.08em;
        }
        .mentions-list {
          list-style: none;
          margin: 0;
          padding: 0;
          border-top: 1px solid var(--v3-line-100, rgba(255,255,255,0.08));
        }
      `}</style>
    </section>
  );
}

/**
 * Single mention row. Mockup-aligned layout:
 *
 *   [PILL]  TITLE LINE                                             [→ OPEN]
 *           [colored source label]  Xd ago · MMM DD
 *           Body excerpt (line-clamped to 2 lines)
 *           ▲ score · 💬 secondary · by author · hostname
 */
export function MentionRow({ item: m }: { item: MentionItem }) {
  const color = MENTION_SOURCE_COLORS[m.source];
  const sourceLabel = MENTION_SOURCE_LABELS[m.source];
  const shortLabel = MENTION_SOURCE_SHORT_LABEL[m.source];
  const host = (() => {
    try {
      return new URL(m.url).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  })();
  return (
    <li
      className="mention-row"
      style={{ ["--m-color" as string]: color }}
    >
      <a className="mention-row-link" href={m.url} target="_blank" rel="noopener noreferrer">
        <span
          className="mention-pill"
          aria-label={sourceLabel}
          title={sourceLabel}
        >
          {MENTION_SOURCE_BADGE_TEXT[m.source]}
        </span>
        <div className="mention-body">
          <header className="mention-head">
            <span className="mention-title">{m.title}</span>
            <span
              className="mention-source-tag"
              style={{ color, borderColor: color }}
            >
              ▶ {sourceLabel}
            </span>
            <span className="mention-age">{getRelativeTime(m.createdAt)}</span>
          </header>
          <footer className="mention-meta">
            <span className="mention-stat">
              <b>{m.score.toLocaleString("en-US")}</b> {m.scoreLabel ?? "pts"}
            </span>
            {m.secondary ? (
              <span className="mention-stat">
                <b>{m.secondary.value.toLocaleString("en-US")}</b>{" "}
                {m.secondary.label}
              </span>
            ) : null}
            <span className="mention-author">by {m.author}</span>
            {host ? <span className="mention-host">{host}</span> : null}
            {m.matchReason ? (
              <span className="mention-match">matched: {m.matchReason}</span>
            ) : null}
            <span className="mention-shortlabel">
              {shortLabel}
              <ExternalLink size={9} aria-hidden style={{ marginLeft: 3 }} />
            </span>
          </footer>
        </div>
        <span className="mention-open">→ OPEN</span>
      </a>
      <style>{`
        .mention-row {
          border-bottom: 1px solid var(--v3-line-100, rgba(255,255,255,0.08));
        }
        .mention-row:last-child { border-bottom: 0; }
        .mention-row-link {
          display: grid;
          grid-template-columns: auto 1fr auto;
          gap: 12px;
          padding: 12px;
          align-items: start;
          text-decoration: none;
          transition: background 120ms;
        }
        .mention-row-link:hover {
          background: var(--v3-bg-100, rgba(255,255,255,0.05));
        }
        .mention-pill {
          width: 28px;
          height: 28px;
          flex-shrink: 0;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: var(--m-color);
          color: #fff;
          font-family: var(--font-geist-mono, monospace);
          font-size: 10px;
          font-weight: 700;
          border-radius: 3px;
          margin-top: 2px;
        }
        .mention-body { min-width: 0; }
        .mention-head {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 8px;
        }
        .mention-title {
          font-size: 13px;
          line-height: 1.4;
          color: var(--v3-ink-100, #fff);
          font-weight: 500;
          word-break: break-word;
        }
        .mention-row-link:hover .mention-title {
          color: var(--v3-acc, #ffcb05);
        }
        .mention-source-tag {
          font-family: var(--font-geist-mono, monospace);
          font-size: 10px;
          letter-spacing: 0.1em;
          padding: 1px 6px;
          border: 1px solid;
          border-radius: 2px;
          text-transform: uppercase;
          background: color-mix(in oklab, var(--m-color) 12%, transparent);
        }
        .mention-age {
          font-family: var(--font-geist-mono, monospace);
          font-size: 10px;
          color: var(--v3-ink-400, rgba(255,255,255,0.55));
        }
        .mention-meta {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 12px;
          margin-top: 6px;
          font-family: var(--font-geist-mono, monospace);
          font-size: 11px;
          color: var(--v3-ink-400, rgba(255,255,255,0.55));
        }
        .mention-stat b { color: var(--v3-ink-200, rgba(255,255,255,0.8)); }
        .mention-author { color: var(--v3-ink-300); }
        .mention-host {
          color: var(--v3-ink-400);
          font-style: italic;
        }
        .mention-match { color: var(--v3-ink-500, rgba(255,255,255,0.3)); }
        .mention-shortlabel {
          margin-left: auto;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: var(--v3-ink-400);
          display: inline-flex;
          align-items: center;
        }
        .mention-open {
          align-self: center;
          padding: 8px 12px;
          font-family: var(--font-geist-mono, monospace);
          font-size: 10px;
          letter-spacing: 0.14em;
          color: var(--v3-ink-300);
          border: 1px solid var(--v3-line-200);
          border-radius: 2px;
          flex-shrink: 0;
          transition: color 120ms, border-color 120ms;
        }
        .mention-row-link:hover .mention-open {
          color: var(--v3-acc, #ffcb05);
          border-color: var(--v3-acc, #ffcb05);
        }
      `}</style>
    </li>
  );
}

export default RecentMentionsFeed;
