// IdeasBoardHero — Top-of-page eyebrow + title + dual-CTA strip.
// CTAs trigger overlays via the global `idea-submit` / `idea-trend` events
// dispatched by the modal controllers (kept declarative-only here so the
// hero is a server component — the modals attach listeners themselves).

import { FreshnessPill } from "@/components/shell/FreshnessPill";

interface IdeasBoardHeroProps {
  totalCount: number;
  shippedCount: number;
  newThisWeek: number;
  fetchedAt: string | null;
}

export function IdeasBoardHero({
  totalCount,
  shippedCount,
  newThisWeek,
  fetchedAt,
}: IdeasBoardHeroProps) {
  return (
    <div className="ideas-head">
      <div>
        <div
          className="page-eyebrow"
          style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}
        >
          <FreshnessPill source="repos" fetchedAt={fetchedAt} prefix="IDEAS BOARD" />
          <span style={{ color: "var(--fg-faint)" }}>
            · /ideas · {totalCount.toLocaleString()} live · {shippedCount} shipped
            {" "}· {newThisWeek} new this week
          </span>
        </div>
        <h1 className="page-title">Build the thing that doesn&apos;t exist yet.</h1>
        <p className="page-sub">
          Where contribution meets opportunity. Builders post unmet needs from
          trending repos, the community scores them with{" "}
          <b>Would Build / Would Use / Would Buy / Would Invest</b>, and the
          best ideas get claimed and shipped.
        </p>
      </div>
      <div
        className="ideas-cta-strip"
        style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
      >
        <button
          type="button"
          className="cta-primary"
          data-idea-action="submit"
        >
          Submit an idea
        </button>
        <button
          type="button"
          className="cta-secondary"
          data-idea-action="trend"
        >
          Generate from trend
        </button>
      </div>
    </div>
  );
}
