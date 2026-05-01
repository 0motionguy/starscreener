// /tools/treemap — V4 treemap-tool skeleton.

export default function TreemapLoading() {
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
        {/* control strip */}
        <div className="flex gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-8 w-28 rounded-[2px]"
              style={{ background: "var(--v3-bg-050)" }}
            />
          ))}
        </div>
        {/* treemap canvas */}
        <div
          className="h-[560px] rounded-[2px]"
          style={{ background: "var(--v3-bg-050)" }}
        />
      </div>
    </div>
  );
}
