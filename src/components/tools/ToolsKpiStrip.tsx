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
      <div className="cell">
        <div className="l">Tools live</div>
        <div className="v lava">
          {toolsLive}{" "}
          <span style={{ color: "var(--fg-faint)", fontSize: 14 }}>/ {toolsTotal}</span>
        </div>
        <div className="d">100% green</div>
      </div>
      <div className="cell">
        <div className="l">Plots today</div>
        <div className="v" data-counter data-target={plotsToday}>
          {plotsToday.toLocaleString()}
        </div>
        <div className="d up">+38% vs 7-day avg</div>
      </div>
      <div className="cell">
        <div className="l">Watchlist items</div>
        <div className="v">{watchlistItems.toLocaleString()}</div>
        <div className="d">3 alerts triggered 24h</div>
      </div>
      <div className="cell">
        <div className="l">Compares saved</div>
        <div className="v">{comparesSaved.toLocaleString()}</div>
        <div className="d">2 with shortlink shares</div>
      </div>
      <div className="cell">
        <div className="l">Digest subscribers</div>
        <div className="v" data-counter data-target={digestSubscribers}>
          {digestSubscribers.toLocaleString()}
        </div>
        <div className="d up">+412 last week</div>
      </div>
    </div>
  );
}
