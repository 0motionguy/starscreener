// ToolsKpiStrip — 5-cell `.tools-kpi` strip.
// Tools live · Plots today · Watchlist items · Compares saved · Digest subscribers.
// Watchlist + Compares are client-side Zustand; server passes 0 and the cell
// degrades to a copy hint when no data is available (KPI numbers stay honest).

interface ToolsKpiStripProps {
  toolsLive: number;
  toolsTotal: number;
  plotsToday: number;
  watchlistItems: number;
  comparesSaved: number;
  digestSubscribers: number;
}

export function ToolsKpiStrip({
  toolsLive,
  toolsTotal,
  plotsToday,
  watchlistItems,
  comparesSaved,
  digestSubscribers,
}: ToolsKpiStripProps) {
  return (
    <div
      className="tools-kpi fade-up"
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(5, 1fr)",
        gap: 1,
        background: "var(--border-subtle)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "var(--r-1)",
        margin: "0 0 20px",
      }}
    >
      <div className="cell" style={{ background: "var(--surface)", padding: "14px 16px" }}>
        <div className="l">Tools live</div>
        <div className="v lava">
          {toolsLive}{" "}
          <span style={{ color: "var(--fg-faint)", fontSize: 14 }}>/ {toolsTotal}</span>
        </div>
        <div className="d">{toolsLive === toolsTotal ? "100% green" : `${toolsTotal - toolsLive} offline`}</div>
      </div>

      <div className="cell" style={{ background: "var(--surface)", padding: "14px 16px" }}>
        <div className="l">Plots today</div>
        <div className="v" data-counter data-target={plotsToday}>
          {plotsToday.toLocaleString()}
        </div>
        <div className="d">star-history renders</div>
      </div>

      <div className="cell" style={{ background: "var(--surface)", padding: "14px 16px" }}>
        <div className="l">Watchlist items</div>
        <div className="v">{watchlistItems > 0 ? watchlistItems.toLocaleString() : "—"}</div>
        <div className="d">
          {watchlistItems > 0 ? "tracked locally" : "sign in to see yours"}
        </div>
      </div>

      <div className="cell" style={{ background: "var(--surface)", padding: "14px 16px" }}>
        <div className="l">Compares saved</div>
        <div className="v">{comparesSaved > 0 ? comparesSaved.toLocaleString() : "—"}</div>
        <div className="d">
          {comparesSaved > 0 ? "in your library" : "sign in to see yours"}
        </div>
      </div>

      <div className="cell" style={{ background: "var(--surface)", padding: "14px 16px" }}>
        <div className="l">Digest issues</div>
        <div className="v" data-counter data-target={digestSubscribers}>
          {digestSubscribers.toLocaleString()}
        </div>
        <div className="d">archived editions</div>
      </div>
    </div>
  );
}
