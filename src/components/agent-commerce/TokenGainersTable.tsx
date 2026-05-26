import type { AgentToken } from "@/lib/agent-commerce/live-tokens";
import { getTokenRows, type TokenMarketRow } from "./displayData";

interface TokenGainersTableProps {
  tokens: AgentToken[];
  limit?: number;
}

function formatPrice(p: number): string {
  if (!Number.isFinite(p)) return "-";
  if (p >= 1000) return `$${p.toFixed(0)}`;
  if (p >= 1) return `$${p.toFixed(2)}`;
  if (p >= 0.01) return `$${p.toFixed(3)}`;
  return `$${p.toFixed(5)}`;
}

function formatVol(v: number): string {
  if (!Number.isFinite(v) || v <= 0) return "-";
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B vol`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M vol`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K vol`;
  return `$${Math.round(v)} vol`;
}

export function TokenGainersTable({ tokens, limit = 5 }: TokenGainersTableProps) {
  const ranked: TokenMarketRow[] = getTokenRows(tokens, "gainers", limit);

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="ph-eyebrow">{"// 03"}</span>
        <span className="ph-title">Token gainers - 24h</span>
        <span className="ph-meta">top {limit} by delta price</span>
      </div>
      {ranked.length === 0 ? (
        <div style={emptyStyle}>
          No tokens in the green right now &mdash; CoinGecko feed quiet or
          everything is red on the day.
        </div>
      ) : (
      <div>
        {ranked.map((it, idx) => (
          <div className="tok-row" key={it.id} style={tokRowStyle}>
            <span className="r" style={rStyle}>{idx + 1}</span>
            <span className="logo" style={logoStyle}>
              {/* eslint-disable-next-line @next/next/no-img-element -- CoinGecko CDN, no Image optimization */}
              <img
                src={it.logoUrl}
                alt=""
                width={20}
                height={20}
                loading="lazy"
                decoding="async"
                style={{ display: "block", width: 20, height: 20, borderRadius: 4 }}
              />
            </span>
            <div className="co" style={coStyle}>
              <span className="nm" style={nmStyle}>{it.name}</span>
              <span className="sym" style={symStyle}>${it.symbol} - {it.category}</span>
            </div>
            <span className="pr" style={prStyle}>{formatPrice(it.priceUsd)}</span>
            <span className="d up" style={{ ...dStyle, color: "var(--up)" }}>
              +{it.changePct.toFixed(1)}%
            </span>
            <span className="vol" style={volStyle}>{formatVol(it.volumeUsd)}</span>
          </div>
        ))}
      </div>
      )}
    </div>
  );
}

const tokRowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "24px 24px 1fr 80px 70px 80px",
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
const logoStyle: React.CSSProperties = {
  width: 20,
  height: 20,
  display: "grid",
  placeItems: "center",
  background: "var(--surface-3)",
  borderRadius: 4,
  overflow: "hidden",
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
const emptyStyle: React.CSSProperties = {
  padding: "24px 14px",
  textAlign: "center",
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  color: "var(--fg-faint)",
};
