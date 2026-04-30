"use client";

// V4 — RankRow
//
// Generic row primitive used by:
//   - top10.html ranking panel (10 rows with avatar, title, score, sparkline)
//   - home.html hero category panels (REPOS / CLAUDE SKILLS / MCP)
//   - consensus.html banded leaderboard (one row per repo)
//
// Mockup shape:
//   ┌────┬─────┬─────────────────────────┬──────┬────────┬───┐
//   │ 01 │ [A] │ anthropic/claude-code   │ 4.81 │ +18% ▲ │ → │
//   └────┴─────┴─────────────────────────┴──────┴────────┴───┘
//     ↑    ↑     ↑                          ↑      ↑        ↑
//   rank  avatar title (+ optional desc)  metric  delta    arr
//
// The #1 row gets a left rail + soft acc gradient (`first` prop).
//
// Usage:
//   <RankRow
//     rank={1}
//     avatar={<LetterAvatar text="anthropic/claude-code" />}
//     title={<>anthropic <span className="o">/</span> claude-code</>}
//     desc="Agentic coding tool that lives in your terminal"
//     metric={{ label: "/ 5.0", value: "4.81" }}
//     delta={{ value: "+18%", direction: "up", sparkline: <Sparkline ... /> }}
//     first
//   />
//
// `metric` and `delta` are flexible nodes — pass whatever the page needs.

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface RankRowMetric {
  /** Big numeric value, mono. */
  value: ReactNode;
  /** Caps label below or right of the value. */
  label?: ReactNode;
}

export interface RankRowDelta {
  value: ReactNode;
  direction?: "up" | "down" | "flat";
  /** Optional sparkline (e.g. <Sparkline ... />). Rendered below the delta. */
  sparkline?: ReactNode;
  label?: ReactNode;
}

export interface RankRowProps {
  rank: number | string;
  avatar?: ReactNode;
  title: ReactNode;
  desc?: ReactNode;
  metric?: RankRowMetric;
  delta?: RankRowDelta;
  /** Right-most arrow / chevron. Default ›. Pass null to omit. */
  arrow?: ReactNode;
  /** Apply the #1-row treatment (acc left rail + soft gradient). */
  first?: boolean;
  /** Renders as <a href={href}> instead of <div>. */
  href?: string;
  onClick?: () => void;
  className?: string;
}

export function RankRow({
  rank,
  avatar,
  title,
  desc,
  metric,
  delta,
  arrow = "›",
  first = false,
  href,
  onClick,
  className,
}: RankRowProps) {
  const Tag = href ? "a" : ("div" as const);
  const tagProps = href
    ? { href }
    : onClick
      ? { onClick, role: "button" as const, tabIndex: 0 }
      : {};
  const rankStr =
    typeof rank === "number" ? String(rank).padStart(2, "0") : rank;
  return (
    <Tag
      {...tagProps}
      className={cn(
        "v4-rank-row",
        first && "v4-rank-row--first",
        (href || onClick) && "v4-rank-row--interactive",
        className,
      )}
    >
      <span className="v4-rank-row__rank">{rankStr}</span>
      {avatar ? (
        <span className="v4-rank-row__avatar" aria-hidden="true">
          {avatar}
        </span>
      ) : null}
      <span className="v4-rank-row__body">
        <span className="v4-rank-row__title">{title}</span>
        {desc ? <span className="v4-rank-row__desc">{desc}</span> : null}
      </span>
      {metric ? (
        <span className="v4-rank-row__metric">
          <span className="v4-rank-row__metric-value">{metric.value}</span>
          {metric.label ? (
            <span className="v4-rank-row__metric-label">{metric.label}</span>
          ) : null}
        </span>
      ) : null}
      {delta ? (
        <span
          className={cn(
            "v4-rank-row__delta",
            delta.direction && `v4-rank-row__delta--${delta.direction}`,
          )}
        >
          <span className="v4-rank-row__delta-value">{delta.value}</span>
          {delta.sparkline ? (
            <span className="v4-rank-row__delta-spark">{delta.sparkline}</span>
          ) : null}
          {delta.label ? (
            <span className="v4-rank-row__delta-label">{delta.label}</span>
          ) : null}
        </span>
      ) : null}
      {arrow ? (
        <span className="v4-rank-row__arr" aria-hidden="true">
          {arrow}
        </span>
      ) : null}
    </Tag>
  );
}
