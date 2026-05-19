// V4 — VerdictRibbon
//
// The tinted full-width banner used at the top of pages with a verdict.
// Mockup-canonical (consensus.html, funding.html, repo-detail.html):
//
//   ┌─[acc-rail]──────────────────────────────────────────────────┐
//   │ // STAMP        14 strong consensus picks today...    [→]    │
//   │ 28 APR · 06:29  led by anthropics/skills (8/8) and ...       │
//   │ computed 4m ago                                              │
//   └──────────────────────────────────────────────────────────────┘
//
// Three tones (locked semantic):
//   acc     → orange (--v4-acc) — default; used for consensus + verdict pages
//   money   → green — used for funding tape
//   amber   → amber — used for stale / warning verdicts
//
// `stamp` is the left column metadata block (label + timestamp + small ago).
// `text` is the prose verdict (sans-serif, 14-16px, leading 1.55).
// `actionHref` adds an inline arrow link in the right column.
//
// Usage:
//   <VerdictRibbon
//     tone="money"
//     stamp={{
//       eyebrow: "// TODAY'S TAPE",
//       headline: "28 APR · 06:29 UTC",
//       sub: "computed 2m ago · 142 deals · 24h",
//     }}
//     text={<>$<b>4.82B raised</b> across 142 deals in the last 24h …</>}
//     actionHref="/funding/methodology"
//     actionLabel="METHODOLOGY"
//   />

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type VerdictTone = "acc" | "money" | "amber";

export interface VerdictStamp {
  /** Top eyebrow line, mono caps, in --v4-{tone} color. */
  eyebrow?: ReactNode;
  /** Headline timestamp/title — mono 14px, ink-100. */
  headline?: ReactNode;
  /** Small caption, mono 9-10px ink-400. */
  sub?: ReactNode;
}

export interface VerdictRibbonProps {
  tone?: VerdictTone;
  stamp?: VerdictStamp;
  text: ReactNode;
  actionHref?: string;
  actionLabel?: ReactNode;
  className?: string;
}

export function VerdictRibbon({
  tone = "acc",
  stamp,
  text,
  actionHref,
  actionLabel = "→",
  className,
}: VerdictRibbonProps) {
  return (
    <div
      className={cn("v4-verdict-ribbon", `v4-verdict-ribbon--${tone}`, className)}
      role="region"
      aria-label="verdict"
    >
      {stamp ? (
        <div className="v4-verdict-ribbon__stamp">
          {stamp.eyebrow ? (
            <span className="v4-verdict-ribbon__eyebrow">{stamp.eyebrow}</span>
          ) : null}
          {stamp.headline ? (
            <span className="v4-verdict-ribbon__headline">{stamp.headline}</span>
          ) : null}
          {stamp.sub ? (
            <span className="v4-verdict-ribbon__sub">{stamp.sub}</span>
          ) : null}
        </div>
      ) : null}
      <div className="v4-verdict-ribbon__text">{text}</div>
      {actionHref ? (
        <a className="v4-verdict-ribbon__action" href={actionHref}>
          {actionLabel}
        </a>
      ) : null}
    </div>
  );
}
