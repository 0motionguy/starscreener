// /funding/_health — loading skeleton.

export default function FundingHealthLoading() {
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
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-16 rounded-[2px]"
              style={{ background: "var(--v3-bg-050)" }}
            />
          ))}
        </div>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <div
              className="h-5 w-64 rounded-[2px]"
              style={{ background: "var(--v3-bg-100)" }}
            />
            <div
              className="h-32 rounded-[2px]"
              style={{ background: "var(--v3-bg-050)" }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
