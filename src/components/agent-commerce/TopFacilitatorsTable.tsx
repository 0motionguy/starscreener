import type { BaseX402OnchainFile } from "@/lib/base-x402-onchain";
import type { DuneX402VolumeFile } from "@/lib/dune-x402-volume";
import type { SolanaX402OnchainFile } from "@/lib/solana-x402-onchain";

type SourceStatus = "fresh" | "stale" | "missing" | "unknown";

interface TopFacilitatorsTableProps {
  base: BaseX402OnchainFile | null;
  solana: SolanaX402OnchainFile | null;
  dune: DuneX402VolumeFile | null;
  duneVolumeStatus: SourceStatus;
  limit?: number;
}

interface Row {
  name: string;
  chain: "Base" | "Solana";
  txs: number;
  volumeUsd: number;
}

// 2026-05-23: SEEDED_ROWS deleted. Real data only. Empty data shows an
// explicit unavailable/stale state instead of synthetic volume.

function reduceVolume(rows: DuneX402VolumeFile["rows"] | undefined): Map<string, number> {
  const out = new Map<string, number>();
  if (!rows) return out;
  for (const row of rows) {
    const value = Number(row.volumeUsdc);
    if (!Number.isFinite(value)) continue;
    out.set(row.facilitator, (out.get(row.facilitator) ?? 0) + value);
  }
  return out;
}

function formatVol(v: number): string {
  if (!Number.isFinite(v) || v <= 0) return "$0";
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${Math.round(v)}`;
}

function volumeStatusShort(status: SourceStatus): string {
  if (status === "fresh") return "$0";
  if (status === "stale") return "stale";
  if (status === "unknown") return "unknown";
  return "N/A";
}

export function TopFacilitatorsTable({
  base,
  solana,
  dune,
  duneVolumeStatus,
  limit = 5,
}: TopFacilitatorsTableProps) {
  const volumeSourceFresh = duneVolumeStatus === "fresh";
  const volumeByFacilitator = volumeSourceFresh
    ? reduceVolume(dune?.rows)
    : new Map<string, number>();
  const rows: Row[] = [];

  if (base?.byFacilitator) {
    for (const [name, stat] of Object.entries(base.byFacilitator)) {
      rows.push({
        name,
        chain: "Base",
        txs: stat?.totalTxs ?? 0,
        volumeUsd: volumeByFacilitator.get(name) ?? 0,
      });
    }
  }
  if (solana?.byFacilitator) {
    for (const [name, stat] of Object.entries(solana.byFacilitator)) {
      rows.push({
        name,
        chain: "Solana",
        txs: stat?.totalTxs ?? 0,
        volumeUsd: volumeByFacilitator.get(name) ?? 0,
      });
    }
  }

  const ranked = rows.sort((a, b) => b.txs - a.txs).slice(0, limit);

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="ph-eyebrow">{"// 07"}</span>
        <span className="ph-title">Top facilitators - Base + Solana</span>
        <span className="ph-meta">
          {volumeSourceFresh ? "tx count - last 24h" : "tx count - volume source unavailable"}
        </span>
      </div>
      {ranked.length === 0 ? (
        <div style={emptyStyle}>
          No facilitator activity in window. TOOLBOX base-x402-onchain /
          solana-x402-onchain / dune-x402-volume collectors may be quiet.
        </div>
      ) : (
        <div>
          {ranked.map((row, idx) => (
            <div className="tok-row" key={`${row.name}-${row.chain}`} style={tokRowStyle}>
              <span className="r" style={rStyle}>
                {idx + 1}
              </span>
              <div className="co" style={coStyle}>
                <span className="nm" style={nmStyle}>
                  {row.name}
                </span>
                <span className="sym" style={symStyle}>
                  {row.chain} - facilitator
                </span>
              </div>
              <span className="pr" style={prStyle}>
                {row.txs.toLocaleString()} tx
              </span>
              <span
                className="d up"
                style={{
                  ...dStyle,
                  color:
                    volumeSourceFresh && row.volumeUsd > 0
                      ? "var(--up)"
                      : "var(--fg-muted)",
                }}
              >
                {volumeSourceFresh ? formatVol(row.volumeUsd) : volumeStatusShort(duneVolumeStatus)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const emptyStyle: React.CSSProperties = {
  padding: "20px 14px",
  textAlign: "center",
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  color: "var(--fg-faint)",
};
const tokRowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "24px 1fr 80px 80px",
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
