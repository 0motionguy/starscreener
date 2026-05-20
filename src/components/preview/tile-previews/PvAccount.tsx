// PvAccount — identity hero card + 4-cell stat grid. Pixel-faithful to
// index.html:493-510.
export function PvAccount() {
  return (
    <div className="scrn-preview pv-account">
      <div
        className="mp head"
        style={{
          background:
            "linear-gradient(135deg, var(--accent-wash), transparent)",
        }}
      >
        <div className="mp-id" />
        <div style={{ flex: 1 }}>
          <span
            className="mp-line short accent"
            style={{ display: "block" }}
          />
          <span
            className="mp-line short"
            style={{ display: "block", marginTop: 3 }}
          />
        </div>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            color: "var(--accent)",
            padding: "2px 6px",
            background: "var(--accent-soft)",
            borderRadius: 99,
            border: "1px solid var(--accent-soft)",
          }}
        >
          PRO
        </span>
      </div>
      <div
        className="mp-grid"
        style={{ gridTemplateColumns: "repeat(4, 1fr)" }}
      >
        <div className="mp-mini">
          <span className="mp-num">WATCH</span>
          <span className="mp-sm">18</span>
        </div>
        <div className="mp-mini">
          <span className="mp-num">ALERTS</span>
          <span className="mp-sm">12</span>
        </div>
        <div className="mp-mini">
          <span className="mp-num">REFS</span>
          <span className="mp-sm">14</span>
        </div>
        <div className="mp-mini">
          <span className="mp-num">DROPS</span>
          <span className="mp-sm">8</span>
        </div>
      </div>
      <div className="mp" style={{ background: "var(--surface-2)" }}>
        <span className="mp-line up" style={{ flex: "0 0 30%" }} />
        <span className="mp-line accent" style={{ flex: "0 0 22%" }} />
        <span className="mp-line" style={{ flex: "0 0 22%" }} />
      </div>
      <div className="mp" style={{ background: "var(--surface-2)" }}>
        <span className="mp-line" style={{ flex: "0 0 60%" }} />
        <span className="mp-line up" style={{ flex: "0 0 18%" }} />
      </div>
    </div>
  );
}
