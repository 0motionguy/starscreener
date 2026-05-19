// V4 — StockSparkline
//
// Compact stock-style row used in funding.html "AI-Software Index · 12
// stocks list". Each row:
//
//   ●   NVDA   NVIDIA               112.4   +2.4%
//
// Pure presentation — caller passes price/delta strings already formatted.
// The index chart (the area-fill above the list) is rendered by a separate
// CapitalFlowChart-family export; this file is the row primitive only.

import { cn } from "@/lib/utils";

export interface StockRowProps {
  /** 3-5 letter ticker. */
  ticker: string;
  /** Full company name in caps. */
  name: string;
  /** Pre-formatted price string. */
  price: string;
  /** Pre-formatted change string e.g. "+2.4%" or "-0.4%". */
  change: string;
  /** Direction colors the change cell. */
  direction?: "up" | "down" | "flat";
  /** CSS color for the leading pip swatch (mockup-canonical: per-stock). */
  pipColor?: string;
  href?: string;
  className?: string;
}

export function StockRow({
  ticker,
  name,
  price,
  change,
  direction = "up",
  pipColor,
  href,
  className,
}: StockRowProps) {
  const Tag = href ? "a" : "div";
  return (
    <Tag
      {...(href ? { href } : {})}
      className={cn("v4-stock-row", className)}
    >
      {pipColor ? (
        <span
          className="v4-stock-row__pip"
          style={{ background: pipColor }}
          aria-hidden="true"
        />
      ) : (
        <span className="v4-stock-row__pip v4-stock-row__pip--empty" aria-hidden="true" />
      )}
      <span className="v4-stock-row__tic">{ticker}</span>
      <span className="v4-stock-row__nm">{name}</span>
      <span className="v4-stock-row__px">{price}</span>
      <span className={cn("v4-stock-row__ch", `v4-stock-row__ch--${direction}`)}>
        {change}
      </span>
    </Tag>
  );
}
