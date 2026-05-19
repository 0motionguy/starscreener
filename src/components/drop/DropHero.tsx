// DropHero — title + lede + inline stats line.
//
// Echoes the `06-drop-repo.html` `.drop-hero` block. Server component:
// the stats numbers are passed in by the page so the live tracked-repo
// count + avg review time stay accurate as data refreshes.

interface DropHeroProps {
  trackedReposCount: number;
  avgReviewHours: number;
  promoteRatePct: number;
  recentPromotedCount: number;
  recentTotalCount: number;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

export function DropHero({
  trackedReposCount,
  avgReviewHours,
  promoteRatePct,
  recentPromotedCount,
  recentTotalCount,
}: DropHeroProps) {
  return (
    <div className="drop-hero">
      <h1>
        Drop a repo. <span className="accent">Surface yours.</span>
      </h1>
      <p>
        Paste a GitHub URL. We auto-fetch metadata, scan for cross-source
        mentions, score it against our momentum + consensus model, and
        (if it passes review) surface it to{" "}
        <b>{formatNumber(trackedReposCount)}</b> tracked repos. Average
        review: <b>{avgReviewHours} hours</b>. Recent drops:{" "}
        <b className="up-text">
          {recentPromotedCount} of {recentTotalCount} promoted
        </b>{" "}
        ({promoteRatePct}%).
      </p>
    </div>
  );
}
