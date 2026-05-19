// /agent-commerce/facilitator — x402 facilitator leaderboard.
//
// Etherscan-for-agent-payments. Ranks every x402 facilitator across Base and
// Solana on-chain indexer outputs by settlement volume, with per-facilitator
// settlement rate (settlements ÷ txs) as the credibility metric. Each row
// drills into /agent-commerce/facilitator/[name] for the full history.
//
// RSC. Reads via the data-store hooks already wired into the radar page,
// not the [name]/page.tsx require("fs") shortcut — Redis-first, .data/
// fallback. The 30s in-flight dedupe means parallel calls are cheap.
//
// Layout follows the radar page rhythm: page head + MetricGrid hero +
// numbered SectionHeads + Card grid + FooterBar. Per-row 30-day sparkline
// is inline SVG (matches the same trade-off /agent-commerce makes for
// LiveTopTable — keeps echarts off the critical path).

import type { Metadata } from "next";
import Link from "next/link";

import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { FooterBar } from "@/components/ui/FooterBar";
import { Metric, MetricGrid } from "@/components/ui/Metric";
import { SectionHead } from "@/components/ui/SectionHead";
import {
  getBaseX402Onchain,
  refreshBaseX402OnchainFromStore,
} from "@/lib/base-x402-onchain";
import {
  getSolanaX402Onchain,
  refreshSolanaX402OnchainFromStore,
} from "@/lib/solana-x402-onchain";

export const dynamic = "force-static";
export const revalidate = 1800;

export const metadata: Metadata = {
  title: "x402 Facilitator Leaderboard — agent-payments rankings",
  description:
    "Live leaderboard of every x402 facilitator across Base and Solana — settlements, transactions, addresses, settlement rate, and last-30-day momentum. Updated hourly.",
  alternates: { canonical: "/agent-commerce/facilitator" },
  openGraph: {
    title: "x402 Facilitator Leaderboard",
    description:
      "Every x402 facilitator on Base + Solana, ranked by settlement volume, with per-facilitator success rate and 30-day momentum.",
    url: "/agent-commerce/facilitator",
    type: "website",
  },
};

// Brand-consistent colors for known facilitators. Falls back to neutral grey
// for new entries; the [name] drilldown uses the same map for continuity.
const FAC_COLOR: Record<string, string> = {
  Coinbase: "#3b82f6",
  Heurist: "#a78bfa",
  CodeNut: "#f59e0b",
  Thirdweb: "#34d399",
};

const CHAIN_COLOR = {
  base: "#3b82f6",
  solana: "#22d3ee",
} as const;

type ChainKey = keyof typeof CHAIN_COLOR;

interface FacilitatorRow {
  name: string;
  networks: ChainKey[];
  totalSettlements: number;
  totalTxs: number;
  totalAddresses: number;
  settlementRate: number; // 0..1
  baseSettlements: number;
  solSettlements: number;
  baseTxs: number;
  solTxs: number;
  baseAddrs: number;
  solAddrs: number;
  spark: number[]; // last-30-day combined daily counts
  lastActivityISO: string | null;
}

function buildSparkline(
  name: string,
  baseByDay: Record<string, { txs: number; byFacilitator: Record<string, number> }> | undefined,
  solByDay: Record<string, { txs: number; byFacilitator: Record<string, number> }> | undefined,
  windowDays: number,
): { spark: number[]; lastActivityISO: string | null } {
  const dayMap = new Map<string, number>();
  let lastActivityISO: string | null = null;

  for (const [day, v] of Object.entries(baseByDay ?? {})) {
    const c = v.byFacilitator?.[name] ?? 0;
    if (c > 0) {
      dayMap.set(day, (dayMap.get(day) ?? 0) + c);
      if (!lastActivityISO || day > lastActivityISO) lastActivityISO = day;
    }
  }
  for (const [day, v] of Object.entries(solByDay ?? {})) {
    const c = v.byFacilitator?.[name] ?? 0;
    if (c > 0) {
      dayMap.set(day, (dayMap.get(day) ?? 0) + c);
      if (!lastActivityISO || day > lastActivityISO) lastActivityISO = day;
    }
  }

  const sorted = [...dayMap.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .slice(-windowDays);
  return { spark: sorted.map(([, v]) => v), lastActivityISO };
}

// 30-day inline SVG sparkline. Same trade-off the radar page makes — keeps
// the echarts chunk off this route's critical path. Not animated; the page
// is ISR-cached at 30 min so per-render cost matters.
function Sparkline({
  values,
  color,
  width = 96,
  height = 22,
}: {
  values: number[];
  color: string;
  width?: number;
  height?: number;
}) {
  if (values.length === 0) {
    return (
      <span
        style={{
          display: "inline-block",
          width,
          height,
          color: "var(--color-text-faint)",
          fontSize: 11,
          fontFamily: "var(--font-mono, ui-monospace)",
          textAlign: "center",
          lineHeight: `${height}px`,
        }}
      >
        —
      </span>
    );
  }
  const max = Math.max(...values, 1);
  const step = values.length > 1 ? width / (values.length - 1) : 0;
  const path = values
    .map((v, i) => {
      const x = i * step;
      const y = height - (v / max) * (height - 2) - 1;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const area = `${path} L${(values.length - 1) * step},${height} L0,${height} Z`;
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ display: "block" }}
      aria-label={`30-day settlements sparkline (${values.length} data points)`}
    >
      <path d={area} fill={color} fillOpacity={0.16} stroke="none" />
      <path d={path} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function ChainBadge({ chain }: { chain: ChainKey }) {
  const label = chain === "base" ? "BASE" : "SOL";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "1px 6px",
        borderRadius: 3,
        background: `${CHAIN_COLOR[chain]}1a`,
        color: CHAIN_COLOR[chain],
        fontSize: 10,
        fontWeight: 700,
        fontFamily: "var(--font-mono, ui-monospace)",
        letterSpacing: 0.4,
      }}
    >
      {label}
    </span>
  );
}

