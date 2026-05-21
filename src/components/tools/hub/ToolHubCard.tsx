"use client";

// ToolHubCard — single card in the /tools hub 6-tile grid.
//
// Each card frames one share-worthy tool: it carries the hover-animated
// itshover icon (passed in as a node — caller picks BookmarkIcon /
// TrophyIcon / etc.), an eyebrow with route badge + FRESH pill, the title +
// tagline, a SERVER-rendered preview slot (children — real data, NOT a
// skeleton), and a foot with primary CTA ("Open tool") + ShareCTAButton.
//
// Why client: the itshover icons depend on framer-motion's onHoverStart, and
// the share button needs window.open / navigator.clipboard. The preview slot
// stays server-rendered (children prop) so the data fetch cost lives in the
// parent server page, not the bundle.

import Link from "next/link";
import type { ReactNode } from "react";

import { ShareCTAButton } from "./ShareCTAButton";

export interface ToolHubCardProps {
  /** Two-digit numeric eyebrow, e.g. "01". */
  number: string;
  /** Tool slug — used to build `/tools/{slug}` + share intent URL. */
  slug: string;
  /** Animated itshover icon node, e.g. <BookmarkIcon size={22} />. */
  icon: ReactNode;
  /** Card title (e.g. "Watchlist"). */
  title: string;
  /** Single-line tagline shown under the title. */
  tagline: string;
  /** Pre-filled tweet text for the share intent. */
  shareText: string;
  /** Optional hashtags joined into the X-intent URL. */
  hashtags?: string[];
  /** Route badge text (defaults to "/tools/{slug}"). */
  routeLabel?: string;
  /** Optional muted footer meta (e.g. "Live - 184 tracked"). */
  metaLabel?: ReactNode;
  /** Render preview snippet. */
  children?: ReactNode;
  /** Override the share URL (e.g. inject a deep-link query). */
  shareUrl?: string;
}

export function ToolHubCard({
  number,
  slug,
  icon,
  title,
  tagline,
  shareText,
  hashtags,
  routeLabel,
  metaLabel,
  children,
  shareUrl,
}: ToolHubCardProps) {
  const href = `/tools/${slug}`;
  const label = routeLabel ?? href;

  return (
    <article className="hub-card" data-slug={slug}>
      <header className="hub-card-head">
        <span className="hub-card-num">{"// "}{number}</span>
        <span className="hub-card-route">{label}</span>
      </header>

      <div className="hub-card-title-row">
        <span className="hub-card-icon" aria-hidden="true">{icon}</span>
        <div className="hub-card-title-block">
          <h3 className="hub-card-title">{title}</h3>
          <p className="hub-card-tagline">{tagline}</p>
        </div>
      </div>

      <div className="hub-card-preview" data-preview-slug={slug}>
        {children}
      </div>

      <footer className="hub-card-foot">
        <Link href={href} prefetch={false} className="hub-card-cta">
          Open tool <span aria-hidden="true">{"->"}</span>
        </Link>
        <div className="hub-card-share-wrap">
          {metaLabel ? <span className="hub-card-meta">{metaLabel}</span> : null}
          <ShareCTAButton
            shareText={shareText}
            hashtags={hashtags}
            forceUrl={shareUrl}
            size="sm"
          />
        </div>
      </footer>
    </article>
  );
}
