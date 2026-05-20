// PvDetail — repo-detail preview: identity row + hero star-history chart +
// 4-source breakdown grid. Pixel-faithful to index.html:461-489.
export function PvDetail() {
  return (
    <div className="scrn-preview pv-detail">
      <div className="mp head">
        <span className="mp-dot up" />
        <span
          className="mp-line short"
          style={{ background: "#ff6b35" }}
        />
        <span className="mp-line mid" />
      </div>
      <div
        className="mp"
        style={{
          background:
            "linear-gradient(135deg, var(--surface-2), var(--surface))",
          padding: 8,
        }}
      >
        <div
          style={{
            width: 28,
            height: 28,
            background: "#000",
            color: "#fff",
            borderRadius: 2,
            display: "grid",
            placeItems: "center",
            fontFamily: "var(--font-display)",
            fontSize: 16,
            fontWeight: 800,
          }}
        >
          ▲
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span
            className="mp-line accent"
            style={{ flex: "0 0 40%", display: "block" }}
          />
          <span
            className="mp-line"
            style={{ flex: "0 0 70%", display: "block", marginTop: 3 }}
          />
        </div>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 14,
            fontWeight: 700,
            background:
              "linear-gradient(135deg, var(--accent), var(--warning))",
            WebkitBackgroundClip: "text",
            color: "transparent",
          }}
        >
          94
        </div>
      </div>
      <div className="mp-hero-chart">
        <span className="ep1" />
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 3,
        }}
      >
        {[
          "var(--src-github)",
          "var(--src-hackernews)",
          "var(--src-reddit)",
          "var(--src-x)",
        ].map((bg, i) => (
          <div
            key={i}
            style={{ height: 12, background: bg, borderRadius: 1 }}
          />
        ))}
      </div>
    </div>
  );
}
