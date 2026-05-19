// V4 — MiniListCard
//
// Compact "other lists" card from top10.html § quick-browse. Six-up grid:
//
//   ●  TOP 10 · LLMS                    7D
//   1. Claude Sonnet 4.5            4.92
//   2. GPT-5                        4.71
//   ...
//                                  → OPEN FULL · SHARE
//
// Pure presentation; data passed by parent.

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface MiniListItem {
  /** Pre-formatted name (caller controls splitting / styling). */
  name: ReactNode;
  /** Pre-formatted value (e.g. "4.92", "+312%"). */
  value: ReactNode;
}

export interface MiniListCardProps {
  /** Header title text (e.g. "TOP 10 · LLMS"). */
  title: ReactNode;
  /** Optional emoji / icon shown left of title. */
  icon?: ReactNode;
  /** Optional small badge on the right (e.g. "7D"). */
  badge?: ReactNode;
  items: MiniListItem[];
  /** Footer link text (default "OPEN FULL · SHARE"). */
  cta?: ReactNode;
  href?: string;
  className?: string;
}

export function MiniListCard({
  title,
  icon,
  badge,
  items,
  cta = "OPEN FULL · SHARE",
  href,
  className,
}: MiniListCardProps) {
  const Tag = href ? "a" : "div";
  return (
    <Tag
      {...(href ? { href } : {})}
      className={cn(
        "v4-mini-list",
        href && "v4-mini-list--interactive",
        className,
      )}
    >
      <div className="v4-mini-list__head">
        {icon ? (
          <span className="v4-mini-list__icon" aria-hidden="true">
            {icon}
          </span>
        ) : null}
        <span className="v4-mini-list__title">{title}</span>
        {badge ? <span className="v4-mini-list__badge">{badge}</span> : null}
      </div>
      <ol className="v4-mini-list__items">
        {items.map((it, i) => (
          <li key={i}>
            <span className="v4-mini-list__name">{it.name}</span>
            <b className="v4-mini-list__value">{it.value}</b>
          </li>
        ))}
      </ol>
      <div className="v4-mini-list__cta">→ {cta}</div>
    </Tag>
  );
}
