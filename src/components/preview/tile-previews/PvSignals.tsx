// PvSignals — area chart + 8 source dots + 7-cell heatmap row.
// Pixel-faithful to index.html:425-448.
export function PvSignals() {
  const HEATMAP_CELLS = [
    "oklch(0.65 0.20 39)",
    "oklch(0.55 0.15 39)",
    "oklch(0.45 0.12 39)",
    "oklch(0.40 0.10 39)",
    "oklch(0.34 0.06 80)",
    "oklch(0.28 0.05 200)",
    "oklch(0.26 0.04 260)",
  ];
  const SOURCE_DOTS = [
    "var(--src-github)",
    "var(--src-hackernews)",
    "var(--src-reddit)",
    "var(--src-x)",
    "var(--src-bluesky)",
    "var(--src-dev)",
    "var(--src-arxiv)",
    "var(--src-npm)",
  ];

  return (
    <div className="scrn-preview pv-signals">
      <div className="mp head">
        <span className="mp-dot up" />
        <span className="mp-line short accent" />
        <span className="mp-line mid" />
      </div>
      <div className="mp-area-chart" />
      <div className="mp" style={{ background: "var(--surface-2)" }}>
        {SOURCE_DOTS.map((bg, i) => (
          <span
            key={i}
            style={{ width: 8, height: 8, background: bg, borderRadius: "50%" }}
          />
        ))}
      </div>
      <div className="mp-grid" style={{ gridTemplateColumns: "repeat(7, 1fr)" }}>
        {HEATMAP_CELLS.map((bg, i) => (
          <div key={i} style={{ aspectRatio: "1", background: bg }} />
        ))}
      </div>
    </div>
  );
}
