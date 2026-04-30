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
}: DealTapeRowProps) {
  const Tag = href ? "a" : "div";
  return (
    <Tag
      {...(href ? { href } : {})}
      className={cn("v4-tape-row", fresh && "v4-tape-row--fresh", className)}
    >
      <div className="v4-tape-row__ts">{ts}</div>
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
      <div className="v4-tape-row__amt">{amount}</div>
    </Tag>
  );
}
