// TokenLosersTable — top N agent-commerce items by negative 24h token delta.
// Mirror of TokenGainersTable. Same empty-state contract.

import type { AgentCommerceItem } from "@/lib/agent-commerce/types";

interface TokenLosersTableProps {
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

export function TokenLosersTable({ items, limit = 3 }: TokenLosersTableProps) {
  const ranked = items
    .filter(
      (it) =>
        typeof it.live?.priceChange24hPct === "number" &&
        Number.isFinite(it.live.priceChange24hPct as number),
    )
    .filter((it) => (it.live?.priceChange24hPct ?? 0) < 0)
    .sort(
      (a, b) =>
        (a.live?.priceChange24hPct ?? 0) - (b.live?.priceChange24hPct ?? 0),
    )
    .slice(0, limit);

  const totalMarketCap = items.reduce(
    (acc, it) => acc + (it.live?.marketCapUsd ?? 0),
    0,
  );
  const cap = formatCapShort(totalMarketCap);

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="ph-eyebrow">{"// 04"}</span>
        <span className="ph-title">Token losers · 24h</span>
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
              <span className="d down" style={{ ...dStyle, color: "var(--down)" }}>
                {(it.live?.priceChange24hPct ?? 0).toFixed(1)}%
              </span>
              <span className="vol" style={volStyle}>
                {formatVol(it.live?.volume24hUsd)}
              </span>
            </div>
          ))
        )}
      </div>
      <div
        className="panel-head"
        style={{ borderBottom: 0, borderTop: "1px solid var(--border-subtle)" }}
      >
        <span className="ph-eyebrow">▌ MKT CAP</span>
        <span className="ph-title">$AI-COMMERCE Σ {cap}</span>
        <span className="ph-meta" style={{ color: "var(--up)" }}>
          tracked market cap
        </span>
      </div>
    </div>
  );
}

function formatCapShort(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (n >= 1e12) return `$${(n / 1e12).toFixed(1)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  return `$${Math.round(n).toLocaleString()}`;
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
