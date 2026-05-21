// /tools/top-10 — ranked list skeleton.

export default function Top10Loading() {
  return (
    <div style={{ padding: "32px 22px", maxWidth: 1080, margin: "0 auto" }}>
      <div className="card">
        <div className="card-head"><span className="skel line mid" aria-hidden /></div>
        <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {Array.from({ length: 10 }).map((_, i) => (
            <span key={i} className="skel line long" aria-hidden />
          ))}
        </div>
      </div>
    </div>
  );
}
