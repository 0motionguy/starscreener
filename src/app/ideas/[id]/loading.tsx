// /ideas/[id] — V4 single-idea skeleton.

export default function IdeaDetailLoading() {
  return (
    <div className="max-w-[1600px] mx-auto px-4 md:px-6 py-4 md:py-6">
      <div className="animate-pulse space-y-4">
        <div className="space-y-2">
          <div
            className="h-3 w-24 rounded-[2px]"
            style={{ background: "var(--v3-bg-050)" }}
          />
          <div
            className="h-8 w-96 rounded-[2px]"
            style={{ background: "var(--v3-bg-100)" }}
          />
          <div
            className="h-3 w-64 rounded-[2px]"
            style={{ background: "var(--v3-bg-050)" }}
          />
        </div>
        {/* idea body */}
        <div
          className="h-64 rounded-[2px]"
          style={{ background: "var(--v3-bg-050)" }}
        />
        {/* reactions strip */}
        <div className="flex gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-9 w-16 rounded-[2px]"
              style={{ background: "var(--v3-bg-050)" }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
