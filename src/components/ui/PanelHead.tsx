// V4 — PanelHead
//
// The mockup-canonical panel header used across every page. Layout:
//
//   [corner-dots]  // KEY · subtitle             [right meta · LIVE]
//
// Mockup reference: signals.html line ~210-225, consensus.html line ~290-305,
// repo-detail.html line ~150-160. The tagline pattern "// KEY" + "· subtitle"
// is consistent across all 11 mockups.
//
// Usage:
//   <PanelHead
//     k="// 01 SIGNAL VOLUME"
//     sub="STACKED · 24H · BY SOURCE"
//     right={<LiveDot label="LIVE" />}
//   />
//
//   <PanelHead k="REPOS · TOP GAINERS" right={<span>7 / 1,247</span>} />
//
// `corner` defaults to true (most panels have the dots). Pass `corner={false}`
// for sub-headers that need a quieter frame (consensus band heads, e.g.).

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { CornerDots } from "./CornerDots";

export interface PanelHeadProps {
  /** Required key text — caps tracking, ink-100. The "// KEY" half of the head. */
  k: ReactNode;
  /** Optional subtitle — rendered after a middle-dot separator in ink-300. */
  sub?: ReactNode;
  /** Optional right-aligned meta. Common contents: <LiveDot/>, count, age. */
  right?: ReactNode;
  /** Show the 3-dot corner decoration (default true). */
  corner?: boolean;
  className?: string;
}

export function PanelHead({
  k,
  sub,
  right,
  corner = true,
  className,
}: PanelHeadProps) {
  return (
    <div className={cn("v4-panel-head", className)}>
      {corner ? <CornerDots /> : null}
      <span className="v4-panel-head__key">{k}</span>
      {sub ? (
        <span className="v4-panel-head__sub" aria-hidden={typeof sub === "string"}>
          · {sub}
        </span>
      ) : null}
      {right ? <span className="v4-panel-head__right">{right}</span> : null}
    </div>
  );
}
