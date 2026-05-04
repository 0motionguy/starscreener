import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface RelatedRepoCardProps {
  /** Repo full name e.g. "abhigyanpatwari/GitNexus". */
  fullName: string;
  /** 1-2 line description. Truncated with line-clamp 2 in CSS. */
  description?: ReactNode;
  /** Avatar - usually a LetterAvatar. Caller supplies. */
  avatar?: ReactNode;
  /** Language chip text (e.g. "TYPESCRIPT"). Mockup uses caps. */
  language?: ReactNode;
  /** Star count, pre-formatted (e.g. "22.2K"). */
  stars?: ReactNode;
  /** Similarity score (e.g. "SIM 0.86") rendered right-aligned in caps. */
  similarity?: ReactNode;
  /** Optional href - renders as <a>. */
  href?: string;
  className?: string;
}

export function RelatedRepoCard({
  fullName,
  description,
  avatar,
  language,
  stars,
  similarity,
  href,
  className,
}: RelatedRepoCardProps) {
  const Tag = href ? "a" : "div";
  return (
    <Tag
      {...(href ? { href } : {})}
      className={cn("v4-related-card", href && "v4-related-card--interactive", className)}
    >
      <header className="v4-related-card__head">
        {avatar ? (
          <span className="v4-related-card__avatar">{avatar}</span>
        ) : null}
        <span className="v4-related-card__nm" title={fullName}>
          {fullName}
        </span>
      </header>
      {description ? (
        <p className="v4-related-card__desc">{description}</p>
      ) : null}
      <footer className="v4-related-card__row">
        {language ? (
          <span className="v4-related-card__lang">{language}</span>
        ) : null}
        {stars ? (
          <span className="v4-related-card__stars">
            {"★ "}
            {stars}
          </span>
        ) : null}
        {similarity ? (
          <span className="v4-related-card__why">{similarity}</span>
        ) : null}
      </footer>
    </Tag>
  );
}
