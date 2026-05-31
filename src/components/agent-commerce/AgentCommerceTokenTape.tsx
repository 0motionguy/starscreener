import type { TokenMarketRow } from "./displayData";

interface AgentCommerceTokenTapeProps {
  gainers: TokenMarketRow[];
  losers: TokenMarketRow[];
  baseVolumeUsd24h: number;
  solanaVolumeUsd24h: number;
  x402Endpoints: number;
  x402NewThisWeek: number;
  mcpServers: number;
  mcpDegraded: number;
  portalReady: number;
}

function formatUsd(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "$0";
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${Math.round(n)}`;
}

export function AgentCommerceTokenTape({
  gainers,
  losers,
  baseVolumeUsd24h,
  solanaVolumeUsd24h,
  x402Endpoints,
  x402NewThisWeek,
  mcpServers,
  mcpDegraded,
  portalReady,
}: AgentCommerceTokenTapeProps) {
  const totalVolumeUsd24h = baseVolumeUsd24h + solanaVolumeUsd24h;
  const leading = [...gainers.slice(0, 5), ...losers.slice(0, 1)].map((row) => ({
    tag: row.symbol,
    label: row.name,
    value: `${row.changePct >= 0 ? "+" : ""}${row.changePct.toFixed(1)}%`,
    tone: row.changePct >= 0 ? "delta-up" : "delta-fl",
  }));
  const operational = [
    {
      tag: "USDC",
      label: "Base - x402 volume",
      value: `${formatUsd(baseVolumeUsd24h)}/24h`,
      tone: "delta-up",
    },
    {
      tag: "USDC",
      label: "Solana - x402 volume",
      value: `${formatUsd(solanaVolumeUsd24h)}/24h`,
      tone: "delta-up",
    },
    {
      tag: "DUNE",
      label: "x402 volume",
      value: totalVolumeUsd24h > 0 ? `${formatUsd(totalVolumeUsd24h)}/24h` : "no volume rows",
      tone: totalVolumeUsd24h > 0 ? "delta-up" : "delta-fl",
    },
    {
      tag: "MCP",
      label: `${mcpServers.toLocaleString()} servers live`,
      value: `${mcpDegraded.toLocaleString()} degraded`,
      tone: mcpDegraded > 0 ? "delta-fl" : "delta-up",
    },
    {
      tag: "PORTAL",
      label: `${portalReady.toLocaleString()} portal-ready`,
      value: `${x402NewThisWeek.toLocaleString()} new x402`,
      tone: x402NewThisWeek > 0 ? "delta-up" : "delta-fl",
    },
    {
      tag: "X402",
      label: `${x402Endpoints.toLocaleString()} endpoints`,
      value: "settlement rail",
      tone: "delta-up",
    },
  ];
  const tape = [...leading, ...operational];
  const doubled = [...tape, ...tape];

  return (
    <div className="ticker agent-commerce-ticker">
      <div className="ticker-tape">
        {doubled.map((item, index) => (
          <span className="tick" key={`${item.tag}-${item.label}-${index}`}>
            <span className="tick-tag">{item.tag}</span>
            <b>{item.label}</b>
            <span className={item.tone}>{item.value}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
