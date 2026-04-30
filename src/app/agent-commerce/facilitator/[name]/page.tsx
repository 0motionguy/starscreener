// /agent-commerce/facilitator/[name] — per-facilitator drilldown.
//
// Aggregates a single x402 facilitator's settlement history across both
// Base and Solana on-chain indexer outputs. RSC; reads JSON files via
// the inline require("fs") pattern that already exists in the parent
// agent-commerce/page.tsx — yes it's an anti-pattern, but it matches
// the current convention so this drilldown stays consistent until the
// parallel cleanup lands.

import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Card, CardBody, CardHeader } from "@/components/ui/Card";

interface PageProps {
  params: Promise<{ name: string }>;
}

type ChainKey = "base" | "solana";

interface BaseSample {
  facilitator: string;
  txHash: string;
  from?: string;
  to?: string;
  timestamp: string;
  blockNumber?: number;
}

interface SolSample {
  facilitator: string;
  txSig: string;
  from?: string | null;
  to?: string | null;
  blockTime: string | null;
  slot?: number | null;
}

interface OnchainShape<TSample> {
  fetchedAt?: string;
  totalSettlements?: number;
  byFacilitator?: Record<
    string,
    { addressCount: number; totalTxs: number; x402Settlements: number }
  >;
  byDay?: Record<
    string,
    { txs: number; byFacilitator: Record<string, number> }
  >;
  samples?: TSample[];
  facilitatorAddresses?: Record<string, string[]>;
}

const FAC_COLOR: Record<string, string> = {
  Coinbase: "#3b82f6",
  Heurist: "#a78bfa",
  CodeNut: "#f59e0b",
  Thirdweb: "#34d399",
};

const CHAIN_COLOR: Record<ChainKey, string> = {
  base: "#3b82f6",
  solana: "#22d3ee",
};

