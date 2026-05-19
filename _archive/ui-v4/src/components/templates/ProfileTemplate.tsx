// V4 — ProfileTemplate
//
// Layout primitive consumed by W9 (user-surfaces-v4) and reused by detail
// pages in W5 (repo-detail), W8 (ecosystem detail).
//
// Mockup reference: repo-detail.html — the canonical "entity profile" shape.
//
// Layout:
//   PageHead with custom hero children (avatar/identity strip)
//   Optional VerdictRibbon (drop-in)
//   KpiBand (slot)
//   2-col body: main panels + right rail
//   Bottom: related entities grid

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { PageHead } from "@/components/ui/PageHead";
import { SectionHead } from "@/components/ui/SectionHead";

export interface ProfileTemplateProps {
  /** Top crumb. */
  crumb?: ReactNode;
  /**
   * Identity strip — caller composes the avatar + name + handle + stats.
   * Rendered inside <PageHead>.children, replacing h1 / lede when set.
   */
  identity?: ReactNode;
  /** Right-aligned clock / actions slot in PageHead. */
  clock?: ReactNode;

  /** Optional VerdictRibbon below PageHead. */
  verdict?: ReactNode;

  /** KPI band slot (caller passes <KpiBand cells=…/>). */
  kpiBand?: ReactNode;

  /** Channel firing strip / cross-signal breakdown — repo-detail signature row. */
  signalStrip?: ReactNode;

  /** Main body content — typically a stack of panels (chart, mentions, etc.). */
  mainPanels?: ReactNode;

  /** Right rail — about card, related repos preview, share/embed. */
  rightRail?: ReactNode;

  /** Optional related-entities grid below the body. */
  relatedEyebrow?: ReactNode;
  related?: ReactNode;

  className?: string;
}

export function ProfileTemplate({
  crumb,
  identity,
  clock,
  verdict,
  kpiBand,
  signalStrip,
  mainPanels,
  rightRail,
  relatedEyebrow = "RELATED",
  related,
  className,
}: ProfileTemplateProps) {
  return (
    <div className={cn("v4-profile-template", className)}>
      <PageHead crumb={crumb} clock={clock}>
        {identity}
      </PageHead>

      {verdict ? <div className="v4-profile-template__verdict">{verdict}</div> : null}
      {kpiBand ? <div className="v4-profile-template__kpi">{kpiBand}</div> : null}
      {signalStrip ? (
        <div className="v4-profile-template__signal-strip">{signalStrip}</div>
      ) : null}

      <div
        className={cn(
          "v4-profile-template__body",
          Boolean(rightRail) && "v4-profile-template__body--with-rail",
        )}
      >
        <div className="v4-profile-template__main">{mainPanels}</div>
        {rightRail ? (
          <aside className="v4-profile-template__rail">{rightRail}</aside>
        ) : null}
      </div>

      {related ? (
        <>
          <SectionHead num="// REL" title={relatedEyebrow} />
          <div className="v4-profile-template__related">{related}</div>
        </>
      ) : null}
    </div>
  );
}
