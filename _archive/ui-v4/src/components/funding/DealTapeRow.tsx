// V4 — DealTapeRow
//
// Live-tape entry for funding.html § 04 "Tape · latest 50". Each row:
//
//   06:24   Anthropic raises $2.0B Series F                        $2.0B
//           Led by Lightspeed at a $61.5B post-money valuation...
//           [BB] [SERIES F]
//
// `fresh` adds a green-tint highlight + makes the timestamp green for items
// in the most recent batch. Mockup convention: 3 most recent items per scan.
//
// 2026-05-07 polish (A3): tabular-nums on amount + timestamp so columns
// align across rows; tooltip via `title` on the row when `titleText` is
// passed so truncated rows still expose full context on hover.

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface DealTapeRowProps {
  ts: string;
  /** Row title — bold when sliced from a longer caption with a <b>company</b>. */
  title: ReactNode;
  desc?: ReactNode;
  amount: string;
  /** 2-letter funding source code (BB, CB, TC, …). */
  sourceCode?: string;
  /** Stage label e.g. "SERIES F", "ARR", "SEED". */
  stage?: string;
  /** Highlight as fresh (last batch) — adds green tint + green timestamp. */
  fresh?: boolean;
  href?: string;
  className?: string;
  /** Plain-string version of the title used for the hover tooltip when the
      ReactNode title contains formatting. A3 polish so truncated rows still
      surface full context on hover. */
  titleText?: string;
}

export function DealTapeRow({
  ts,
  title,
  desc,
  amount,
  sourceCode,
  stage,
  fresh = false,
  href,
  className,
  titleText,
}: DealTapeRowProps) {
  const Tag = href ? "a" : "div";
  return (
    <Tag
      {...(href ? { href } : {})}
      className={cn("v4-tape-row", fresh && "v4-tape-row--fresh", className)}
      title={titleText}
    >
      <div className="v4-tape-row__ts" style={{ fontVariantNumeric: "tabular-nums" }}>
        {ts}
      </div>
      <div className="v4-tape-row__body">
        <div className="v4-tape-row__title">{title}</div>
        {desc ? <div className="v4-tape-row__desc">{desc}</div> : null}
        {(sourceCode || stage) && (
          <div className="v4-tape-row__meta">
            {sourceCode ? (
              <span className="v4-tape-row__src">{sourceCode}</span>
            ) : null}
            {stage ? <span className="v4-tape-row__stage">{stage}</span> : null}
          </div>
        )}
      </div>
      <div
        className="v4-tape-row__amt"
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {amount}
      </div>
    </Tag>
  );
}