function readChain<TSample>(file: string): OnchainShape<TSample> | null {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require("fs") as typeof import("fs");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require("path") as typeof import("path");
  try {
    const raw = fs.readFileSync(
      path.resolve(process.cwd(), `.data/${file}`),
      "utf8",
    );
    return JSON.parse(raw) as OnchainShape<TSample>;
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { name } = await params;
  return {
    title: `${name} · x402 facilitator`,
    description: `Settlement history and on-chain footprint for the ${name} x402 facilitator across Base and Solana.`,
    alternates: { canonical: `/agent-commerce/facilitator/${name}` },
  };
}

export default async function FacilitatorDrilldownPage({ params }: PageProps) {
  const { name } = await params;

  const base = readChain<BaseSample>("base-x402-onchain.json");
  const sol = readChain<SolSample>("solana-x402-onchain.json");

  const baseFac = base?.byFacilitator?.[name] ?? null;
  const solFac = sol?.byFacilitator?.[name] ?? null;

  // notFound when neither data file has the facilitator (or neither file exists)
  if (!baseFac && !solFac) {
    notFound();
  }

  const baseSettlements = baseFac?.x402Settlements ?? 0;
  const solSettlements = solFac?.x402Settlements ?? 0;
  const totalSettlements = baseSettlements + solSettlements;

  const baseAddresses = baseFac?.addressCount ?? 0;
  const solAddresses = solFac?.addressCount ?? 0;
  const totalAddresses = baseAddresses + solAddresses;

  const baseTotal = base?.totalSettlements ?? 0;
  const solTotal = sol?.totalSettlements ?? 0;

  const baseShare =
    baseTotal > 0 ? (baseSettlements / baseTotal) * 100 : 0;
  const solShare = solTotal > 0 ? (solSettlements / solTotal) * 100 : 0;

  // Build last-90-days stacked daily series. Filter days where this facilitator
  // contributed; keep zero-rows on the other chain so x-axis aligns.
  const dayMap = new Map<
    string,
    { base: number; solana: number }
  >();

  for (const [day, v] of Object.entries(base?.byDay ?? {})) {
    const c = v.byFacilitator?.[name];
    if (typeof c === "number" && c > 0) {
      const cur = dayMap.get(day) ?? { base: 0, solana: 0 };
      cur.base += c;
      dayMap.set(day, cur);
    }
  }
  for (const [day, v] of Object.entries(sol?.byDay ?? {})) {
    const c = v.byFacilitator?.[name];
    if (typeof c === "number" && c > 0) {
      const cur = dayMap.get(day) ?? { base: 0, solana: 0 };
      cur.solana += c;
      dayMap.set(day, cur);
    }
  }

  const days = [...dayMap.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .slice(-90)
    .map(([day, v]) => ({ day, ...v, total: v.base + v.solana }));
  const maxDay = Math.max(...days.map((d) => d.total), 1);

  // Combine samples from both chains, filter to facilitator, sort newest first, top 10.
  type CombinedSample = {
    chain: ChainKey;
    label: string;
    href: string;
    txId: string;
    timestamp: number;
    timestampLabel: string;
  };
  const combined: CombinedSample[] = [];
  for (const s of base?.samples ?? []) {
    if (s.facilitator !== name) continue;
    const t = new Date(s.timestamp).getTime();
    combined.push({
      chain: "base",
      label: "Base",
      href: `https://basescan.org/tx/${s.txHash}`,
      txId: s.txHash,
      timestamp: Number.isFinite(t) ? t : 0,
      timestampLabel: Number.isFinite(t)
        ? new Date(t).toISOString().slice(0, 10)
        : "—",
    });
  }
  for (const s of sol?.samples ?? []) {
    if (s.facilitator !== name) continue;
    const t = s.blockTime ? new Date(s.blockTime).getTime() : 0;
    combined.push({
      chain: "solana",
      label: "Solana",
      href: `https://solscan.io/tx/${s.txSig}`,
      txId: s.txSig,
      timestamp: Number.isFinite(t) ? t : 0,
      timestampLabel:
        Number.isFinite(t) && t > 0
          ? new Date(t).toISOString().slice(0, 10)
          : "—",
    });
  }
  combined.sort((a, b) => b.timestamp - a.timestamp);
  const recent = combined.slice(0, 10);

  const accent = FAC_COLOR[name] ?? "#cbd5e1";

  return (
    <main
      style={{
        maxWidth: 1200,
        margin: "0 auto",
        padding: "32px 24px 64px",
        display: "flex",
        flexDirection: "column",
        gap: 24,
      }}
    >
      <div className="sec-head">
        <span className="sec-num">{"// fac"}</span>
        <h1 className="sec-title" style={{ color: accent }}>
          {name}
        </h1>
        <span className="sec-meta">
          <b>{totalSettlements.toLocaleString("en-US")}</b> total settlements ·{" "}
          <b>{totalAddresses}</b> active addresses ·{" "}
          {baseFac && solFac
            ? "Base + Solana"
            : baseFac
              ? "Base only"
              : "Solana only"}
        </span>
      </div>

      <div className="grid">
        {baseFac ? (
          <Card className="col-6">
            <CardHeader
              showCorner
              right={<span>{baseShare.toFixed(1)}% of chain</span>}
            >
              Base
            </CardHeader>
            <CardBody>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 12,
                  padding: "14px",
                  fontFamily: "var(--font-mono, ui-monospace)",
                  fontSize: 12,
                }}
              >
                <div>
                  <div
                    style={{
                      color: "var(--color-text-faint)",
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      fontSize: 10,
                      marginBottom: 4,
                    }}
                  >
                    Settlements
                  </div>
                  <div
                    style={{
                      fontSize: 22,
                      fontWeight: 700,
                      color: CHAIN_COLOR.base,
                    }}
                  >
                    {baseSettlements.toLocaleString("en-US")}
                  </div>
                </div>
                <div>
                  <div
                    style={{
                      color: "var(--color-text-faint)",
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      fontSize: 10,
                      marginBottom: 4,
                    }}
                  >
                    Addresses
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 700 }}>
                    {baseAddresses}
                  </div>
                </div>
                <div>
                  <div
                    style={{
                      color: "var(--color-text-faint)",
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      fontSize: 10,
                      marginBottom: 4,
                    }}
                  >
                    Total Txs
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>
                    {(baseFac.totalTxs ?? 0).toLocaleString("en-US")}
                  </div>
                </div>
                <div>
                  <div
                    style={{
                      color: "var(--color-text-faint)",
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      fontSize: 10,
                      marginBottom: 4,
                    }}
                  >
                    Chain Share
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>
                    {baseShare.toFixed(2)}%
                  </div>
                </div>
              </div>
            </CardBody>
          </Card>
        ) : null}
        {solFac ? (
          <Card className="col-6">
            <CardHeader
              showCorner
              right={<span>{solShare.toFixed(1)}% of chain</span>}
            >
              Solana
            </CardHeader>
            <CardBody>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 12,
                  padding: "14px",
                  fontFamily: "var(--font-mono, ui-monospace)",
                  fontSize: 12,
                }}
              >
                <div>
                  <div
                    style={{
                      color: "var(--color-text-faint)",
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      fontSize: 10,
                      marginBottom: 4,
                    }}
                  >
                    Settlements
                  </div>
                  <div
                    style={{
                      fontSize: 22,
                      fontWeight: 700,
                      color: CHAIN_COLOR.solana,
                    }}
                  >
                    {solSettlements.toLocaleString("en-US")}
                  </div>
                </div>
                <div>
                  <div
                    style={{
                      color: "var(--color-text-faint)",
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      fontSize: 10,
                      marginBottom: 4,
                    }}
                  >
                    Addresses
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 700 }}>
                    {solAddresses}
                  </div>
                </div>
                <div>
                  <div
                    style={{
                      color: "var(--color-text-faint)",
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      fontSize: 10,
                      marginBottom: 4,
                    }}
                  >
                    Total Txs
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>
                    {(solFac.totalTxs ?? 0).toLocaleString("en-US")}
                  </div>
                </div>
                <div>
                  <div
                    style={{
                      color: "var(--color-text-faint)",
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      fontSize: 10,
                      marginBottom: 4,
                    }}
                  >
                    Chain Share
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>
                    {solShare.toFixed(2)}%
                  </div>
                </div>
              </div>
            </CardBody>
          </Card>
        ) : null}
      </div>

      {days.length > 0 ? (
        <Card>
          <CardHeader showCorner right={<span>{days.length}d window</span>}>
            Daily settlements (Base + Solana)
          </CardHeader>
          <CardBody>
            <div
              style={{
                display: "flex",
                alignItems: "flex-end",
                gap: 2,
                padding: "16px 14px 8px",
                height: 140,
              }}
            >
              {days.map((d) => {
                const totalH = Math.max(
                  2,
                  Math.round((d.total / maxDay) * 120),
                );
                const baseH =
                  d.total > 0 ? Math.round((d.base / d.total) * totalH) : 0;
                const solH = totalH - baseH;
                return (
                  <span
                    key={d.day}
                    title={`${d.day} · base ${d.base} · solana ${d.solana}`}
                    style={{
                      flex: 1,
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "flex-end",
                      height: totalH,
                    }}
                  >
                    {solH > 0 ? (
                      <span
                        style={{
                          height: solH,
                          background: CHAIN_COLOR.solana,
                          opacity: 0.85,
                        }}
                      />
                    ) : null}
                    {baseH > 0 ? (
                      <span
                        style={{
                          height: baseH,
                          background: CHAIN_COLOR.base,
                          opacity: 0.85,
                        }}
                      />
                    ) : null}
                  </span>
                );
              })}
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "0 14px 10px",
                fontSize: 10,
                color: "var(--color-text-faint)",
                fontFamily: "var(--font-mono, ui-monospace)",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              <span>{days[0]?.day}</span>
              <span style={{ display: "flex", gap: 14 }}>
                <span style={{ color: CHAIN_COLOR.base }}>■ base</span>
                <span style={{ color: CHAIN_COLOR.solana }}>■ solana</span>
              </span>
              <span>{days[days.length - 1]?.day}</span>
            </div>
          </CardBody>
        </Card>
      ) : null}

      {recent.length > 0 ? (
        <Card>
          <CardHeader
            showCorner
            right={<span>10 most recent settlements</span>}
          >
            Sample tx hashes
          </CardHeader>
          <CardBody>
            {recent.map((s) => (
              <a
                key={`${s.chain}-${s.txId}`}
                href={s.href}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: "grid",
                  gridTemplateColumns: "70px minmax(0, 1fr) 100px",
                  alignItems: "center",
                  gap: 12,
                  padding: "6px 14px",
                  borderBottom: "1px solid var(--color-border-subtle)",
                  color: "inherit",
                  textDecoration: "none",
                  fontFamily: "var(--font-mono, ui-monospace)",
                  fontSize: 11,
                }}
              >
                <span
                  style={{
                    color: CHAIN_COLOR[s.chain],
                    fontWeight: 700,
                  }}
                >
                  {s.label}
                </span>
                <span
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    color: "var(--color-text-default)",
                  }}
                >
                  {s.txId}
                </span>
                <span
                  style={{
                    textAlign: "right",
                    color: "var(--color-text-faint)",
                  }}
                >
                  {s.timestampLabel}
                </span>
              </a>
            ))}
          </CardBody>
        </Card>
      ) : null}
    </main>
  );
}
