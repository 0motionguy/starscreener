// /tools/revenue-estimate — V4 W10p1 calculator-tool skeleton.

export default function RevenueEstimateLoading() {
  return (
    <div className="max-w-[1600px] mx-auto px-4 md:px-6 py-4 md:py-6">
      <div className="animate-pulse space-y-4">
        <div className="space-y-2">
          <div
            className="h-3 w-32 rounded-[2px]"
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
        {/* form strip */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-16 rounded-[2px]"
              style={{ background: "var(--v3-bg-050)" }}
            />
          ))}
        </div>
        {/* result band */}
        <div
          className="h-32 rounded-[2px]"
          style={{ background: "var(--v3-bg-050)" }}
        />
      </div>
    </div>
  );
}
