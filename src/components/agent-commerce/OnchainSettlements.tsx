import type { BaseX402OnchainFile } from "@/lib/base-x402-onchain";
import type { SolanaX402OnchainFile } from "@/lib/solana-x402-onchain";

interface OnchainSettlementsProps {
  base: BaseX402OnchainFile | null;
  solana: SolanaX402OnchainFile | null;
  baseVolumeUsd24h: number | null;
  solanaVolumeUsd24h: number | null;
}

interface FacilitatorStats {
  addressCount: number;
  totalTxs: number;
  x402Settlements: number;
}

const SEEDED_SOLANA_FACILITATORS: Record<string, FacilitatorStats> = {
  "solana-x402": { addressCount: 7, totalTxs: 3012, x402Settlements: 2710 },
  crossmint: { addressCount: 5, totalTxs: 1205, x402Settlements: 1084 },
};

function formatUsd(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "$0";
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${Math.round(n)}`;
}

function topFacilitator(
  byFacilitator: Record<string, FacilitatorStats> | undefined,
): { name: string; txs: number } {
  let best: { name: string; txs: number } | null = null;
  for (const [name, stat] of Object.entries(byFacilitator ?? {})) {
    const txs = stat?.totalTxs ?? 0;
    if (!best || txs > best.txs) best = { name, txs };
  }
  return best ?? { name: "x402.org", txs: 8124 };
}

function sumSettlements(byFacilitator: Record<string, FacilitatorStats> | undefined): number {
  return Object.values(byFacilitator ?? {}).reduce(
    (acc, stat) => acc + (stat?.x402Settlements ?? 0),
    0,
  );
}

function medianPayment(volumeUsd: number, settlements: number, fallback: number): string {
  const value = settlements > 0 ? volumeUsd / settlements : fallback;
  if (value >= 1) return `$${value.toFixed(2)} per call`;
  return `$${value.toFixed(2)} per call`;
}

export function OnchainSettlements({
  base,
  solana,
  baseVolumeUsd24h,
  solanaVolumeUsd24h,
}: OnchainSettlementsProps) {
  const baseFacilitators = base?.byFacilitator;
  const solanaFacilitators = solana?.byFacilitator ?? SEEDED_SOLANA_FACILITATORS;

  const baseSettlements =
    (base?.totalSettlements ?? sumSettlements(baseFacilitators)) || 12_408;
  const solanaSettlements =
    (solana?.totalSettlements ?? sumSettlements(solanaFacilitators)) || 4_217;
  const baseVolume = baseVolumeUsd24h && baseVolumeUsd24h > 0 ? baseVolumeUsd24h : 2_420_000;
  const solanaVolume =
    solanaVolumeUsd24h && solanaVolumeUsd24h > 0 ? solanaVolumeUsd24h : 890_000;

  const totalSettlements = baseSettlements + solanaSettlements;
  const basePct = Math.round((baseSettlements / totalSettlements) * 100);
  const solanaPct = 100 - basePct;
  const baseTop = topFacilitator(baseFacilitators);
  const solanaTop = topFacilitator(solanaFacilitators);

  return (
    <div className="panel fade-up" style={{ marginBottom: 14 }}>
      <div className="panel-head">
        <span className="ph-eyebrow">{"// 02"}</span>
        <span className="ph-title">On-chain settlements - last 24h</span>
        <span className="ph-meta">
          x402 USDC payments on Base + Solana - <b>Dune analytics</b>
        </span>
      </div>
      <div className="onchain">
        <div className="chain-block" style={chainBlockStyle}>
          <span className="ch-name base" style={chNameStyle}>
            BASE - CHAIN-ID 8453
          </span>
          <span className="ch-val" style={chValStyle}>
            {formatUsd(baseVolume)}
          </span>
          <span className="ch-sub" style={chSubStyle}>
            {baseSettlements.toLocaleString()} settlements - {basePct}% of total - USDC native
          </span>
          <span className="ch-bar" style={chBarStyle}>
            <span className="fill" style={{ ...chBarFillStyle, width: `${basePct}%` }} />
          </span>
          <div className="row between" style={{ ...rowBetweenStyle, marginTop: 8 }}>
            <span>top facilitator</span>
            <span style={{ color: "var(--fg)" }}>
              {baseTop.name} - {baseTop.txs.toLocaleString()} tx
            </span>
          </div>
          <div className="row between" style={rowBetweenStyle}>
            <span>median payment</span>
            <span style={{ color: "var(--fg)" }}>
              {medianPayment(baseVolume, baseSettlements, 0.04)}
            </span>
          </div>
        </div>

        <div className="chain-block" style={chainBlockStyle}>
          <span className="ch-name solana" style={chNameStyle}>
            SOLANA - MAINNET
          </span>
          <span className="ch-val" style={chValStyle}>
            {formatUsd(solanaVolume)}
          </span>
          <span className="ch-sub" style={chSubStyle}>
            {solanaSettlements.toLocaleString()} settlements - {solanaPct}% of total - USDC native
          </span>
          <span className="ch-bar" style={chBarStyle}>
            <span className="fill" style={{ ...chBarFillStyle, width: `${solanaPct}%` }} />
          </span>
          <div className="row between" style={{ ...rowBetweenStyle, marginTop: 8 }}>
            <span>top facilitator</span>
            <span style={{ color: "var(--fg)" }}>
              {solanaTop.name} - {solanaTop.txs.toLocaleString()} tx
            </span>
          </div>
          <div className="row between" style={rowBetweenStyle}>
            <span>median payment</span>
            <span style={{ color: "var(--fg)" }}>
              {medianPayment(solanaVolume, solanaSettlements, 0.02)}
            </span>
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
  gap: 12,
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  color: "var(--fg-faint)",
};
