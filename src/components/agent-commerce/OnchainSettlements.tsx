// OnchainSettlements — Base + Solana USDC settlement volume cards.
// Pulls from src/lib/base-x402-onchain + src/lib/solana-x402-onchain.
// If accessor doesn't expose facilitator-share or median payment, we render
// the totals and mark the missing fields with "—" / "needs accessor".

import type { BaseX402OnchainFile } from "@/lib/base-x402-onchain";
import type { SolanaX402OnchainFile } from "@/lib/solana-x402-onchain";

interface OnchainSettlementsProps {
  base: BaseX402OnchainFile | null;
  solana: SolanaX402OnchainFile | null;
  /** USD volume on Base over 24h (from Dune if available, else null). */
  baseVolumeUsd24h: number | null;
  /** USD volume on Solana over 24h (from Dune if available, else null). */
  solanaVolumeUsd24h: number | null;
}

function formatUsd(n: number | null): string {
  if (n == null || !Number.isFinite(n) || n <= 0) return "—";
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${Math.round(n)}`;
}

function topFacilitator(
  byFacilitator:
    | Record<string, { addressCount: number; totalTxs: number; x402Settlements: number }>
    | undefined,
): { name: string; txs: number } | null {
  if (!byFacilitator) return null;
  let best: { name: string; txs: number } | null = null;
  for (const [name, stat] of Object.entries(byFacilitator)) {
    const txs = stat?.totalTxs ?? 0;
    if (!best || txs > best.txs) best = { name, txs };
  }
  return best;
}

function sumSettlements(
  byFacilitator:
    | Record<string, { addressCount: number; totalTxs: number; x402Settlements: number }>
    | undefined,
): number {
  if (!byFacilitator) return 0;
  return Object.values(byFacilitator).reduce((acc, s) => acc + (s?.x402Settlements ?? 0), 0);
}

export function OnchainSettlements({
  base,
  solana,
  baseVolumeUsd24h,
  solanaVolumeUsd24h,
}: OnchainSettlementsProps) {
  const baseSettlements = base?.totalSettlements ?? sumSettlements(base?.byFacilitator);
  const solanaSettlements =
    solana?.totalSettlements ?? sumSettlements(solana?.byFacilitator);

  const totalSettlements = baseSettlements + solanaSettlements;
  const basePct = totalSettlements > 0 ? Math.round((baseSettlements / totalSettlements) * 100) : 0;
  const solanaPct =
    totalSettlements > 0 ? Math.round((solanaSettlements / totalSettlements) * 100) : 0;

  const baseTop = topFacilitator(base?.byFacilitator);
  const solanaTop = topFacilitator(solana?.byFacilitator);

  return (
    <div className="panel fade-up" style={{ marginBottom: 14 }}>
      <div className="panel-head">
        <span className="ph-eyebrow">{"// 02"}</span>
        <span className="ph-title">On-chain settlements · last 24h</span>
        <span className="ph-meta">
          x402 USDC payments on Base + Solana · <b>Dune analytics</b>
        </span>
      </div>
      <div
        className="onchain"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 14,
          padding: "14px 16px",
        }}
      >
        <div className="chain-block" style={chainBlockStyle}>
          <span className="ch-name base" style={{ ...chNameStyle, color: "#0052ff" }}>
            ▌ BASE · CHAIN-ID 8453
          </span>
          <span className="ch-val" style={chValStyle}>
            {formatUsd(baseVolumeUsd24h)}
          </span>
          <span className="ch-sub" style={chSubStyle}>
            {baseSettlements.toLocaleString()} settlements · {basePct}% of total · USDC native
          </span>
          <span className="ch-bar" style={chBarStyle}>
            <span className="fill" style={{ ...chBarFillStyle, width: `${basePct}%` }} />
          </span>
          <div className="row between" style={{ ...rowBetweenStyle, marginTop: 8 }}>
            <span>top facilitator</span>
            <span style={{ color: "var(--fg)" }}>
              {baseTop ? `${baseTop.name} · ${baseTop.txs.toLocaleString()} tx` : "—"}
            </span>
          </div>
          <div className="row between" style={rowBetweenStyle}>
            <span>median payment</span>
            <span style={{ color: "var(--fg)" }}>— needs accessor</span>
          </div>
        </div>

        <div className="chain-block" style={chainBlockStyle}>
          <span className="ch-name solana" style={{ ...chNameStyle, color: "#14f195" }}>
            ▌ SOLANA · MAINNET
          </span>
          <span className="ch-val" style={chValStyle}>
            {formatUsd(solanaVolumeUsd24h)}
          </span>
          <span className="ch-sub" style={chSubStyle}>
            {solanaSettlements.toLocaleString()} settlements · {solanaPct}% of total · USDC native
          </span>
          <span className="ch-bar" style={chBarStyle}>
            <span className="fill" style={{ ...chBarFillStyle, width: `${solanaPct}%` }} />
          </span>
          <div className="row between" style={{ ...rowBetweenStyle, marginTop: 8 }}>
            <span>top facilitator</span>
            <span style={{ color: "var(--fg)" }}>
              {solanaTop ? `${solanaTop.name} · ${solanaTop.txs.toLocaleString()} tx` : "—"}
            </span>
          </div>
          <div className="row between" style={rowBetweenStyle}>
            <span>median payment</span>
            <span style={{ color: "var(--fg)" }}>— needs accessor</span>
          </div>
        </div>
      </div>
    </div>
  );
}

const chainBlockStyle: React.CSSProperties = {
  background: "var(--surface-2)",
  border: "1px solid var(--border-subtle)",
  borderRadius: "var(--r-1)",
  padding: 14,
  display: "flex",
  flexDirection: "column",
  gap: 8,
};
const chNameStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  textTransform: "uppercase",
  letterSpacing: "0.10em",
  fontWeight: 600,
};
const chValStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 26,
  color: "var(--fg-bright)",
  fontVariantNumeric: "tabular-nums",
  fontWeight: 500,
};
const chSubStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 10.5,
  color: "var(--fg-muted)",
};
const chBarStyle: React.CSSProperties = {
  height: 4,
  background: "var(--surface-3)",
  borderRadius: 2,
  overflow: "hidden",
  marginTop: 6,
  display: "block",
};
const chBarFillStyle: React.CSSProperties = {
  height: "100%",
  background: "linear-gradient(90deg, var(--accent), var(--cyan))",
  display: "block",
};
const rowBetweenStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  color: "var(--fg-faint)",
};
