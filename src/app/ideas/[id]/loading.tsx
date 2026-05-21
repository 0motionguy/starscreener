// /ideas/[id] — idea detail with body + meta sidebar.

export default function IdeaDetailLoading() {
  return (
    <div style={{ padding: "32px 22px", maxWidth: 1080, margin: "0 auto" }}>
      <div className="card">
        <div className="card-head"><span className="skel line mid" aria-hidden /></div>
        <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <span className="skel line long" aria-hidden />
          <span className="skel line long" aria-hidden />
          <span className="skel line mid" aria-hidden />
          <span className="skel card" aria-hidden style={{ height: 180 }} />
        </div>
      </div>
    </div>
  );
}
