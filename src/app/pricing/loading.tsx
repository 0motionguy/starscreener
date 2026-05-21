// /pricing — 4 tier columns.

export default function PricingLoading() {
  return (
    <div style={{ padding: "32px 22px", maxWidth: 1280, margin: "0 auto" }}>
      <div className="card">
        <div className="card-head"><span className="skel line mid" aria-hidden /></div>
        <div className="card-body" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <span key={i} className="skel card" aria-hidden style={{ height: 320 }} />
          ))}
        </div>
      </div>
    </div>
  );
}
