// TopMoversRail — right-column "Top movers · 24h velocity" card.

import { getTopMoversByDelta24h } from "@/lib/trending";

export function TopMoversRail({ limit = 5 }: { limit?: number }) {
  const movers = (() => {
    try {
      return getTopMoversByDelta24h(limit);
    } catch {
      return [];
    }
  })();

  return (
    <div className="card">
      <div className="card-head">
        <h2 className="card-title">
          ▸ <b>Top movers</b> · 24h velocity
        </h2>
      </div>
      <div className="card-body">
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {movers.map((m) => {
            const [owner, name] = m.fullName.split("/");
            const delta = m.starsDelta24h;
            return (
              <div
                key={m.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "22px 1fr auto",
                  gap: 10,
                  alignItems: "center",
                  paddingBottom: 8,
                  borderBottom: "1px solid var(--border-subtle)",
                }}
              >
                <div
                  className="repo-avatar"
                  style={{
                    width: 22,
                    height: 22,
                    background: "var(--surface-3)",
                    color: "var(--accent)",
                    fontSize: 9,
                  }}
                >
                  {(owner || "?").slice(0, 2).toUpperCase()}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
                  <a
                    href={`/repo/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`}
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 12,
                      color: "var(--fg)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {m.fullName}
                  </a>
                  <span className="muted" style={{ fontSize: 10.5 }}>
                    {m.language ?? "—"} · +{delta.toLocaleString()} ★
                  </span>
                </div>
                <div className={delta >= 0 ? "up-text" : "dn-text"} style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>
                  +{delta.toLocaleString()}
                </div>
              </div>
            );
          })}
          {movers.length === 0 && (
            <p className="muted" style={{ fontSize: 12, margin: 0 }}>
              No movers cached yet.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
