// Agent Commerce — protocol pulse grid (counts only).
//
// Drops the per-protocol synthetic Sparkline that previously sat under each
// row. The fake time-series suggested historical adoption data that doesn't
// exist; this v4 rebuild surfaces just the absolute count + share bar so the
// chrome stays honest until a real per-protocol timeline collector lands.

import type { AgentCommerceStats } from "@/lib/agent-commerce/types";

interface ProtocolPulseGridProps {
  stats: AgentCommerceStats;
}

interface PulseRow {
  label: string;
  count: number;
  color: string;
}

export function ProtocolPulseGrid({ stats }: ProtocolPulseGridProps) {
  const total = Math.max(stats.totalItems, 1);
  const rows: PulseRow[] = [
    { label: "x402", count: stats.x402EnabledCount, color: "var(--v4-amber)" },
    { label: "MCP", count: stats.mcpServerCount, color: "var(--v4-cyan)" },
    {
      label: "Portal",
      count: stats.portalReadyCount,
      color: "var(--v4-money)",
    },
    {
      label: "Actionable",
      count: stats.agentActionableCount,
      color: "var(--v4-violet)",
    },
  ];

  // Protocol counts also include any in stats.byProtocol that aren't already
  // covered by the flag rows above. We surface up to 4 extras so the grid
  // matches the original section coverage.
  const flagLabels = new Set(["x402", "MCP", "Portal", "Actionable"]);
  const extras: PulseRow[] = Object.entries(stats.byProtocol)
    .filter(([proto]) => proto !== "x402" && proto !== "mcp")
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([proto, n]) => ({
      label: proto.toUpperCase(),
      count: n,
      color: "var(--v4-ink-300)",
    }))
    .filter((r) => !flagLabels.has(r.label));

  const allRows = [...rows, ...extras];

  return (
    <div className="ac-pulse-grid">
      {allRows.map((row) => {
        const pct = Math.round((row.count / total) * 100);
        return (
          <div key={row.label} className="ac-pulse-row">
            <span
              className="v2-mono ac-pulse-row__label"
              style={{ color: row.color }}
            >
              {row.label}
            </span>
            <span className="ac-pulse-row__track" aria-hidden>
              <i
                style={{
                  width: `${pct}%`,
                  background: row.color,
                }}
              />
            </span>
            <span className="ac-pulse-row__count">{row.count}</span>
            <span className="ac-pulse-row__pct">{pct}%</span>
          </div>
        );
      })}
    </div>
  );
}
