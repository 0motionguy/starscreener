// /tools/tier-list — stacked tier rows.

export default function TierListLoading() {
  return (
    <div style={{ padding: "32px 22px", maxWidth: 1280, margin: "0 auto" }}>
      <div className="card">
        <div className="card-head"><span className="skel line mid" aria-hidden /></div>
        <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <span key={i} className="skel card" aria-hidden style={{ height: 80 }} />
          ))}
        </div>
      </div>
    </div>
  );
}
