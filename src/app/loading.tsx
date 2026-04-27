// Root-level <Suspense> fallback. Renders inside the V2 chrome
// (HeaderV2 + SidebarV2 from root layout) so users always see the
// shell while a route's RSC payload streams. Hairline list matching
// V2 card chrome; rows fade as they descend.

export default function RootLoading() {
  return (
    <div className="v2-frame py-6">
      <p className="v2-mono mb-4" style={{ color: "var(--v2-ink-300)" }}>
        <span aria-hidden>{"// "}</span>
        LOADING · STREAMING ROWS
      </p>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 1,
          background: "var(--v2-line-100)",
          border: "1px solid var(--v2-line-100)",
        }}
      >
        {Array.from({ length: 10 }).map((_, i) => (
          <div
            key={i}
            style={{
              height: 56,
              background: "var(--v2-bg-050)",
              display: "grid",
              gridTemplateColumns: "60px 1fr 120px 80px 100px",
              alignItems: "center",
              gap: 16,
              padding: "0 16px",
              opacity: 1 - i * 0.06,
            }}
          >
            <div style={{ height: 12, background: "var(--v2-line-200)", width: 32 }} />
            <div
              style={{
                height: 12,
                background: "var(--v2-line-200)",
                width: `${60 + ((i * 7) % 30)}%`,
              }}
            />
            <div style={{ height: 12, background: "var(--v2-line-200)", width: 80 }} />
            <div style={{ height: 12, background: "var(--v2-line-200)", width: 60 }} />
            <div style={{ height: 12, background: "var(--v2-line-200)", width: 70 }} />
          </div>
        ))}
      </div>
    </div>
  );
}
