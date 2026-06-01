// /agent-commerce — Agent Commerce M2M cockpit (Phase 2C).
//
// Reads:
//   - getAgentCommerceStats() — item counts
//   - getBaseX402Onchain() / getSolanaX402Onchain() — facilitator + tx counts
//   - getDuneX402Volume() — historical USD volume per facilitator/day
//   - getAgentCommerceFetchedAt() — freshness pill
//
// Refresh: fire every refresh hook in parallel at the top (each is internally
// rate-limited to 30s + in-flight-deduped). revalidate=60 caps per-edge
// cache at 1 min.

import {
  refreshAgentCommerceFromStore,
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
  classifyDuneX402VolumeStatus,
} from "@/lib/dune-x402-volume";

import {
  AgentCommerceHero,
  PERIODS,
  type AgentCommercePeriod,
} from "@/components/agent-commerce/AgentCommerceHero";
import { AgentCommerceRouteStyles } from "@/components/agent-commerce/AgentCommerceRouteStyles";
import { AgentCommerceTokenTape } from "@/components/agent-commerce/AgentCommerceTokenTape";
import { AcValueStrip } from "@/components/agent-commerce/AcValueStrip";
import { AcKpiStrip } from "@/components/agent-commerce/AcKpiStrip";
import { OnchainSettlements } from "@/components/agent-commerce/OnchainSettlements";
import { PaymentVolumeChart } from "@/components/agent-commerce/PaymentVolumeChart";
import { TopFacilitatorsTable } from "@/components/agent-commerce/TopFacilitatorsTable";
import { AgentTokensPanel } from "@/components/agent-commerce/AgentTokensPanel";
import { VirtualsAgentsPanel } from "@/components/agent-commerce/VirtualsAgentsPanel";
import { X402ServicesPanel } from "@/components/agent-commerce/X402ServicesPanel";
import { fetchAgentTokens } from "@/lib/agent-commerce/live-tokens";
import { fetchVirtualAgents } from "@/lib/agent-commerce/virtuals";
import { fetchX402Market } from "@/lib/agent-commerce/agentic-market";
import { getTokenRows } from "@/components/agent-commerce/displayData";

// 60-second ISR — keeps the live x402 quote/agentic feeds + the
// PaymentVolumeChart freshness pill within ~1 min of upstream changes.
// Underlying TOOLBOX collectors still write daily, but the live RSS +
// CoinGecko + Virtuals fetches above benefit from the tighter cycle.
export const revalidate = 60;

