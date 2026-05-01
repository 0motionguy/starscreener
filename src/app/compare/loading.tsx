// /compare — V4 multi-repo compare skeleton (head + repo selector + chart
// area + comparison table).

export default function CompareLoading() {
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
        {/* repo selector chips */}
        <div className="flex gap-2 flex-wrap">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-9 w-40 rounded-[2px]"
              style={{ background: "var(--v3-bg-050)" }}
            />
          ))}
        </div>
        {/* chart */}
        <div
          className="h-72 rounded-[2px]"
          style={{ background: "var(--v3-bg-050)" }}
        />
        {/* comparison rows */}
        <div className="space-y-1.5">
          {Array.from({ length: 6 }).map((_, i) => (
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
