// /tools/star-history — V4 chart-tool skeleton (input + big chart).

export default function StarHistoryLoading() {
  return (
    <div className="max-w-[1600px] mx-auto px-4 md:px-6 py-4 md:py-6">
      <div className="animate-pulse space-y-4">
        <div className="space-y-2">
          <div
            className="h-3 w-24 rounded-[2px]"
            style={{ background: "var(--v3-bg-050)" }}
          />
          <div
            className="h-7 w-64 rounded-[2px]"
            style={{ background: "var(--v3-bg-100)" }}
          />
          <div
            className="h-3 w-80 rounded-[2px]"
            style={{ background: "var(--v3-bg-050)" }}
          />
        </div>
        {/* repo input strip */}
        <div
          className="h-12 rounded-[2px]"
          style={{ background: "var(--v3-bg-050)" }}
        />
        {/* chart */}
        <div
          className="h-[480px] rounded-[2px]"
          style={{ background: "var(--v3-bg-050)" }}
        />
      </div>
    </div>
  );
}
