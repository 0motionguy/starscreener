// Root loading fallback — also serves the home `/` table. Nested segments
// override with their own loading.tsx. Matches shell.css `.skel` primitives.

export default function RootLoading() {
  return (
    <div style={{ padding: "20px 22px", maxWidth: 1280, margin: "0 auto" }}>
      <div className="card">
        <div className="card-head">
          <span className="skel line mid" aria-hidden />
        </div>
        <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <span key={i} className="skel line long" aria-hidden />
          ))}
        </div>
      </div>
      <span className="visually-hidden" aria-live="polite">
        Loading…
      </span>
    </div>
  );
}
