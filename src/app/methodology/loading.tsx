// /methodology — static-prose skeleton.
//
// CACHE CONTRACT: static (built at deploy, no revalidate). This loading.tsx
// only fires during initial RSC stream / route transition. Mirrors the
// narrow 880-px prose column with kicker + h1 + 4-line lede + a few section
// blocks so layout shift is minimal once the markdown content lands.

export default function MethodologyLoading() {
  return (
    <main
      className="home-surface"
      style={{
        paddingTop: 24,
        paddingBottom: 48,
        maxWidth: 880,
        margin: "0 auto",
      }}
    >
      <div className="animate-pulse space-y-6 px-4 md:px-6">
        {/* Header */}
        <div className="space-y-3">
          <div
            className="h-3 w-40 rounded-[2px]"
            style={{ background: "var(--v3-bg-050)" }}
          />
          <div
            className="h-9 w-72 rounded-[2px]"
            style={{ background: "var(--v3-bg-100)" }}
          />
          <div className="space-y-2 pt-2">
            <div
              className="h-3 w-full rounded-[2px]"
              style={{ background: "var(--v3-bg-050)" }}
            />
            <div
              className="h-3 w-[92%] rounded-[2px]"
              style={{ background: "var(--v3-bg-050)" }}
            />
            <div
              className="h-3 w-[85%] rounded-[2px]"
              style={{ background: "var(--v3-bg-050)" }}
            />
          </div>
        </div>

        {/* 3 prose sections */}
        {Array.from({ length: 3 }).map((_, section) => (
          <div key={section} className="space-y-2">
            <div
              className="h-5 w-48 rounded-[2px]"
              style={{ background: "var(--v3-bg-100)" }}
            />
            {Array.from({ length: 4 }).map((_, line) => (
              <div
                key={line}
                className="h-3 rounded-[2px]"
                style={{
                  background: "var(--v3-bg-050)",
                  width: `${88 - line * 6}%`,
                }}
              />
            ))}
          </div>
        ))}
      </div>
    </main>
  );
}
