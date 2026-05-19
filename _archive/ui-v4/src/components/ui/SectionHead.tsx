// V4 — SectionHead
//
// The page-level section divider that appears between major chunks of every
// page. Layout:
//
//   // 01    Section Title                           meta · 14 sources
//
// Mockup reference: every mockup uses this pattern. signals.html line ~336
// "// 03 Primary feeds", home.html line ~282 "// 02 Trending now", etc.
//
// `num` is the mono prefix in --v4-acc (e.g. "// 01"). `title` is the
// sans-serif H2. `meta` is the right-aligned tracker text (often a count).
//
// Usage:
//   <SectionHead num="// 01" title="Trending now · top 7 by category" />
//
//   <SectionHead
//     num="// 04"
//     title="Featured · curated this week"
//     meta={<>editor · <b>3</b> picks</>}
//   />

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface SectionHeadProps {
  /** Mono prefix, e.g. "// 01". Rendered in --v4-acc. */
  num: string;
  /** H2 section title — sans-serif, weight 500, slight negative tracking. */
  title: ReactNode;
  /** Optional right-aligned meta — caps mono, ink-400 with optional <b>highlights</b>. */
  meta?: ReactNode;
  className?: string;
  /** HTML heading level — defaults to h2; allow h3 for nested sub-sections. */
  as?: "h2" | "h3";
}

export function SectionHead({
  num,
  title,
  meta,
  className,
  as = "h2",
}: SectionHeadProps) {
  const Heading = as;
  return (
    <div className={cn("v4-section-head", className)}>
      <span className="v4-section-head__num">{num}</span>
      <Heading className="v4-section-head__title">{title}</Heading>
      {meta ? <span className="v4-section-head__meta">{meta}</span> : null}
    </div>
  );
}