function formatRate(rate: number): { label: string; tone: string } {
  const pct = rate * 100;
  if (rate >= 0.9) return { label: `${pct.toFixed(1)}%`, tone: "var(--color-up, #22c55e)" };
  if (rate >= 0.5) return { label: `${pct.toFixed(1)}%`, tone: "var(--color-warning, #f59e0b)" };
  return { label: `${pct.toFixed(1)}%`, tone: "var(--color-down, #ef4444)" };
}

function relTime(isoDay: string | null): string {
  if (!isoDay) return "no activity";
  const then = new Date(isoDay).getTime();
  if (Number.isNaN(then)) return isoDay;
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "1d ago";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

export default async function FacilitatorLeaderboardPage() {
  // Refresh both source datasets through the Redis-first hooks. Fast (30s
  // dedupe), so calling on every render is a no-op after the first hit.
  await Promise.all([
    refreshBaseX402OnchainFromStore(),
    refreshSolanaX402OnchainFromStore(),
  ]);

  const base = getBaseX402Onchain();
  const sol = getSolanaX402Onchain();

  const allNames = new Set<string>();
  for (const k of Object.keys(base?.byFacilitator ?? {})) allNames.add(k);
  for (const k of Object.keys(sol?.byFacilitator ?? {})) allNames.add(k);

  const rows: FacilitatorRow[] = [...allNames]
    .map<FacilitatorRow>((name) => {
      const b = base?.byFacilitator?.[name];
      const s = sol?.byFacilitator?.[name];
      const baseSettlements = b?.x402Settlements ?? 0;
      const solSettlements = s?.x402Settlements ?? 0;
      const baseTxs = b?.totalTxs ?? 0;
      const solTxs = s?.totalTxs ?? 0;
      const baseAddrs = b?.addressCount ?? 0;
      const solAddrs = s?.addressCount ?? 0;
      const totalSettlements = baseSettlements + solSettlements;
      const totalTxs = baseTxs + solTxs;
      const settlementRate = totalTxs > 0 ? totalSettlements / totalTxs : 0;
      const networks: ChainKey[] = [];
      if (b) networks.push("base");
      if (s) networks.push("solana");
      const { spark, lastActivityISO } = buildSparkline(
        name,
        base?.byDay,
        sol?.byDay,
        30,
      );
      return {
        name,
        networks,
        totalSettlements,
        totalTxs,
        totalAddresses: baseAddrs + solAddrs,
        settlementRate,
        baseSettlements,
        solSettlements,
        baseTxs,
        solTxs,
        baseAddrs,
        solAddrs,
        spark,
        lastActivityISO,
      };
    })
    .sort((a, b) => b.totalSettlements - a.totalSettlements);

  const totalFacs = rows.length;
  const totalSettlements = rows.reduce((s, r) => s + r.totalSettlements, 0);
  const totalTxs = rows.reduce((s, r) => s + r.totalTxs, 0);
  const networksCovered =
    (rows.some((r) => r.networks.includes("base")) ? 1 : 0) +
    (rows.some((r) => r.networks.includes("solana")) ? 1 : 0);

  const aggregateRate = totalTxs > 0 ? totalSettlements / totalTxs : 0;

  // Last-fetched timestamps from each source — newest wins for the page
  // freshness chip. Aligns with FreshnessBadge convention used elsewhere.
  const lastFetchedAt = (() => {
    const candidates = [base?.fetchedAt, sol?.fetchedAt].filter(
      (v): v is string => typeof v === "string" && v.length > 0,
    );
    if (candidates.length === 0) return null;
    return candidates.sort().reverse()[0];
  })();

  const fetchedAgoLabel = lastFetchedAt ? relTime(lastFetchedAt) : null;

  // Combined recent samples feed (last 12 across both chains).
  const recentSamples = (() => {
    type Combined = {
      chain: ChainKey;
      facilitator: string;
      txId: string;
      href: string;
      ts: number;
      tsLabel: string;
    };
    const out: Combined[] = [];
    for (const s of base?.samples ?? []) {
      const ts = s.timestamp ? new Date(s.timestamp).getTime() : NaN;
      if (Number.isNaN(ts)) continue;
      out.push({
        chain: "base",
        facilitator: s.facilitator,
        txId: s.txHash,
        href: `https://basescan.org/tx/${s.txHash}`,
        ts,
        tsLabel: relTime(s.timestamp),
      });
    }
    for (const s of sol?.samples ?? []) {
      const ts = s.blockTime ? new Date(s.blockTime).getTime() : NaN;
      if (Number.isNaN(ts)) continue;
      out.push({
        chain: "solana",
        facilitator: s.facilitator,
        txId: s.txSig,
        href: `https://solscan.io/tx/${s.txSig}`,
        ts,
        tsLabel: relTime(s.blockTime),
      });
    }
    return out.sort((a, b) => b.ts - a.ts).slice(0, 12);
  })();

  const isCold = totalFacs === 0;

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
        <span className="sec-num">{"// 00"}</span>
        <h1 className="sec-title">x402 Facilitator Leaderboard</h1>
        <span className="sec-meta">
          {fetchedAgoLabel ? (
            <>
              data <b>{fetchedAgoLabel}</b> · <b>base</b> + <b>solana</b> indexers
            </>
          ) : (
            <>indexer data not yet collected</>
          )}
        </span>
      </div>
      <p
        style={{
          color: "var(--color-text-faint)",
          fontFamily: "var(--font-mono, ui-monospace)",
          fontSize: 13,
          lineHeight: 1.55,
          maxWidth: 720,
          margin: 0,
        }}
      >
        Etherscan for agent payments — every x402 facilitator across Base and
        Solana, ranked by settlement volume with per-facilitator success rate
        and 30-day momentum. Source:{" "}
        <Link
          href="/agent-commerce"
          style={{ color: "var(--color-text-default)" }}
        >
          /agent-commerce
        </Link>{" "}
        on-chain indexers (Blockscout · mainnet-beta RPC).
      </p>

      <MetricGrid columns={5}>
        <Metric
          label="facilitators"
          value={totalFacs.toLocaleString("en-US")}
          tone="neutral"
        />
        <Metric
          label="settlements"
          value={totalSettlements.toLocaleString("en-US")}
          tone="accent"
        />
        <Metric
          label="transactions"
          value={totalTxs.toLocaleString("en-US")}
          tone="neutral"
        />
        <Metric
          label="settlement rate"
          value={`${(aggregateRate * 100).toFixed(1)}%`}
          tone={
            aggregateRate >= 0.8
              ? "positive"
              : aggregateRate >= 0.5
              ? "warning"
              : "negative"
          }
          sub="settled ÷ tx"
        />
        <Metric
          label="networks"
          value={networksCovered.toLocaleString("en-US")}
          tone="neutral"
          sub="base · solana"
        />
      </MetricGrid>

      <SectionHead
        num="// 01"
        title="Leaderboard · ranked by settlements"
        meta={
          <>
            sort: settlements · <b>{rows.length}</b> rows
          </>
        }
      />

      {isCold ? (
        <Card>
          <CardBody>
            <p
              style={{
                color: "var(--color-text-faint)",
                fontFamily: "var(--font-mono, ui-monospace)",
                fontSize: 13,
                padding: "16px 8px",
                textAlign: "center",
              }}
            >
              No facilitator data on disk. The on-chain indexers
              (scripts/fetch-base-x402-onchain.mjs,
              scripts/fetch-solana-x402-onchain.mjs) have not produced output
              yet — check the latest{" "}
              <code>cron-agent-commerce.yml</code> workflow run.
            </p>
          </CardBody>
        </Card>
      ) : (
        <Card>
          <CardHeader showCorner right={<span>updated hourly · ISR 30m</span>}>
            Facilitators
          </CardHeader>
          <CardBody>
            <div
              role="table"
              aria-label="x402 facilitators ranked by settlements"
              style={{
                display: "grid",
                gridTemplateColumns:
                  "32px minmax(140px, 1.4fr) 96px 92px 76px 72px 84px 110px 78px",
                fontSize: 12,
                fontFamily: "var(--font-mono, ui-monospace)",
              }}
            >
              <div role="row" style={headerRowStyle}>
                <span style={headerCellStyle}>#</span>
                <span style={headerCellStyle}>facilitator</span>
                <span style={headerCellStyle}>networks</span>
                <span style={{ ...headerCellStyle, textAlign: "right" }}>
                  settlements
                </span>
                <span style={{ ...headerCellStyle, textAlign: "right" }}>
                  txs
                </span>
                <span style={{ ...headerCellStyle, textAlign: "right" }}>
                  addrs
                </span>
                <span style={{ ...headerCellStyle, textAlign: "right" }}>
                  rate
                </span>
                <span style={{ ...headerCellStyle, textAlign: "center" }}>
                  30d
                </span>
                <span style={{ ...headerCellStyle, textAlign: "right" }}>
                  last
                </span>
              </div>

              {rows.map((row, idx) => {
                const tone = FAC_COLOR[row.name] ?? "var(--color-text-faint)";
                const rate = formatRate(row.settlementRate);
                return (
                  <Link
                    key={row.name}
                    role="row"
                    href={`/agent-commerce/facilitator/${encodeURIComponent(row.name)}`}
                    style={dataRowLinkStyle}
                  >
                    <span style={cellStyle}>{idx + 1}</span>
                    <span style={{ ...cellStyle, color: tone, fontWeight: 700 }}>
                      {row.name}
                    </span>
                    <span style={{ ...cellStyle, display: "flex", gap: 4 }}>
                      {row.networks.map((n) => (
                        <ChainBadge key={n} chain={n} />
                      ))}
                    </span>
                    <span style={{ ...cellStyle, textAlign: "right", fontWeight: 700 }}>
                      {row.totalSettlements.toLocaleString("en-US")}
                    </span>
                    <span
                      style={{
                        ...cellStyle,
                        textAlign: "right",
                        color: "var(--color-text-faint)",
                      }}
                    >
                      {row.totalTxs.toLocaleString("en-US")}
                    </span>
                    <span
                      style={{
                        ...cellStyle,
                        textAlign: "right",
                        color: "var(--color-text-faint)",
                      }}
                    >
                      {row.totalAddresses.toLocaleString("en-US")}
                    </span>
                    <span
                      style={{
                        ...cellStyle,
                        textAlign: "right",
                        color: rate.tone,
                        fontWeight: 700,
                      }}
                    >
                      {rate.label}
                    </span>
                    <span style={{ ...cellStyle, justifyContent: "center" }}>
                      <Sparkline values={row.spark} color={tone} />
                    </span>
                    <span
                      style={{
                        ...cellStyle,
                        textAlign: "right",
                        color: "var(--color-text-faint)",
                        fontSize: 11,
                      }}
                    >
                      {relTime(row.lastActivityISO)}
                    </span>
                  </Link>
                );
              })}
            </div>
          </CardBody>
        </Card>
      )}

      {recentSamples.length > 0 ? (
        <>
          <SectionHead
            num="// 02"
            title="Recent settlements · live feed"
            meta={
              <>
                <b>{recentSamples.length}</b> latest · base + solana
              </>
            }
          />
          <Card>
            <CardBody>
              <ul
                style={{
                  listStyle: "none",
                  padding: 0,
                  margin: 0,
                  fontFamily: "var(--font-mono, ui-monospace)",
                  fontSize: 12,
                }}
              >
                {recentSamples.map((s) => {
                  const tone = FAC_COLOR[s.facilitator] ?? "var(--color-text-faint)";
                  return (
                    <li
                      key={`${s.chain}:${s.txId}`}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "60px 120px 1fr 90px",
                        alignItems: "center",
                        gap: 12,
                        padding: "8px 12px",
                        borderBottom: "1px solid var(--color-border-subtle)",
                      }}
                    >
                      <ChainBadge chain={s.chain} />
                      <span style={{ color: tone, fontWeight: 700 }}>
                        {s.facilitator}
                      </span>
                      <a
                        href={s.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          color: "var(--color-text-default)",
                          fontSize: 11,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {s.txId}
                      </a>
                      <span
                        style={{
                          textAlign: "right",
                          color: "var(--color-text-faint)",
                          fontSize: 11,
                        }}
                      >
                        {s.tsLabel}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </CardBody>
          </Card>
        </>
      ) : null}

      <FooterBar />
    </main>
  );
}

const headerRowStyle = {
  display: "contents",
} as const;

const headerCellStyle = {
  padding: "10px 12px",
  background: "var(--color-bg-subtle)",
  color: "var(--color-text-faint)",
  fontSize: 10,
  letterSpacing: 0.5,
  textTransform: "uppercase" as const,
  fontWeight: 600,
  borderBottom: "1px solid var(--color-border-default)",
};

const dataRowLinkStyle = {
  display: "contents",
  textDecoration: "none",
  color: "inherit",
} as const;

const cellStyle = {
  padding: "10px 12px",
  borderBottom: "1px solid var(--color-border-subtle)",
  display: "flex",
  alignItems: "center",
  color: "var(--color-text-default)",
  transition: "background 120ms",
};
