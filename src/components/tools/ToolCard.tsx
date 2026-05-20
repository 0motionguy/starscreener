import Link from "next/link";
import type { ReactNode } from "react";

interface ToolCardProps {
  number: string;
  route: string;
  routeLabel: string;
  title: string;
  description: ReactNode;
  children: ReactNode;
  footPrimary?: string;
  footMeta: ReactNode;
}

export function ToolCard({
  number,
  route,
  routeLabel,
  title,
  description,
  children,
  footPrimary = "OPEN ->",
  footMeta,
}: ToolCardProps) {
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

  if (route.startsWith("#")) {
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
      <span className="num">{"// "}{num}</span>
      <span className="title">{title}</span>
      <span className="meta">{meta}</span>
    </div>
  );
}
