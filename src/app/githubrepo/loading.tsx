// /githubrepo — V4 trending-repos skeleton.
//
// CACHE CONTRACT: ISR-fallback skeleton.
// Renders during ISR generation (revalidateSeconds=600) or on cold first
// paint. Heights match the actual page rhythm — page-head + KPI strip +
// RankTabs + dense list of ~50 rows — so layout shift is minimal once
// the underlying RSC stream resolves.

export default function GithubRepoLoading() {
  return (
    <div className="max-w-[1600px] mx-auto px-4 md:px-6 py-4 md:py-6">
      <div className="animate-pulse space-y-4">
        {/* PageHead */}
        <div className="space-y-2">
          <div
            className="h-3 w-24 rounded-[2px]"
            style={{ background: "var(--v3-bg-050)" }}
          />
          <div
            className="h-7 w-72 rounded-[2px]"
            style={{ background: "var(--v3-bg-100)" }}
          />
          <div
            className="h-3 w-96 rounded-[2px]"
            style={{ background: "var(--v3-bg-050)" }}
          />
        </div>

        {/* MetricGrid (4-up KPI strip) */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-16 rounded-[2px]"
              style={{ background: "var(--v3-bg-050)" }}
            />
          ))}
        </div>

        {/* RankTabs row */}
        <div
          className="h-10 rounded-[2px]"
          style={{ background: "var(--v3-bg-050)" }}
        />

        {/* Trending top-50 rows */}
        <div className="space-y-1.5">
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className="h-12 rounded-[2px]"
              style={{ background: "var(--v3-bg-050)" }}
            />
          ))}
        </div>

        {/* ChartStats / categories band */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-24 rounded-[2px]"
              style={{ background: "var(--v3-bg-050)" }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
