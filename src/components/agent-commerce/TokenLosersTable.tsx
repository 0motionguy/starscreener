import type { AgentCommerceItem } from "@/lib/agent-commerce/types";
import { getTokenRows, seededTokenMarketCap } from "./displayData";

interface TokenLosersTableProps {
  items: AgentCommerceItem[];
  limit?: number;
}

function formatPrice(p: number): string {
  if (!Number.isFinite(p)) return "-";
  if (p >= 1000) return `$${p.toFixed(0)}`;
  if (p >= 1) return `$${p.toFixed(2)}`;
  return `$${p.toFixed(3)}`;
}

function formatVol(v: number): string {
  if (!Number.isFinite(v) || v <= 0) return "-";
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B vol`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M vol`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K vol`;
  return `$${Math.round(v)} vol`;
}

export function TokenLosersTable({ items, limit = 3 }: TokenLosersTableProps) {
  const ranked = getTokenRows(items, "losers", limit);
  const cap = formatCapShort(seededTokenMarketCap(items));

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="ph-eyebrow">{"// 04"}</span>
        <span className="ph-title">Token losers - 24h</span>
        <span className="ph-meta">top {limit} by delta price</span>
      </div>
      <div>
        {ranked.map((it, idx) => (
          <div className="tok-row" key={it.id} style={tokRowStyle}>
            <span className="r" style={rStyle}>
              {idx + 1}
            </span>
            <div className="co" style={coStyle}>
              <span className="nm" style={nmStyle}>
                {it.name}
              </span>
              <span className="sym" style={symStyle}>
                ${it.symbol} - {it.category}
              </span>
            </div>
            <span className="pr" style={prStyle}>
              {formatPrice(it.priceUsd)}
            </span>
            <span className="d down" style={{ ...dStyle, color: "var(--down)" }}>
              {it.changePct.toFixed(1)}%
            </span>
            <span className="vol" style={volStyle}>
              {formatVol(it.volumeUsd)}
            </span>
          </div>
        ))}
      </div>
      <div
        className="panel-head"
        style={{ borderBottom: 0, borderTop: "1px solid var(--border-subtle)" }}
      >
        <span className="ph-eyebrow">MKT CAP</span>
        <span className="ph-title">$AI-COMMERCE SUM {cap}</span>
        <span className="ph-meta" style={{ color: "var(--up)" }}>
          +4.8% 24h
        </span>
      </div>
    </div>
  );
}

function formatCapShort(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "-";
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
