// /tools/category-badges — V4 tool skeleton (header + gallery placeholder).

export default function CategoryBadgesLoading() {
  return (
    <div className="max-w-[1600px] mx-auto px-4 md:px-6 py-4 md:py-6">
      <div className="animate-pulse space-y-4">
        <div className="space-y-2">
          <div
            className="h-3 w-32 rounded-[2px]"
            style={{ background: "var(--v4-bg-050)" }}
          />
          <div
            className="h-7 w-80 rounded-[2px]"
            style={{ background: "var(--v4-bg-100)" }}
          />
          <div
            className="h-3 w-96 rounded-[2px]"
            style={{ background: "var(--v4-bg-050)" }}
          />
        </div>
        {/* badge gallery — 6 card placeholders */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="h-48 rounded-[2px]"
              style={{ background: "var(--v4-bg-050)" }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
