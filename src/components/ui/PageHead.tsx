// V4 — PageHead
//
// The top-of-page hero used on every flagship page (and most secondary
// pages). Three-column layout:
//
//   left:    crumb (// CRUMB · TERMINAL · /path)
//            H1 (sans, 30px, -0.024em)
//            lede (sans, 13px, ink-300, max-width 640)
//
//   right:   clock (mono, current UTC HH:MM:SS)
//            window label
//            LIVE pulse
//
// Mockup reference: signals.html line ~93-121, home.html line ~218-236,
// consensus.html line ~93-110, funding.html line ~95-115, repo-detail.html
// (uses ID strip variant — pass `variant="id"` for that case).
//
// Usage:
//   <PageHead
//     crumb={<><b>SIGNAL</b> · TERMINAL · /SIGNALS</>}
//     h1="The newsroom for AI & dev tooling."
//     lede="Eight sources, one editorial layer..."
//     clock={<LiveClock />}
//   />
//
// For repo-detail's hero (avatar + handle + stats), use a custom layout —
// PageHead's variant="id" provides the chrome but caller supplies the
// content via children prop.

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface PageHeadProps {
  /**
   * Top eyebrow — caps tracking, ink-400 base, with <b>highlighted token</b>
   * in --v4-acc. Example: <><b>SIGNAL</b> · TERMINAL · /SIGNALS</>
   */
  crumb?: ReactNode;
  /** H1 — sans 30px, weight 500, leading 1.05, ink-000. */
  h1?: ReactNode;
  /** Lede paragraph — sans 13px, leading 1.5, ink-300, max-width 640. */
  lede?: ReactNode;
  /**
   * Right-aligned clock / metadata column. Can be a <LiveClock/> instance,
   * a static UTC time, or a multi-line render. Caller controls.
   */
  clock?: ReactNode;
  /** When true, suppresses the bottom border (use on pages with custom dividers). */
  noBorder?: boolean;
  className?: string;
  /** Escape hatch for repo-detail / per-entity custom hero content. */
  children?: ReactNode;
}

export function PageHead({
  crumb,
  h1,
  lede,
  clock,
  noBorder = false,
  className,
  children,
}: PageHeadProps) {
  return (
    <header
      className={cn(
        "v4-page-head",
        noBorder && "v4-page-head--no-border",
        className,
      )}
    >
      <div className="v4-page-head__main">
        {crumb ? <div className="v4-page-head__crumb">{crumb}</div> : null}
        {h1 ? <h1 className="v4-page-head__h1">{h1}</h1> : null}
        {lede ? <p className="v4-page-head__lede">{lede}</p> : null}
        {children}
      </div>
      {clock ? <div className="v4-page-head__clock">{clock}</div> : null}
    </header>
  );
}
