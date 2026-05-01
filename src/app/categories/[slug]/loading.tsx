// /categories/[slug] — V4 category-detail skeleton (hero + KPI + member rows).

export default function CategoryDetailLoading() {
  return (
    <div className="max-w-[1600px] mx-auto px-4 md:px-6 py-4 md:py-6">
      <div className="animate-pulse space-y-4">
        <div className="space-y-2">
          <div
            className="h-3 w-40 rounded-[2px]"
            style={{ background: "var(--v3-bg-050)" }}
          />
          <div
            className="h-8 w-72 rounded-[2px]"
            style={{ background: "var(--v3-bg-100)" }}
          />
          <div
            className="h-3 w-96 rounded-[2px]"
            style={{ background: "var(--v3-bg-050)" }}
          />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-16 rounded-[2px]"
              style={{ background: "var(--v3-bg-050)" }}
            />
          ))}
        </div>
        <div className="space-y-1.5">
          {Array.from({ length: 12 }).map((_, i) => (
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
