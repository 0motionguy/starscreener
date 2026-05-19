// TokenGainersTable — top N agent-commerce items by 24h token price delta.
// Pulls from AgentCommerceItem.live.priceChange24hPct / priceUsd / volume24hUsd.
// Empty-state with TODO when no token-price-enriched items are loaded yet.
//
// TODO(Phase B): wire to CoinGecko / Dune token feeds once the agent-commerce
// fetcher consistently fills item.live.priceChange24hPct.

import type { AgentCommerceItem } from "@/lib/agent-commerce/types";

interface TokenGainersTableProps {
  items: AgentCommerceItem[];
  limit?: number;
}

function formatPrice(p: number | null | undefined): string {
  if (p == null || !Number.isFinite(p)) return "—";
  if (p >= 1000) return `$${p.toFixed(0)}`;
  if (p >= 1) return `$${p.toFixed(2)}`;
  return `$${p.toFixed(3)}`;
}

function formatVol(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v) || v <= 0) return "—";
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B vol`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M vol`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K vol`;
  return `$${Math.round(v)} vol`;
}

export function TokenGainersTable({ items, limit = 5 }: TokenGainersTableProps) {
  const ranked = items
    .filter(
      (it) =>
        typeof it.live?.priceChange24hPct === "number" &&
        Number.isFinite(it.live.priceChange24hPct as number),
    )
    .filter((it) => (it.live?.priceChange24hPct ?? 0) > 0)
    .sort(
      (a, b) =>
        (b.live?.priceChange24hPct ?? 0) - (a.live?.priceChange24hPct ?? 0),
    )
    .slice(0, limit);

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="ph-eyebrow">{"// 03"}</span>
        <span className="ph-title">Token gainers · 24h</span>
        <span className="ph-meta">top {limit} by Δ price</span>
      </div>
      <div>
        {ranked.length === 0 ? (
          <div
            style={{
              padding: "20px 16px",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--fg-muted)",
            }}
          >
            no token-price feed wired yet — TODO(Phase B): CoinGecko / Dune.
          </div>
        ) : (
          ranked.map((it, idx) => (
            <div className="tok-row" key={it.id} style={tokRowStyle}>
              <span className="r" style={rStyle}>
                {idx + 1}
              </span>
              <div className="co" style={coStyle}>
                <span className="nm" style={nmStyle}>
                  {it.name}
                </span>
                <span className="sym" style={symStyle}>
                  {it.live?.tokenSymbol
                    ? `$${it.live.tokenSymbol} · ${it.category}`
                    : `${it.category} · ${it.kind}`}
                </span>
              </div>
              <span className="pr" style={prStyle}>
                {formatPrice(it.live?.priceUsd)}
              </span>
              <span className="d up" style={{ ...dStyle, color: "var(--up)" }}>
                +{(it.live?.priceChange24hPct ?? 0).toFixed(1)}%
              </span>
              <span className="vol" style={volStyle}>
                {formatVol(it.live?.volume24hUsd)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

const tokRowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "24px 1fr 80px 70px 80px",
  gap: 10,
  alignItems: "center",
  padding: "10px 14px",
  borderBottom: "1px solid var(--border-subtle)",
  fontSize: 12,
};
const rStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  color: "var(--fg-faint)",
  fontSize: 11,
  textAlign: "right",
};
const coStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  minWidth: 0,
};
const nmStyle: React.CSSProperties = {
  color: "var(--fg-bright)",
  fontFamily: "var(--font-mono)",
};
const symStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  color: "var(--cyan)",
};
const prStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontVariantNumeric: "tabular-nums",
  color: "var(--fg)",
  textAlign: "right",
};
const dStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontVariantNumeric: "tabular-nums",
  textAlign: "right",
  fontWeight: 500,
};
const volStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  color: "var(--fg-muted)",
  fontSize: 10,
  textAlign: "right",
};
