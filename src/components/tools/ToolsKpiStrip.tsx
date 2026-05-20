interface ToolsKpiStripProps {
  toolsLive: number;
  toolsTotal: number;
  /** Null when no per-day plot counter is wired (renders an em-dash). */
  plotsToday: number | null;
  /** Null on SSR — watchlist lives in a client-side Zustand store. */
  watchlistItems: number | null;
  /** Null on SSR — compares live in a client-side Zustand store. */
  comparesSaved: number | null;
  /** Null when no subscriber list is wired (renders an em-dash). */
  digestSubscribers: number | null;
}

function renderCount(n: number | null): string {
  return n === null ? "—" : n.toLocaleString();
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
        <div className="v" aria-label="No per-day counter wired yet">
          {renderCount(plotsToday)}
        </div>
        <div className="d">counter not wired</div>
      </div>
      <div className="cell">
        <div className="l">Watchlist items</div>
        <div className="v" aria-label={watchlistItems === null ? "Sign in to see your watchlist" : undefined}>
          {renderCount(watchlistItems)}
        </div>
        <div className="d">local pins - sync via sign-in</div>
      </div>
      <div className="cell">
        <div className="l">Compares saved</div>
        <div className="v" aria-label={comparesSaved === null ? "Sign in to see your compares" : undefined}>
          {renderCount(comparesSaved)}
        </div>
        <div className="d">local-only - shortlink to share</div>
      </div>
      <div className="cell">
        <div className="l">Digest subscribers</div>
        <div className="v" aria-label={digestSubscribers === null ? "Subscriber list not wired" : undefined}>
          {renderCount(digestSubscribers)}
        </div>
        <div className="d">list not wired yet</div>
      </div>
    </div>
  );
}
