import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { BrandStar } from "@/components/shared/BrandStar";
import { RepoLink } from "@/components/repo/RepoLink";

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
  /** Optional href - renders as <a> via RepoLink when interactive. */
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
  const cardClass = cn(
    "v4-related-card",
    href && "v4-related-card--interactive",
    className,
  );
  const inner = (
    <>
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
            <BrandStar size={11} className="text-[var(--v4-amber)]" />{" "}
            {stars}
          </span>
        ) : null}
        {similarity ? (
          <span className="v4-related-card__why">{similarity}</span>
        ) : null}
      </footer>
    </>
  );
  if (!href) {
    return <div className={cardClass}>{inner}</div>;
  }
  return (
    <RepoLink fullName={fullName} href={href} className={cardClass}>
      {inner}
    </RepoLink>
  );
}
