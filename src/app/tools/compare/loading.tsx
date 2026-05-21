// /tools/compare — two-column repo comparison skeleton.

export default function CompareLoading() {
  return (
    <div style={{ padding: "32px 22px", maxWidth: 1280, margin: "0 auto" }}>
      <div className="card">
        <div className="card-head"><span className="skel line mid" aria-hidden /></div>
        <div className="card-body" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <span className="skel card" aria-hidden />
          <span className="skel card" aria-hidden />
        </div>
      </div>
    </div>
  );
}
