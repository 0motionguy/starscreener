// ToolCard — Generic `.tool-card` template used by 10+ tool tiles.
//
// Renders the head (// 01 + ROUTE eyebrow), title, description, a preview
// children slot, and the foot bar (label + meta). One source of truth for
// the markup so each per-tool component only owns its preview + props.

import Link from "next/link";
import type { ReactNode } from "react";

interface ToolCardProps {
  /** Display ordinal — e.g. "01" / "02" used in `.tc-num`. */
  number: string;
  /** Card target route. Use "#anchor" for tools not yet wired to a detail page. */
  route: string;
  /** Right-side ROUTE pill text — CHART / WATCH / COMPARE / RANK / etc. */
  routeLabel: string;
  title: string;
  /** Description JSX so callers can bold key counts inline. */
  description: ReactNode;
  /** Preview slot — the `.tc-preview` div wrapping mini-art. */
  children: ReactNode;
  /** Foot left text — typically "OPEN →" / "SUBMIT →". */
  footPrimary?: string;
  /** Foot right text — count / qualifier line. */
  footMeta: ReactNode;
}

export function ToolCard({
  number,
  route,
  routeLabel,
  title,
  description,
  children,
  footPrimary = "OPEN →",
  footMeta,
}: ToolCardProps) {
  // Hash anchors (#starhistory, #compare, …) → plain <a>; everything else
  // gets Next's <Link>. Anchors don't benefit from prefetch.
  const isHash = route.startsWith("#");
  const inner = (
    <>
      <div className="tc-head">
        <span className="tc-num">{"// "}{number}</span>
        <span className="tc-route">{routeLabel}</span>
      </div>
      <div className="tc-title">{title}</div>
      <div className="tc-desc">{description}</div>
      <div className="tc-preview">{children}</div>
      <div className="tc-foot">
        <span className="lava">{footPrimary}</span>
        <span>{footMeta}</span>
      </div>
    </>
  );

  if (isHash) {
    return (
      <a href={route} className="tool-card">
        {inner}
      </a>
    );
  }
  return (
    <Link href={route} className="tool-card" prefetch={false}>
      {inner}
    </Link>
  );
}

/** Section eyebrow header — matches `.sec-eyebrow` markup in the HTML ref. */
export function SectionEyebrow({
  num,
  title,
  meta,
}: {
  num: string;
  title: string;
  meta: ReactNode;
}) {
  return (
    <div
      className="sec-eyebrow"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        margin: "22px 0 12px",
        paddingBottom: 8,
        borderBottom: "1px solid var(--border-subtle)",
      }}
    >
      <span className="num" style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--accent)", letterSpacing: "0.10em", fontWeight: 600 }}>
        {"// "}{num}
      </span>
      <span className="title" style={{ fontSize: 14, color: "var(--fg-bright)", fontWeight: 500 }}>
        {title}
      </span>
      <span className="meta" style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--fg-faint)", marginLeft: "auto" }}>
        {meta}
      </span>
    </div>
  );
}
