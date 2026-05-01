// /collections/[slug] — V4 collection-detail skeleton (hero + member grid).

export default function CollectionDetailLoading() {
  return (
    <div className="max-w-[1600px] mx-auto px-4 md:px-6 py-4 md:py-6">
      <div className="animate-pulse space-y-4">
        {/* hero */}
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
        <div
          className="h-12 rounded-[2px]"
          style={{ background: "var(--v3-bg-050)" }}
        />
        {/* members */}
        <div className="space-y-1.5">
          {Array.from({ length: 10 }).map((_, i) => (
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
