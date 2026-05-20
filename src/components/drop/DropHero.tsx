interface DropHeroProps {
  trackedReposCount: number;
  avgReviewHours: number;
  listedRatePct: number;
  recentListedCount: number;
  recentTotalCount: number;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

export function DropHero({
  trackedReposCount,
  avgReviewHours,
  listedRatePct,
  recentListedCount,
  recentTotalCount,
}: DropHeroProps) {
  return (
    <div className="drop-hero">
      <h1>
        Drop a repo. <span className="accent">Surface yours.</span>
      </h1>
      <p>
        Paste a GitHub URL. We auto-fetch metadata, scan for cross-source
        mentions, attach the review packet, and surface accepted drops to{" "}
        <b>{formatNumber(trackedReposCount)}</b> tracked repos. Average review:{" "}
        <b>{avgReviewHours} hours</b>. Recent listed drops:{" "}
        <b className="up-text">
          {recentListedCount} of {recentTotalCount} listed
        </b>{" "}
        ({listedRatePct}%).
      </p>
    </div>
  );
}
