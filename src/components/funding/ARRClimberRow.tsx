// V4 — ARRClimberRow
//
// Row primitive for funding.html § 02 "ARR climbers" panel. Sources from
// TrustMrr scrapes (existing data/revenue-overlays.json).
//
// 2-row layout per item:
//
//   01   Cursor                                  ↑ #1 row gets acc rail
//        Dev tools · @anysphere
//        $140M ARR  ─────────────────  +18% MoM
//
// `momPct` is the percentage value (e.g. 18 for "+18%"). Bar width is
// normalized client-side by the parent — pass `barPct` to control fill.

import { cn } from "@/lib/utils";

export interface ARRClimberRowProps {
  rank: number;
  name: string;
  meta?: string;
  arr: string;
  momPct: number;
  /** 0–100 fill % of the visualization bar. Caller normalizes. */
  barPct?: number;
  /** Apply #1-row treatment (acc rail, not money — climbers are about momentum). */
  first?: boolean;
  href?: string;
  className?: string;
}

export function ARRClimberRow({
  rank,
  name,
  meta,
  arr,
  momPct,
  barPct,
  first = false,
  href,
  className,
}: ARRClimberRowProps) {
  const Tag = href ? "a" : "div";
  const fillPct = barPct ?? Math.min(100, Math.max(0, momPct));
  return (
    <Tag
      {...(href ? { href } : {})}
      className={cn(
        "v4-arr-row",
        first && "v4-arr-row--first",
        className,
      )}
    >
      <span className="v4-arr-row__rank">
        {String(rank).padStart(2, "0")}
      </span>
      <div className="v4-arr-row__body">
        <div className="v4-arr-row__name">{name}</div>
        {meta ? <div className="v4-arr-row__meta">{meta}</div> : null}
      </div>
      <div className="v4-arr-row__stats">
        <div className="v4-arr-row__arr">
          <span>{arr}</span>
          <span className="v4-arr-row__lbl">ARR</span>
        </div>
        <div
          className="v4-arr-row__bar"
          aria-hidden="true"
          role="progressbar"
          aria-valuenow={momPct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${momPct}% MoM`}
        >
          <i style={{ width: `${fillPct}%` }} />
        </div>
        <div className={cn("v4-arr-row__pct", momPct < 0 && "v4-arr-row__pct--down")}>
          <span>
            {momPct >= 0 ? "+" : ""}
            {momPct}%
          </span>
          <span className="v4-arr-row__lbl">MoM</span>
        </div>
      </div>
    </Tag>
  );
}
