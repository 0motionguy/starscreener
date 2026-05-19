// AgentCommerceHero — page-head + segmented 24H/7D/30D period switcher.
// Freshness pill wires through classifyFreshness — no hardcoded LIVE.
// Server component. URL contract: ?period=24h|7d|30d.

import Link from "next/link";

import { FreshnessPill } from "@/components/shell/FreshnessPill";

const PERIODS = [
  { id: "24h", label: "24H" },
  { id: "7d", label: "7D" },
  { id: "30d", label: "30D" },
] as const;

export type AgentCommercePeriod = (typeof PERIODS)[number]["id"];

interface AgentCommerceHeroProps {
  period: AgentCommercePeriod;
  fetchedAt: string | null;
  itemCount: number;
  liveEndpoints: number;
  onchain24hUsd: number;
}

function formatUsd(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "$0";
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${Math.round(n)}`;
}

export function AgentCommerceHero({
  period,
  fetchedAt,
  itemCount,
  liveEndpoints,
  onchain24hUsd,
}: AgentCommerceHeroProps) {
  return (
    <div className="page-head">
      <div>
        <div className="page-eyebrow" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <FreshnessPill source="repos" fetchedAt={fetchedAt ?? null} prefix="AGENT COMMERCE" />
          <span style={{ color: "var(--fg-faint)" }}>
            · /agent-commerce · the M2M economy · x402 + MCP + a2a + wallets + APIs
          </span>
        </div>
        <h1 className="page-title">When agents trade with agents.</h1>
        <p className="page-sub">
          Live x402 on-chain activity (Base, Solana), MCP server health, portal-ready APIs,
          agent infrastructure ranked by composite score.{" "}
          <b>{liveEndpoints.toLocaleString()} endpoints live</b>, {formatUsd(onchain24hUsd)} settled
          in last 24h across {itemCount.toLocaleString()} items.
        </p>
      </div>
      <div className="segmented" role="group" aria-label="Time period">
        {PERIODS.map((p) => (
          <Link
            key={p.id}
            href={{ query: { period: p.id } }}
            className={p.id === period ? "on" : ""}
            prefetch={false}
          >
            {p.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

export { PERIODS };
