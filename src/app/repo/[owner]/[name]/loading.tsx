// Route-specific loading skeleton for /repo/[owner]/[name]. Mirrors the
// real page's outer chrome (header strip, stats row, panel grid) so the
// hand-off into rendered content has zero layout shift. Fires whenever
// the ISR cache rebuilds (every 5 min) and on first navigation to a
// new repo.

export default function RepoLoading() {
  return (
    <div className="max-w-[1600px] mx-auto px-4 md:px-6 py-4 md:py-6">
      <div className="animate-pulse space-y-4">
        {/* Header: avatar + name + badges */}
        <div className="flex items-center gap-3">
          <div
            className="h-10 w-10 rounded-[2px]"
            style={{ background: "var(--v3-bg-100)" }}
          />
          <div className="flex flex-col gap-1.5">
            <div
              className="h-5 w-64 rounded-[2px]"
              style={{ background: "var(--v3-bg-100)" }}
            />
            <div
              className="h-3 w-40 rounded-[2px]"
              style={{ background: "var(--v3-bg-050)" }}
            />
          </div>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-16 rounded-[2px]"
              style={{ background: "var(--v3-bg-050)" }}
            />
          ))}
        </div>

        {/* Chart placeholder */}
        <div
          className="h-64 rounded-[2px]"
          style={{ background: "var(--v3-bg-050)" }}
        />

        {/* Two-column panel grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-40 rounded-[2px]"
              style={{ background: "var(--v3-bg-050)" }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
