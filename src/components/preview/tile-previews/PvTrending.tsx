// PvTrending — 5-column mini-grid mirroring 01-trending.html's category
// switcher. Pixel-faithful to index.html:374-388 (tile 01).
export function PvTrending() {
  return (
    <div className="scrn-preview pv-trending">
      <div className="mp head">
        <span className="mp-dot up" />
        <span className="mp-line short accent" />
        <span className="mp-line mid" />
      </div>
      <div className="mp" style={{ background: "var(--surface-2)" }}>
        <span className="mp-line up" style={{ flex: "0 0 20%" }} />
        <span className="mp-line accent" style={{ flex: "0 0 20%" }} />
        <span className="mp-line" style={{ flex: "0 0 20%" }} />
        <span className="mp-line" style={{ flex: "0 0 20%" }} />
        <span className="mp-line" style={{ flex: "0 0 18%" }} />
      </div>
      <div
        className="mp-grid"
        style={{ gridTemplateColumns: "repeat(5, 1fr)", gap: 4, flex: 1 }}
      >
        <div className="mp-mini">
          <span className="mp-num">REPOS</span>
          <span className="mp-sm">847</span>
          <div className="mp-spark-mini" />
        </div>
        <div className="mp-mini">
          <span className="mp-num">SKILLS</span>
          <span className="mp-sm">126</span>
          <div className="mp-spark-mini" />
        </div>
        <div className="mp-mini">
          <span className="mp-num">MCP</span>
          <span className="mp-sm">312</span>
          <div className="mp-spark-mini" />
        </div>
        <div className="mp-mini">
          <span className="mp-num">AGENTS</span>
          <span className="mp-sm">194</span>
          <div className="mp-spark-mini" />
        </div>
        <div className="mp-mini">
          <span className="mp-num">LLMS</span>
          <span className="mp-sm">438</span>
          <div className="mp-spark-mini" />
        </div>
      </div>
      <div className="mp" style={{ background: "var(--surface-2)" }}>
        <span className="mp-dot up" />
        <span
          className="mp-line short"
          style={{ background: "var(--src-github)" }}
        />
        <span
          className="mp-line short"
          style={{ background: "var(--src-hackernews)" }}
        />
        <span
          className="mp-line short"
          style={{ background: "var(--src-x)" }}
        />
        <span
          className="mp-line short"
          style={{ background: "var(--src-reddit)" }}
        />
        <span
          className="mp-line short"
          style={{ background: "var(--src-bluesky)" }}
        />
      </div>
    </div>
  );
}
