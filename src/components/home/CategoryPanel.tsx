// V4 — CategoryPanel
//
// One of the three category cards on home.html § 01 hero strip:
// REPOS · CLAUDE SKILLS · MCP SERVERS. Each panel:
//
//   ┌───────────────────────────────────────────┐
//   │ ●  REPOS · TOP GAINERS         7 / 1,247  │
//   │ 01  mattpocock/skills              +564↑  │  ← #1 first row
//   │ 02  forrestchang/karpathy-skills   +260↑  │
//   │ ...                                       │
//   │ updated 38s ago        view all 1,247 →   │
//   └───────────────────────────────────────────┘
//
// Composes existing primitives: Panel chrome + PanelHead + RankRow stack
// + footer link. Caller supplies the rows.
//
// Usage:
//   <CategoryPanel
//     title="REPOS · TOP GAINERS"
//     pip="var(--v4-acc)"
//     count="7 / 1,247"
//     foot={{ left: "updated 38s ago", right: "view all 1,247 →", href: "/" }}
//   >
//     {repos.map((r, i) => (
//       <RankRow key={r.id} rank={i+1} title={r.fullName} delta={...} first={i === 0} />
//     ))}
//   </CategoryPanel>

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { LiveDot } from "@/components/ui/LiveDot";

export interface CategoryPanelFoot {
  left?: ReactNode;
  right?: ReactNode;
  /** Optional href for the right-side "view all" link. */
  href?: string;
}

export interface CategoryPanelProps {
  title: ReactNode;
  /** CSS color for the small leading pip. */
  pip?: string;
  /** Right meta text (e.g. count "7 / 1,247"). */
  count?: ReactNode;
  /** Show the live indicator in the head right slot. */
  live?: boolean;
  foot?: CategoryPanelFoot;
  className?: string;
  /** RankRow children stack. */
  children: ReactNode;
}

export function CategoryPanel({
  title,
  pip,
  count,
  live = true,
  foot,
  className,
  children,
}: CategoryPanelProps) {
  return (
    <section className={cn("v4-cat-panel", className)}>
      <header className="v4-cat-panel__head">
        {pip ? (
          <span
            className="v4-cat-panel__pip"
            style={{ background: pip }}
            aria-hidden="true"
          />
        ) : null}
        <span className="v4-cat-panel__title">{title}</span>
        {count !== undefined ? (
          <span className="v4-cat-panel__count">{count}</span>
        ) : null}
        {live ? (
          <span className="v4-cat-panel__live">
            <LiveDot label="LIVE" />
          </span>
        ) : null}
      </header>
      <div className="v4-cat-panel__body">{children}</div>
      {foot ? (
        <footer className="v4-cat-panel__foot">
          {foot.left ? <span>{foot.left}</span> : <span />}
          {foot.right ? (
            foot.href ? (
              <a href={foot.href}>{foot.right}</a>
            ) : (
              <span>{foot.right}</span>
            )
          ) : null}
        </footer>
      ) : null}
    </section>
  );
}
