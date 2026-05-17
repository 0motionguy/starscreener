// Agent Commerce — on-chain x402 settlements board.
//
// Single component for both Base + Solana. The `chain` prop selects the
// facilitator palette, explorer URL prefix, and tx-hash field name. Each
// chain payload exposes the same byFacilitator / byDay / samples shape so
// the chrome can stay symmetric.

import type {
  BaseX402OnchainFile,
} from "@/lib/base-x402-onchain";
import type {
  SolanaX402OnchainFile,
} from "@/lib/solana-x402-onchain";

import { Card, CardBody, CardHeader } from "@/components/ui/Card";

export type OnchainChain = "base" | "solana";

interface OnchainSettlementsBoardProps {
  chain: OnchainChain;
  data: BaseX402OnchainFile | SolanaX402OnchainFile | null;
}

// Per-chain facilitator color palette. Keys are facilitator names as they
// appear in the upstream collector payloads. Unknown facilitators fall back
// to --v4-ink-300.
const BASE_FACILITATOR_COLORS: Record<string, string> = {
  Coinbase: "var(--v4-blue)",
  Heurist: "var(--v4-violet)",
  CodeNut: "var(--v4-amber)",
  Thirdweb: "var(--v4-money)",
};

const SOLANA_FACILITATOR_COLORS: Record<string, string> = {
  CodeNut: "var(--v4-amber)",
  PayAI: "var(--v4-cyan)",
  Dexter: "var(--v4-violet)",
  Bitrefill: "var(--v4-gold)",
  RelAI: "var(--v4-money)",
  AnySpend: "var(--v4-blue)",
  AurraCloud: "var(--v4-pink)",
  OpenFacilitator: "var(--v4-ink-300)",
};

function facilitatorColor(chain: OnchainChain, name: string): string {
  const palette =
    chain === "base" ? BASE_FACILITATOR_COLORS : SOLANA_FACILITATOR_COLORS;
  return palette[name] ?? "var(--v4-ink-300)";
}

function explorerUrl(chain: OnchainChain, hash: string): string {
  return chain === "base"
    ? `https://basescan.org/tx/${hash}`
    : `https://solscan.io/tx/${hash}`;
}

interface SampleRow {
  facilitator: string;
  hash: string;
  date: string;
}

function normalizeSamples(
  chain: OnchainChain,
  data: BaseX402OnchainFile | SolanaX402OnchainFile,
): SampleRow[] {
  const samples = data.samples ?? [];
  return samples.slice(0, 6).map((s) => {
    if (chain === "base") {
      const row = s as NonNullable<BaseX402OnchainFile["samples"]>[number];
      return {
        facilitator: row.facilitator,
        hash: row.txHash,
        date: row.timestamp
          ? new Date(row.timestamp).toISOString().slice(0, 10)
          : "—",
      };
    }
    const row = s as NonNullable<SolanaX402OnchainFile["samples"]>[number];
    return {
      facilitator: row.facilitator,
      hash: row.txSig,
      date: row.blockTime
        ? new Date(row.blockTime).toISOString().slice(0, 10)
        : "—",
    };
  });
}

export function OnchainSettlementsBoard({
  chain,
  data,
}: OnchainSettlementsBoardProps) {
  if (!data || !data.totalSettlements) return null;

  const total = data.totalSettlements;
  const facilitators = Object.entries(data.byFacilitator ?? {})
    .map(([name, v]) => ({
      name,
      count: v.x402Settlements,
      share: total > 0 ? (v.x402Settlements / total) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count);

  const days = Object.entries(data.byDay ?? {})
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .slice(-21);
  const maxDay = Math.max(...days.map(([, v]) => v.txs), 1);
  const samples = normalizeSamples(chain, data);

  const chainLabel = chain === "base" ? "Base" : "Solana";
  const headerRight =
    chain === "base"
      ? "free via Blockscout"
      : "free via mainnet-beta RPC";

  return (
    <>
      <div className="grid">
        <Card className="col-6">
          <CardHeader showCorner right={<span>by facilitator</span>}>
            Facilitator share · {chainLabel}
          </CardHeader>
          <CardBody>
            {facilitators.map((f) => {
              const tone = facilitatorColor(chain, f.name);
              return (
                <div key={f.name} className="ac-onchain-row">
                  <span
                    className="ac-onchain-row__name"
                    style={{ color: tone }}
                  >
                    {f.name}
                  </span>
                  <span className="ac-onchain-row__track" aria-hidden>
                    <i
                      style={{
                        width: `${f.share}%`,
                        background: tone,
                      }}
                    />
                  </span>
                  <span className="ac-onchain-row__count">{f.count}</span>
                  <span className="ac-onchain-row__pct">
                    {f.share.toFixed(1)}%
                  </span>
                </div>
              );
            })}
          </CardBody>
        </Card>
        <Card className="col-6">
          <CardHeader showCorner right={<span>{days.length}d window</span>}>
            Daily settlements · {chainLabel}
          </CardHeader>
          <CardBody>
            <div
              className="ac-onchain-bars"
              role="img"
              aria-label={`${chainLabel} daily settlements last ${days.length} days`}
            >
              {days.map(([day, v]) => {
                const h = Math.max(2, Math.round((v.txs / maxDay) * 90));
                return (
                  <span
                    key={day}
                    title={`${day} · ${v.txs} settlements`}
                    className="ac-onchain-bar"
                    style={{ height: `${h}px` }}
                  />
                );
              })}
            </div>
            <div className="ac-onchain-bars-axis">
              <span>{days[0]?.[0]}</span>
              <span className="v2-mono ac-onchain-bars-axis__meta">
                {headerRight}
              </span>
              <span>{days[days.length - 1]?.[0]}</span>
            </div>
          </CardBody>
        </Card>
      </div>
      {samples.length > 0 ? (
        <Card>
          <CardHeader
            showCorner
            right={<span>most recent on-chain settlements</span>}
          >
            Sample tx · {chainLabel}
          </CardHeader>
          <CardBody>
            {samples.map((s) => (
              <a
                key={s.hash}
                href={explorerUrl(chain, s.hash)}
                target="_blank"
                rel="noreferrer"
                className="ac-onchain-sample"
              >
                <span
                  className="ac-onchain-sample__facilitator"
                  style={{ color: facilitatorColor(chain, s.facilitator) }}
                >
                  {s.facilitator}
                </span>
                <span className="ac-onchain-sample__hash">{s.hash}</span>
                <span className="ac-onchain-sample__date">{s.date}</span>
              </a>
            ))}
          </CardBody>
        </Card>
      ) : null}
    </>
  );
}
