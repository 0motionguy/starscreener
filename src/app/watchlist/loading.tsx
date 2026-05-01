// /watchlist — V4 leaderboard skeleton.

export default function WatchlistLoading() {
  return (
    <div className="max-w-[1600px] mx-auto px-4 md:px-6 py-4 md:py-6">
      <div className="animate-pulse space-y-4">
        <div className="space-y-2">
          <div
            className="h-3 w-24 rounded-[2px]"
            style={{ background: "var(--v3-bg-050)" }}
          />
          <div
            className="h-7 w-56 rounded-[2px]"
            style={{ background: "var(--v3-bg-100)" }}
          />
          <div
            className="h-3 w-80 rounded-[2px]"
            style={{ background: "var(--v3-bg-050)" }}
          />
        </div>
        <div
          className="h-12 rounded-[2px]"
          style={{ background: "var(--v3-bg-050)" }}
        />
        <div className="space-y-1.5">
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              className="h-12 rounded-[2px]"
              style={{ background: "var(--v3-bg-050)" }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
