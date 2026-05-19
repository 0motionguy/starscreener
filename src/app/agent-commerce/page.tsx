// /agent-commerce — Agent Commerce M2M cockpit (Phase 2C).
//
// Reads:
//   - getAgentCommerceItems() + getAgentCommerceStats() — items + counts
//   - getBaseX402Onchain() / getSolanaX402Onchain() — facilitator + tx counts
//   - getDuneX402Volume() — historical USD volume per facilitator/day
//   - getAgentCommerceFetchedAt() — freshness pill
//
// Refresh: fire every refresh hook in parallel at the top (each is internally
// rate-limited to 30s + in-flight-deduped). revalidate=1800 caps per-edge
// cache at 30 min.

import {
  refreshAgentCommerceFromStore,
  getAgentCommerceItems,
  getAgentCommerceStats,
  getAgentCommerceFetchedAt,
} from "@/lib/agent-commerce";
import {
  refreshBaseX402OnchainFromStore,
  getBaseX402Onchain,
} from "@/lib/base-x402-onchain";
import {
  refreshSolanaX402OnchainFromStore,
  getSolanaX402Onchain,
} from "@/lib/solana-x402-onchain";
import {
  refreshDuneX402VolumeFromStore,
  getDuneX402Volume,
} from "@/lib/dune-x402-volume";

import {
  AgentCommerceHero,
  PERIODS,
  type AgentCommercePeriod,
} from "@/components/agent-commerce/AgentCommerceHero";
import { AcKpiStrip } from "@/components/agent-commerce/AcKpiStrip";
import { ProtocolPulseGrid } from "@/components/agent-commerce/ProtocolPulseGrid";
import { OnchainSettlements } from "@/components/agent-commerce/OnchainSettlements";
import { TokenGainersTable } from "@/components/agent-commerce/TokenGainersTable";
import { TokenLosersTable } from "@/components/agent-commerce/TokenLosersTable";
import { CompositeMoversBoard } from "@/components/agent-commerce/CompositeMoversBoard";
import { ScoreDistributionHistogram } from "@/components/agent-commerce/ScoreDistributionHistogram";
import { TopFacilitatorsTable } from "@/components/agent-commerce/TopFacilitatorsTable";

export const revalidate = 1800;

export const metadata = {
  title: "Agent Commerce",
  description:
    "Live x402 on-chain activity (Base, Solana), MCP server health, portal-ready APIs, agent infrastructure ranked by composite score.",
};

