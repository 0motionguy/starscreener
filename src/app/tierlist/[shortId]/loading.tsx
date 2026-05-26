// /tierlist/[shortId] — saved-view skeleton.

export default function TierlistShareLoading() {
  return (
    <main className="home-surface tools-page tierlist-page">
      <div className="tier-skeleton">
        <div className="tier-skeleton-eyebrow" />
        <div className="tier-skeleton-title" />
        <div className="tier-skeleton-sub" />
        <div className="tier-skeleton-board">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="tier-skeleton-row" />
          ))}
        </div>
      </div>
    </main>
  );
}
