// PvBreakout — 5-bubble velocity map. Pixel-faithful to index.html:401-411.
export function PvBreakout() {
  return (
    <div className="scrn-preview pv-breakout">
      <div className="mp head">
        <span className="mp-dot up" />
        <span className="mp-line short" style={{ background: "var(--accent)" }} />
        <span className="mp-line mid" />
      </div>
      <div className="mp-bubble bub1" />
      <div className="mp-bubble bub2" />
      <div className="mp-bubble bub3" />
      <div className="mp-bubble bub4" />
      <div className="mp-bubble bub5" />
      <div
        className="mp"
        style={{
          position: "absolute",
          bottom: 12,
          left: 12,
          right: 12,
          background: "rgba(8,9,10,0.85)",
          backdropFilter: "blur(8px)",
        }}
      >
        <span className="mp-line accent" style={{ flex: "0 0 20%" }} />
        <span className="mp-line up" style={{ flex: "0 0 22%" }} />
        <span
          className="mp-line"
          style={{ flex: "0 0 14%", background: "#878787" }}
        />
        <span
          className="mp-line"
          style={{ flex: "0 0 14%", background: "var(--info)" }}
        />
      </div>
    </div>
  );
}
