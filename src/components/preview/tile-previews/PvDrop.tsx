// PvDrop — 4-step submission funnel. Pixel-faithful to index.html:524-544.
export function PvDrop() {
  return (
    <div className="scrn-preview pv-drop">
      <div className="mp head">
        <span className="mp-dot up" />
        <span
          className="mp-line short"
          style={{ background: "var(--accent)" }}
        />
        <span className="mp-line mid" />
      </div>
      <div className="mp" style={{ background: "var(--surface-2)", gap: 10 }}>
        <div className="step-dot done">✓</div>
        <span className="step-line on" />
        <div className="step-dot on">2</div>
        <span className="step-line" />
        <div className="step-dot">3</div>
        <span className="step-line" />
        <div className="step-dot">4</div>
      </div>
      <div className="mp" style={{ background: "var(--bg)", padding: "8px 10px" }}>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: "var(--fg-faint)",
          }}
        >
          github.com/
        </span>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: "var(--fg-bright)",
            flex: 1,
          }}
        >
          unixgaming/repo-radar
        </span>
        <span
          className="step-dot on"
          style={{
            width: "auto",
            padding: "0 8px",
            height: 16,
            borderRadius: 2,
            fontSize: 8,
          }}
        >
          FETCH
        </span>
      </div>
      <div
        className="mp-area-chart"
        style={{
          background:
            "linear-gradient(135deg, var(--accent-wash), transparent)",
          flex: 1,
          padding: 8,
          display: "flex",
          flexDirection: "column",
          gap: 5,
        }}
      >
        <span className="mp-line accent" style={{ flex: "0 0 30%" }} />
        <span className="mp-line" style={{ flex: "0 0 60%" }} />
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 16,
            fontWeight: 700,
            color: "var(--accent)",
            marginTop: "auto",
            alignSelf: "flex-end",
          }}
        >
          62/100
        </span>
      </div>
    </div>
  );
}