// Note: SEO 66 is by-design on /agent-commerce — middleware sets
// X-Robots-Tag: noindex,nofollow via the cost-guard config because the page
// is expensive for AI crawlers to process. Lighthouse's SEO score reflects
// the noindex header and is intentional. Do not "fix" by removing the
// header — it's preserved on purpose.
export const metadata = {
  title: "Agent Commerce",
  description:
    "Live x402 on-chain activity (Base, Solana), MCP server health, portal-ready APIs, agent infrastructure ranked by composite score.",
  openGraph: {
    title: "Agent Commerce — x402 / MCP / a2a cockpit",
    description:
      "Live x402 on-chain settlements, MCP server health, portal-ready endpoints, agent commerce composite scoring across Base + Solana.",
    type: "website",
    images: [
      {
        url: "/api/og/agent-commerce",
        width: 1200,
        height: 630,
        alt: "Agent Commerce — x402 settlements, MCP servers, portal-ready endpoints",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Agent Commerce — x402 / MCP / a2a cockpit",
    description:
      "Live x402 on-chain settlements, MCP server health, portal-ready endpoints, agent commerce composite scoring across Base + Solana.",
  },
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

  // Fire all refresh hooks + live data fetches in parallel.
  // Sources:
  //   - refreshAgentCommerceFromStore / refreshBaseX402... / refreshSolanaX402... /
  //     refreshDuneX402... — TOOLBOX-collected JSON via the data-store
  //   - fetchAgentTokens — live CoinGecko quotes for AI-agent tokens
  //   - fetchVirtualAgents — live Virtuals Protocol on-Base agent registry
  //     (VIRTUAL price flows in below from the CoinGecko fetch above)
  const [, , , duneRefresh, agentTokens] = await Promise.all([
    refreshAgentCommerceFromStore().catch(() => undefined),
    refreshBaseX402OnchainFromStore().catch(() => undefined),
    refreshSolanaX402OnchainFromStore().catch(() => undefined),
    refreshDuneX402VolumeFromStore().catch(() => undefined),
    fetchAgentTokens().catch(() => []),
  ]);
  const virtualPriceUsd =
    agentTokens.find((t) => t.id === "virtual-protocol")?.priceUsd ?? 0;
  const [virtualAgents, x402Market] = await Promise.all([
    fetchVirtualAgents(virtualPriceUsd, 10).catch(() => []),
    fetchX402Market(200).catch(() => ({
      services: [],
      totalServices: 0,
      categories: [],
      networks: [],
      fetchedAt: new Date().toISOString(),
    })),
  ]);

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
  const duneRows = dune?.rows ?? [];
  const duneVolumeStatus = classifyDuneX402VolumeStatus(dune, duneRefresh);
  const onchainVolumeAvailable = duneVolumeStatus.status === "fresh";

  // Dune day-bucketed USD volume split by chain. Facilitators on Base vs
  // Solana are distinguished by name heuristics — Solana facilitators tend
  // to include "solana" or end in well-known solana suffixes; everything
  // else defaults to Base.
  const isSolanaFac = (name: string): boolean =>
    /solana|sol-/i.test(name) || name.toLowerCase().includes("crossmint");
  const isBaseFac = (name: string): boolean => !isSolanaFac(name);

  // Real on-chain volumes from Dune — no synthetic floors. Empty days
  // surface as 0 so the operator can see TOOLBOX dune-x402-volume is quiet.
  // Missing or stale Dune must stay unavailable instead of becoming "$0".
  const baseVolumeUsd24h = onchainVolumeAvailable
    ? sumDuneVolume(duneRows, isBaseFac)
    : 0;
  const solanaVolumeUsd24h = onchainVolumeAvailable
    ? sumDuneVolume(duneRows, isSolanaFac)
    : 0;
  const onchain24hUsd = baseVolumeUsd24h + solanaVolumeUsd24h;

  const basePctShare =
    onchain24hUsd > 0
      ? Math.round((baseVolumeUsd24h / onchain24hUsd) * 100)
      : 0;
  const solanaPctShare = onchain24hUsd > 0 ? 100 - basePctShare : 0;

  const x402EndpointCount =
    Object.keys(base?.byFacilitator ?? {}).length +
    Object.keys(solana?.byFacilitator ?? {}).length;

  // Real counts only — no synthetic floors (was: 142, 87, 62, 42, 6, 18).
  const itemCount = stats.totalItems;
  const x402Count = Math.max(stats.x402EnabledCount, x402EndpointCount);
  const mcpServers = stats.mcpServerCount;
  const portalReady = stats.portalReadyCount;
  const newThisWeek = stats.thisWeekCount;
  // Until live MCP health probes ship, tracked count is known but health is not.
  const mcpHealthKnown = false;
  const mcpDegraded = 0;
  // Token tables are now driven by live CoinGecko data (no SEED_TOKENS).
  const gainers = getTokenRows(agentTokens, "gainers", 5);
  const losers = getTokenRows(agentTokens, "losers", 3);

  return (
    <div className="agent-commerce-page">
      <AgentCommerceRouteStyles />
      <AcPageStyles />
      <AgentCommerceTokenTape
        gainers={gainers}
        losers={losers}
        baseVolumeUsd24h={baseVolumeUsd24h}
        solanaVolumeUsd24h={solanaVolumeUsd24h}
        x402Endpoints={x402Count}
        x402NewThisWeek={newThisWeek}
        mcpServers={mcpServers}
        mcpDegraded={mcpDegraded}
        mcpHealthKnown={mcpHealthKnown}
        portalReady={portalReady}
        duneVolumeStatus={duneVolumeStatus.status}
      />
      <AgentCommerceHero
        period={period}
        fetchedAt={fetchedAt}
        itemCount={itemCount}
        liveEndpoints={x402Count}
        onchain24hUsd={onchain24hUsd}
        onchainVolumeAvailable={onchainVolumeAvailable}
      />

      <AcKpiStrip
        itemsTracked={itemCount}
        x402Enabled={x402Count}
        x402NewThisWeek={newThisWeek}
        mcpServers={mcpServers}
        mcpDegraded={mcpDegraded}
        mcpHealthKnown={mcpHealthKnown}
        onchain24hUsd={onchain24hUsd}
        basePctShare={basePctShare}
        solanaPctShare={solanaPctShare}
        duneVolumeStatus={duneVolumeStatus.status}
        portalReady={portalReady}
      />

      <div className="ac-page-grid">
        <div className="ac-main">
          <PaymentVolumeChart base={base} solana={solana} />

          <OnchainSettlements
            base={base}
            solana={solana}
            baseVolumeUsd24h={baseVolumeUsd24h}
            solanaVolumeUsd24h={solanaVolumeUsd24h}
            duneVolumeStatus={duneVolumeStatus.status}
          />

          <X402ServicesPanel market={x402Market} limit={12} />

          <VirtualsAgentsPanel agents={virtualAgents} />
        </div>

        <div className="ac-rail">
          <AgentTokensPanel tokens={agentTokens} />
          <TopFacilitatorsTable
            base={base}
            solana={solana}
            dune={dune}
            duneVolumeStatus={duneVolumeStatus.status}
            limit={5}
          />
        </div>
      </div>

      <AcValueStrip />
    </div>
  );
}

function AcPageStyles() {
  return (
    <style
      dangerouslySetInnerHTML={{
        __html: `
.ac-page-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 16px;
  margin-top: 6px;
}
.ac-main { min-width: 0; display: flex; flex-direction: column; gap: 14px; }
.ac-rail { min-width: 0; }
@media (max-width: 1100px) {
  .ac-page-grid { grid-template-columns: 1fr; }
}
`,
      }}
    />
  );
}
