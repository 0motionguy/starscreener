// Root loading fallback — also serves the home `/` table while data streams.
// Nested segments override with their own loading.tsx. Uses the shell.css
// `.spinner` + `.skel` primitives inside the standard canvas padding so it
// reads as an intentional loading state, not a stray box in empty space.

export default function RootLoading() {
  return (
    <div style={{ padding: "20px 22px", maxWidth: 1280, margin: "0 auto" }} aria-busy="true">
      <div className="load-state" role="status">
        <span className="spinner" aria-hidden />
        Loading
        <span className="visually-hidden" aria-live="polite">
          Loading the latest trending data…
        </span>
      </div>

      <div className="card">
        <div className="card-head">
          <span className="skel line mid" aria-hidden />
        </div>
        <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {Array.from({ length: 10 }).map((_, i) => (
            <span key={i} className="skel line long" aria-hidden />
          ))}
        </div>
      </div>
    </div>
  );
}
