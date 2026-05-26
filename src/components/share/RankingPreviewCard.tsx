// TrendingRepo — RankingPreviewCard.
//
// The "TRENDINGREPO TOP 10" preview lockup that lives inside the SharePanel
// when variant="ranking". Pure server-rendered, no client deps — drops the
// preview straight into the SharePanel preview slot.
//
// Visual goal: a miniature of the share-card PNG so the user sees what they'll
// post BEFORE clicking download. The full-size card is rendered by the OG
// endpoint (/api/og/top10) but the preview here uses the same lockup so the
// composition stays in sync visually.
//
// Composition (top to bottom):
//   1. Eyebrow row — wordmark chip + "TOP 10" badge + ISO date right-aligned
//   2. Title row   — display headline ("The Top 10, frozen daily.")
//   3. List        — up to 5 ranked items (rank · name · delta)
//   4. Footer bar  — "trendingrepo.com" mark + optional brand glyph
//
// Tokens read via var(--*). The card sits inside .share-preview so it inherits
// the panel's surface; the card pushes its own light atmosphere with a thin
// radial accent glow in the top-left corner.

import type { ReactNode } from "react";

export interface RankingPreviewItem {
  rank: number;
  /** Full display name, e.g. "vercel/next.js" or "Next.js". */
  name: string;
  /** Optional delta string, e.g. "+12%", "+1.4k". Rendered in accent. */
  delta?: string;
  /** Optional secondary label, e.g. "stars" or "mentions". */
  metric?: string;
}

export interface RankingPreviewCardProps {
  /** Headline copy, e.g. "Top 10 frozen daily" / "Tier list this week". */
  title?: string;
  /** Small badge text, e.g. "TOP 10", "TIER LIST", "STAR HISTORY". */
  badge?: string;
  /** ISO date or human label shown top-right (e.g. "2026-05-23 · UTC"). */
  caption?: string;
  /** Up to 5 ranked items. */
  items: RankingPreviewItem[];
  /** Footer URL (defaults to trendingrepo.com). */
  footerUrl?: string;
  /** Optional right-aligned footer slot — e.g. a brand glyph. */
  footerSlot?: ReactNode;
}

const MAX_ITEMS = 5;

export function RankingPreviewCard({
  title = "Top 10, frozen daily",
  badge = "TOP 10",
  caption,
  items,
  footerUrl = "trendingrepo.com",
  footerSlot,
}: RankingPreviewCardProps) {
  const visible = items.slice(0, MAX_ITEMS);

  return (
    <article className="rank-preview" aria-label={`${badge} preview card`}>
      <div className="rank-preview-glow" aria-hidden="true" />

      <header className="rank-preview-eyebrow">
        <span className="rank-preview-mark">
          <span className="rank-preview-mark-chip" aria-hidden="true">
            t
            <span className="rank-preview-mark-dot">.</span>
          </span>
          <span className="rank-preview-mark-name">trendingrepo</span>
        </span>
        <span className="rank-preview-badge">{badge}</span>
        {caption ? <span className="rank-preview-caption">{caption}</span> : null}
      </header>

      <h3 className="rank-preview-title">{title}</h3>

      {visible.length === 0 ? (
        <div className="rank-preview-empty">No items to preview yet.</div>
      ) : (
        <ol className="rank-preview-list">
          {visible.map((item) => (
            <li key={`${item.rank}-${item.name}`} className="rank-preview-row">
              <span className="rank-preview-rank">
                {String(item.rank).padStart(2, "0")}
              </span>
              <span className="rank-preview-name" title={item.name}>
                {item.name}
              </span>
              {item.delta ? (
                <span className="rank-preview-delta">{item.delta}</span>
              ) : null}
              {item.metric ? (
                <span className="rank-preview-metric">{item.metric}</span>
              ) : null}
            </li>
          ))}
        </ol>
      )}

      <footer className="rank-preview-footer">
        <span className="rank-preview-footer-url">{footerUrl}</span>
        {footerSlot ? <span className="rank-preview-footer-slot">{footerSlot}</span> : null}
      </footer>
    </article>
  );
}

export default RankingPreviewCard;