interface Props {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

/** Sum USDC volume for "last 24h" from the Dune day-keyed rows. */
function sumDuneVolume(
  rows: { day: string; facilitator: string; volumeUsdc: string }[] | undefined,
  chainFilter: (facilitator: string) => boolean,
): number {
  if (!rows || rows.length === 0) return 0;
  // Pick the most recent calendar day represented in the rows.
  const days = [...new Set(rows.map((r) => r.day))].sort();
  const latestDay = days[days.length - 1];
  if (!latestDay) return 0;
  return rows
    .filter((r) => r.day === latestDay && chainFilter(r.facilitator))
    .reduce((acc, r) => {
      const v = Number(r.volumeUsdc);
      return acc + (Number.isFinite(v) ? v : 0);
    }, 0);
}

export default async function AgentCommercePage({ searchParams }: Props) {
  const params = (await searchParams) ?? {};
  const rawPeriod = typeof params.period === "string" ? params.period : "24h";
  const period = (PERIODS.find((p) => p.id === rawPeriod)?.id ??
    "24h") as AgentCommercePeriod;

  // Fire all refresh hooks in parallel. allSettled so a single broken slug
  // doesn't take the page down.
  await Promise.allSettled([
    refreshAgentCommerceFromStore(),
    refreshBaseX402OnchainFromStore(),
    refreshSolanaX402OnchainFromStore(),
    refreshDuneX402VolumeFromStore(),
  ]);

  const items = safe(() => getAgentCommerceItems(), []);
  const stats = safe(() => getAgentCommerceStats(), {
    totalItems: 0,
    byKind: {} as Record<string, number>,
    byCategory: {} as Record<string, number>,
    byProtocol: {} as Record<string, number>,
    portalReadyCount: 0,
    x402EnabledCount: 0,
    mcpServerCount: 0,
    agentActionableCount: 0,
    highAisoCount: 0,
    thisWeekCount: 0,
    topComposite: 0,
    averageComposite: 0,
  });
  const fetchedAt = safe(() => getAgentCommerceFetchedAt(), null);

  const base = safe(() => getBaseX402Onchain(), null);
  const solana = safe(() => getSolanaX402Onchain(), null);
  const dune = safe(() => getDuneX402Volume(), null);

  // Dune day-bucketed USD volume split by chain. Facilitators on Base vs
  // Solana are distinguished by name heuristics — Solana facilitators tend
  // to include "solana" or end in well-known solana suffixes; everything
  // else defaults to Base.
  const isSolanaFac = (name: string): boolean =>
    /solana|sol-/i.test(name) || name.toLowerCase().includes("crossmint");
  const isBaseFac = (name: string): boolean => !isSolanaFac(name);

  const baseVolumeUsd24h = sumDuneVolume(dune?.rows, isBaseFac);
  const solanaVolumeUsd24h = sumDuneVolume(dune?.rows, isSolanaFac);
  const onchain24hUsd = baseVolumeUsd24h + solanaVolumeUsd24h;

  // KPI strip math.
  const totalSettlements =
    (base?.totalSettlements ?? 0) + (solana?.totalSettlements ?? 0);
  const basePctShare =
    totalSettlements > 0
      ? Math.round(((base?.totalSettlements ?? 0) / totalSettlements) * 100)
      : 0;
  const solanaPctShare =
    totalSettlements > 0
      ? Math.round(((solana?.totalSettlements ?? 0) / totalSettlements) * 100)
      : 0;

  const x402EndpointCount =
    Object.keys(base?.byFacilitator ?? {}).length +
    Object.keys(solana?.byFacilitator ?? {}).length;

  // MCP health is not directly tracked yet — assume healthy unless badges
  // mark otherwise. Degraded count placeholder until MCP probe lib lands.
  const mcpServers = stats.mcpServerCount;
  const mcpDegraded = 0;
  const mcpHealthy = Math.max(0, mcpServers - mcpDegraded);

  const a2aCount = stats.byProtocol["a2a"] ?? 0;

  return (
    <div style={{ padding: "16px 22px 32px", maxWidth: 1500, margin: "0 auto" }}>
      <AgentCommerceHero
        period={period}
        fetchedAt={fetchedAt}
        itemCount={stats.totalItems}
        liveEndpoints={stats.x402EnabledCount}
        onchain24hUsd={onchain24hUsd}
      />

      <AcKpiStrip
        itemsTracked={stats.totalItems}
        x402Enabled={stats.x402EnabledCount}
        x402NewThisWeek={stats.thisWeekCount}
        mcpServers={mcpServers}
        mcpHealthy={mcpHealthy}
        mcpDegraded={mcpDegraded}
        onchain24hUsd={onchain24hUsd}
        basePctShare={basePctShare}
        solanaPctShare={solanaPctShare}
        portalReady={stats.portalReadyCount}
      />

      <ProtocolPulseGrid
        x402OnchainUsd={onchain24hUsd}
        x402EndpointCount={Math.max(stats.x402EnabledCount, x402EndpointCount)}
        mcpServerCount={mcpServers}
        mcpHealthy={mcpHealthy}
        mcpDegraded={mcpDegraded}
        a2aCount={a2aCount}
      />

      <OnchainSettlements
        base={base}
        solana={solana}
        baseVolumeUsd24h={baseVolumeUsd24h > 0 ? baseVolumeUsd24h : null}
        solanaVolumeUsd24h={solanaVolumeUsd24h > 0 ? solanaVolumeUsd24h : null}
      />

      <div
        className="ac-cols fade-up"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 14,
          marginBottom: 14,
        }}
      >
        <TokenGainersTable items={items} limit={5} />
        <TokenLosersTable items={items} limit={3} />
      </div>

      <CompositeMoversBoard items={items} limit={10} />

      <div
        className="ac-cols fade-up"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 14,
          marginBottom: 14,
        }}
      >
        <ScoreDistributionHistogram items={items} />
        <TopFacilitatorsTable base={base} solana={solana} dune={dune} limit={5} />
      </div>
    </div>
  );
}
