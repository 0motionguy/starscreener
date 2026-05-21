// /tools/star-history — single chart canvas.

export default function StarHistoryLoading() {
  return (
    <div style={{ padding: "32px 22px", maxWidth: 1280, margin: "0 auto" }}>
      <div className="card">
        <div className="card-head"><span className="skel line mid" aria-hidden /></div>
        <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <span className="skel card" aria-hidden style={{ height: 360 }} />
        </div>
      </div>
    </div>
  );
}
