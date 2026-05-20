// ProtocolPulseGrid — 3 .proto-cell tiles (x402, MCP, a2a) under the KPI strip.
// Activity bars width = share of "max" within the grid so the relative pulse
// reads correctly even when raw numbers vary by orders of magnitude.

interface ProtocolPulseGridProps {
  x402OnchainUsd: number;
  x402EndpointCount: number;
  mcpServerCount: number;
  mcpHealthy: number;
  mcpDegraded: number;
  a2aCount: number;
}

function formatUsd(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "$0";
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${Math.round(n)}`;
}

export function ProtocolPulseGrid({
  x402OnchainUsd,
  x402EndpointCount,
  mcpServerCount,
  mcpHealthy,
  mcpDegraded,
  a2aCount,
}: ProtocolPulseGridProps) {
  const x402Pct = x402EndpointCount > 0 ? Math.min(100, Math.round((x402EndpointCount / 100) * 100)) : 4;
  const mcpDenom = Math.max(mcpServerCount, mcpHealthy + mcpDegraded);
  const mcpPct = mcpDenom > 0 ? Math.round((mcpHealthy / mcpDenom) * 100) : 4;
  const a2aPct = a2aCount > 0 ? Math.min(100, Math.round((a2aCount / 80) * 100)) : 4;

  return (
    <div className="panel fade-up" style={{ marginBottom: 14 }}>
      <div className="panel-head">
        <span className="ph-eyebrow">{"// 01"}</span>
        <span className="ph-title">Protocol pulse · live</span>
        <span className="ph-meta">
          7 protocols tracked - activity in the last 24h
        </span>
      </div>
      <div style={{ padding: "14px 16px" }}>
        <div className="proto-grid">
          <div className="proto-cell">
            <div className="pc-head">
              <span className="pc-name">x402</span>
              <span className="pc-pulse" />
            </div>
            <div className="pc-num">{formatUsd(x402OnchainUsd)}</div>
            <div className="pc-sub">
              on-chain settled · {x402EndpointCount} endpoints · 24h
            </div>
            <div className="pc-bar">
              <div className="fill" style={{ width: `${x402Pct}%` }} />
            </div>
          </div>
          <div className="proto-cell">
            <div className="pc-head">
              <span className="pc-name">MCP</span>
              <span className="pc-pulse" />
            </div>
            <div className="pc-num">{mcpServerCount.toLocaleString()}</div>
            <div className="pc-sub">
              servers · {mcpHealthy} healthy · {mcpDegraded} degraded
            </div>
            <div className="pc-bar">
              <div className="fill" style={{ width: `${mcpPct}%` }} />
            </div>
          </div>
          <div className="proto-cell">
            <div className="pc-head">
              <span className="pc-name">a2a</span>
              <span className="pc-pulse" />
            </div>
            <div className="pc-num">{a2aCount.toLocaleString()}</div>
            <div className="pc-sub">agent-to-agent skill graphs · early</div>
            <div className="pc-bar">
              <div className="fill" style={{ width: `${a2aPct}%` }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
