// V4 — MentionRow
//
// Cross-platform evidence row for repo-detail.html § 03 "Mentions · evidence
// feed". One row per mention across HN/Reddit/Bluesky/X/Twitter/Dev.to/HF.
//
// Layout (mockup-canonical):
//
//   [AV]  AUTHOR        @handle     [HN]   2d ago · APR 26
//         Title or first 200 chars of the post...
//         ▲ 412  ▽ 184  ↑ #4 front-page  by lucasronin   news.yc...
//                                                       [→ OPEN]
//
// Pure presentation. Caller supplies pre-formatted strings.

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { SourcePip, type SourceKey } from "@/components/ui/SourcePip";

export interface MentionStat {
  label: ReactNode;
  /** Highlight the stat in money color (e.g. for trending indicators). */
  emphasis?: "up" | "down" | "neutral";
}

export interface MentionRowProps {
  source: SourceKey;
  /** Tiny avatar / source mark on the far left. Default = SourcePip. */
  avatar?: ReactNode;
  /** Author name (bold) — e.g. "Lucas Ronin", "u/notetaking_obsessive". */
  author: ReactNode;
  /** Optional handle / sub-author (gray, after the bold name). */
  handle?: ReactNode;
  /** Source label chip (e.g. "▶ HACKERNEWS"). Optional — rendered with SourcePip color. */
  sourceLabel?: ReactNode;
  /** Timestamp / relative age string. */
  ts: ReactNode;
  /** Body content — caller controls highlights via <b>, <a>, etc. */
  body: ReactNode;
  /** Stats row — array of pre-formatted small chips. */
  stats?: MentionStat[];
  /** Optional outbound URL. When provided, shows the OPEN button. */
  href?: string;
  /** Optional URL preview text (e.g. "news.ycombinator.com/item?id=…"). */
  url?: string;
  className?: string;
}

export function MentionRow({
  source,
  avatar,
  author,
  handle,
  sourceLabel,
  ts,
  body,
  stats,
  href,
  url,
  className,
}: MentionRowProps) {
  return (
    <article
      className={cn("v4-mention-row", `v4-mention-row--${source}`, className)}
    >
      <div className="v4-mention-row__avatar">
        {avatar ?? <SourcePip src={source} size="lg" />}
      </div>
      <div className="v4-mention-row__body">
        <header className="v4-mention-row__head">
          <span className="v4-mention-row__author">{author}</span>
          {handle ? (
            <span className="v4-mention-row__handle">{handle}</span>
          ) : null}
          {sourceLabel ? (
            <span className="v4-mention-row__source">{sourceLabel}</span>
          ) : null}
          <span className="v4-mention-row__ts">{ts}</span>
        </header>
        <div className="v4-mention-row__text">{body}</div>
        {(stats?.length || url) && (
          <footer className="v4-mention-row__meta">
            {stats?.map((s, i) => (
              <span
                key={i}
                className={cn(
                  "v4-mention-row__stat",
                  s.emphasis && `v4-mention-row__stat--${s.emphasis}`,
                )}
              >
                {s.label}
              </span>
            ))}
            {url ? <span className="v4-mention-row__url">{url}</span> : null}
          </footer>
        )}
      </div>
      {href ? (
        <a className="v4-mention-row__open" href={href} target="_blank" rel="noopener">
          → OPEN
        </a>
      ) : null}
    </article>
  );
}
