// AcKpiStrip — 5-cell KPI band for /agent-commerce.
// Cells: items tracked · x402 enabled · MCP servers · on-chain 24h · portal-ready.
// Static markup uses .ac-kpi from the v6 HTML reference; classes target shell.css tokens.

interface AcKpiStripProps {
  itemsTracked: number;
  x402Enabled: number;
  x402NewThisWeek: number;
  mcpServers: number;
  mcpHealthy: number;
  mcpDegraded: number;
  onchain24hUsd: number;
  basePctShare: number;
  solanaPctShare: number;
  portalReady: number;
}

function formatUsd(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "$0";
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${Math.round(n)}`;
}

export function AcKpiStrip({
  itemsTracked,
  x402Enabled,
  x402NewThisWeek,
  mcpServers,
  mcpHealthy,
  mcpDegraded,
  onchain24hUsd,
  basePctShare,
  solanaPctShare,
  portalReady,
}: AcKpiStripProps) {
  return (
    <div
      className="ac-kpi fade-up"
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(5, 1fr)",
        gap: 1,
        background: "var(--border-subtle)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "var(--r-1)",
        marginBottom: 18,
      }}
    >
      <div className="cell" style={cellStyle}>
        <div style={labelStyle}>Items tracked</div>
        <div style={valueStyle}>
          <span data-counter data-target={itemsTracked}>
            {itemsTracked.toLocaleString()}
          </span>
        </div>
        <div style={descStyle}>apis · marketplaces · wallets · protocols</div>
      </div>
      <div className="cell" style={cellStyle}>
        <div style={labelStyle}>x402 enabled</div>
        <div style={{ ...valueStyle, color: "var(--accent)" }}>{x402Enabled.toLocaleString()}</div>
        <div style={{ ...descStyle, color: x402NewThisWeek > 0 ? "var(--up)" : "var(--fg-muted)" }}>
          {x402NewThisWeek > 0
            ? `▲ ${x402NewThisWeek} new this week`
            : "no new endpoints this week"}
        </div>
      </div>
      <div className="cell" style={cellStyle}>
        <div style={labelStyle}>MCP servers</div>
        <div style={{ ...valueStyle, color: "var(--cyan)" }}>{mcpServers.toLocaleString()}</div>
        <div style={descStyle}>
          {mcpHealthy} healthy · {mcpDegraded} degraded
        </div>
      </div>
      <div className="cell" style={cellStyle}>
        <div style={labelStyle}>On-chain 24h</div>
        <div style={{ ...valueStyle, color: "var(--accent)" }}>{formatUsd(onchain24hUsd)}</div>
        <div style={{ ...descStyle, color: "var(--up)" }}>
          ▲ Base {basePctShare}% · Solana {solanaPctShare}%
        </div>
      </div>
      <div className="cell" style={cellStyle}>
        <div style={labelStyle}>Portal-ready</div>
        <div style={{ ...valueStyle, color: "var(--up)" }}>{portalReady.toLocaleString()}</div>
        <div style={descStyle}>agent-actionable APIs</div>
      </div>
    </div>
  );
}

const cellStyle: React.CSSProperties = {
  background: "var(--surface)",
  padding: "14px 16px",
};
const labelStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 9.5,
  color: "var(--fg-faint)",
  textTransform: "uppercase",
  letterSpacing: "0.10em",
};
const valueStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 22,
  color: "var(--fg-bright)",
  fontVariantNumeric: "tabular-nums",
  marginTop: 4,
  fontWeight: 500,
};
const descStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  color: "var(--fg-muted)",
  marginTop: 2,
};
