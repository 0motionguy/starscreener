import type { ReactNode } from "react";

import { BrandStar } from "@/components/shared/BrandStar";
import { cn } from "@/lib/utils";
import { RepoHoverPrefetchLink } from "@/components/repo/RepoHoverPrefetchLink";

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
  /** Optional all-source mention count in last 24h. */
  mentions24h?: number;
  /** Optional 24h stars delta for compact pill display. */
  delta24h?: number;
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
  mentions24h,
  delta24h,
  href,
  className,
}: RelatedRepoCardProps) {
  const hasMentions = typeof mentions24h === "number";
  const hasDelta = typeof delta24h === "number";
  const deltaLabel = hasDelta
    ? `${delta24h > 0 ? "+" : ""}${delta24h.toLocaleString("en-US")} 24H`
    : null;
  const classNames = cn("v4-related-card", href && "v4-related-card--interactive", className);
  const content = (
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
        {hasMentions ? (
          <span
            className="v4-related-card__mentions"
            title={`${mentions24h?.toLocaleString("en-US")} mentions in 24h`}
          >
            x {mentions24h?.toLocaleString("en-US")}
          </span>
        ) : null}
        {hasDelta ? (
          <span
            className={`v4-related-card__delta ${delta24h! >= 0 ? "is-up" : "is-down"}`}
            title={`${deltaLabel} stars in 24h`}
          >
            {deltaLabel}
          </span>
        ) : null}
        {language ? (
          <span className="v4-related-card__lang">{language}</span>
        ) : null}
        {stars ? (
          <span className="v4-related-card__stars inline-flex items-center gap-1">
            <BrandStar size={10} />
            {stars}
          </span>
        ) : null}
        {similarity ? (
          <span className="v4-related-card__why">{similarity}</span>
        ) : null}
      </footer>
    </>
  );

  if (href) {
    return (
      <RepoHoverPrefetchLink href={href} className={classNames}>
        {content}
      </RepoHoverPrefetchLink>
    );
  }

  return (
    <div className={classNames}>
      {content}
    </div>
  );
}
