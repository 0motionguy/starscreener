interface ToolsKpiStripProps {
  toolsLive: number;
  toolsTotal: number;
  plotsToday: number;
  watchlistItems: number;
  comparesSaved: number;
  digestSubscribers: number;
}

function renderCount(n: number): string {
  return n.toLocaleString();
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
        <div className="d">charts - estimators - workspace</div>
      </div>
      <div className="cell">
        <div className="l">Plots today</div>
        <div className="v">{renderCount(plotsToday)}</div>
        <div className="d">star-history renders queued</div>
      </div>
      <div className="cell">
        <div className="l">Watchlist items</div>
        <div className="v">{renderCount(watchlistItems)}</div>
        <div className="d">local pins - sync via sign-in</div>
      </div>
      <div className="cell">
        <div className="l">Compares saved</div>
        <div className="v">{renderCount(comparesSaved)}</div>
        <div className="d">local-only - shortlink to share</div>
      </div>
      <div className="cell">
        <div className="l">Digest subscribers</div>
        <div className="v">{renderCount(digestSubscribers)}</div>
        <div className="d">daily digest audience</div>
      </div>
    </div>
  );
}
