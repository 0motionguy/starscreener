// /tools hub — grid of tool cards. Skeleton matches grid shape.

export default function ToolsLoading() {
  return (
    <div style={{ padding: "32px 22px", maxWidth: 1280, margin: "0 auto" }}>
      <div className="card">
        <div className="card-head">
          <span className="skel line mid" aria-hidden />
        </div>
        <div className="card-body" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <span key={i} className="skel card" aria-hidden />
          ))}
        </div>
      </div>
    </div>
  );
}
