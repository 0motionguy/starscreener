// /repo/[owner]/[name] — repo-detail hero + stats grid skeleton.

export default function RepoDetailLoading() {
  return (
    <div style={{ padding: "32px 22px", maxWidth: 1280, margin: "0 auto" }}>
      <div className="card">
        <div className="card-head"><span className="skel line mid" aria-hidden /></div>
        <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <span className="skel line long" aria-hidden />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <span key={i} className="skel card" aria-hidden style={{ height: 70 }} />
            ))}
          </div>
          <span className="skel card" aria-hidden style={{ height: 240 }} />
        </div>
      </div>
    </div>
  );
}
