// /docs/api — skeleton while the spec loads (rare; the disk read is ms-scale).
//
// The page is ISR — most visitors hit the pre-rendered version. This
// skeleton only shows on the rare on-demand revalidation tick. Same
// pattern as /tools/loading.tsx so the chrome holds steady.

export default function Loading() {
  return (
    <main className="home-surface" style={{ paddingBottom: 48 }}>
      <div className="animate-pulse" style={{ padding: "0 0 24px" }}>
        <div
          style={{
            height: 28,
            width: "55%",
            background: "var(--v4-bg-100)",
            borderRadius: 2,
            marginBottom: 12,
          }}
        />
        <div
          style={{
            height: 14,
            width: "75%",
            background: "var(--v4-bg-050)",
            borderRadius: 2,
            marginBottom: 8,
          }}
        />
        <div
          style={{
            height: 14,
            width: "65%",
            background: "var(--v4-bg-050)",
            borderRadius: 2,
            marginBottom: 24,
          }}
        />
        {[1, 2, 3].map((row) => (
          <div
            key={row}
            style={{
              height: 84,
              background: "var(--v4-bg-050)",
              borderRadius: 2,
              marginBottom: 10,
              border: "1px solid var(--v4-line-100)",
            }}
          />
        ))}
      </div>
    </main>
  );
}
