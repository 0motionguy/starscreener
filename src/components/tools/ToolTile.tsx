// V4 — ToolTile
//
// One of the four tiles at the top of /tools. Mockup: tools.html § hero.
// Each tile has a number eyebrow, sans-serif title, sans 11.5 description,
// foot meta (status + open arrow), and an optional SVG preview in the
// top-right.
//
// Usage:
//   <ToolTile
//     num="// 01 · NEW"
//     title="Star History"
//     desc="Plot multiple repos head-to-head..."
//     active
//     foot={<><LiveDot label="LIVE" /><span>JUMP TO →</span></>}
//     preview={<svg width="60" height="34">...</svg>}
//     href="/tools/star-history"
//   />

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface ToolTileProps {
  num: ReactNode;
  title: ReactNode;
  desc: ReactNode;
  /** When true, renders the orange-accent active treatment. */
  active?: boolean;
  /** Right-aligned tiny SVG / icon preview (mockup-canonical 60×34). */
  preview?: ReactNode;
  /** Foot row content (status + arrow). Rendered as a flex row. */
  foot?: ReactNode;
  /** When provided, tile renders as <a> instead of <div>. */
  href?: string;
  className?: string;
}

export function ToolTile({
  num,
  title,
  desc,
  active = false,
  preview,
  foot,
  href,
  className,
}: ToolTileProps) {
  const Tag = href ? "a" : "div";
  return (
    <Tag
      {...(href ? { href } : {})}
      className={cn(
        "v4-tool-tile",
        active && "v4-tool-tile--active",
        href && "v4-tool-tile--interactive",
        className,
      )}
    >
      <div className="v4-tool-tile__num">{num}</div>
      <div className="v4-tool-tile__title">{title}</div>
      <div className="v4-tool-tile__desc">{desc}</div>
      {foot ? <div className="v4-tool-tile__foot">{foot}</div> : null}
      {preview ? (
        <div className="v4-tool-tile__preview" aria-hidden="true">
          {preview}
        </div>
      ) : null}
    </Tag>
  );
}
