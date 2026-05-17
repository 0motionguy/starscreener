// /agent-commerce — Agent Commerce radar (M2M economy: x402, MCP, wallets, APIs).
//
// V4 rebuild (2026-05-17). Replaces a 2293-line monolith that:
//   - Used V2/V3 design tokens while every neighbor (/funding, /signals) was V4.
//   - Synthesised a fake growth curve via Math.pow(frac, 1.4) and rendered it
//     as the headline trend chart — freshness-honesty violation.
//   - Awaited searchParams in the RSC, forcing full-dynamic rendering and
//     breaking ISR.
//   - Hand-rolled 111 inline style blocks + 61 hardcoded hexes.
//
// The new shell:
//   - Renders the static v4 chrome (PageHead / KpiBand / VerdictRibbon /
//     SectionHead) on the server, with `revalidate=1200`.
//   - Delegates tabs + filter bar + browse grid to a client island
//     (AgentCommerceFilteredContent) that reads useSearchParams() — so the
//     RSC stays ISR-cacheable.
//   - Drops the synthetic Sparkline + MiniBoard + growthCurve. Surfaces only
//     real data.
//   - Wires FreshnessBadge so the chrome reflects classifyFreshness('skills').

import type { Metadata } from "next";

import "@/components/agent-commerce/agent-commerce.css";

import { PageHead } from "@/components/ui/PageHead";
import { SectionHead } from "@/components/ui/SectionHead";
import { KpiBand } from "@/components/ui/KpiBand";
import {
  VerdictRibbon,
  type VerdictTone,
} from "@/components/ui/VerdictRibbon";
import { FreshnessBadge } from "@/components/shared/FreshnessBadge";
import { classifyFreshness } from "@/lib/news/freshness";

import { AgentCommerceTicker } from "@/components/agent-commerce/AgentCommerceTicker";
import type { AgentCommerceTickerItem } from "@/components/agent-commerce/AgentCommerceTicker";
import { AgentCommerceFilteredContent } from "@/components/agent-commerce/AgentCommerceFilteredContent";
import { MoversBoard } from "@/components/agent-commerce/MoversBoard";
import { ProtocolPulseGrid } from "@/components/agent-commerce/ProtocolPulseGrid";
import { ScoreDistributionGrid } from "@/components/agent-commerce/ScoreDistributionGrid";
import { TokenEconomyBoards } from "@/components/agent-commerce/TokenEconomyBoards";
import { OnchainSettlementsBoard } from "@/components/agent-commerce/OnchainSettlementsBoard";
import { DuneVolumeBoard } from "@/components/agent-commerce/DuneVolumeBoard";

import {
  getAgentCommerceFile,
  getAgentCommerceItems,
  getAgentCommerceStats,
  isAgentCommerceCold,
  refreshAgentCommerceFromStore,
} from "@/lib/agent-commerce";
import {
  buildTabCounts,
  CLIENT_CORPUS_LIMIT,
  toSlimAgentCommerceTopItems,
} from "@/lib/agent-commerce/slim";
import {
  getBaseX402Onchain,
  refreshBaseX402OnchainFromStore,
} from "@/lib/base-x402-onchain";
import {
  getSolanaX402Onchain,
  refreshSolanaX402OnchainFromStore,
} from "@/lib/solana-x402-onchain";
import {
  getDuneX402Volume,
  refreshDuneX402VolumeFromStore,
} from "@/lib/dune-x402-volume";
import type { AgentCommerceItem } from "@/lib/agent-commerce/types";

export const revalidate = 1200;

export const metadata: Metadata = {
  title: "Agent Commerce — TrendingRepo",
  description:
    "Live x402 on-chain + AI agent commerce activity — Base, Solana, Dune protocols ranked by 24h volume.",
  alternates: { canonical: "https://trendingrepo.com/agent-commerce" },
  openGraph: {
    title: "Agent Commerce — TrendingRepo",
    description:
      "Live x402 on-chain + AI agent commerce activity — Base, Solana, Dune protocols ranked by 24h volume.",
    url: "https://trendingrepo.com/agent-commerce",
    type: "website",
    images: [{ url: "/api/og/agent-commerce", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Agent Commerce — TrendingRepo",
    description: "Live x402 on-chain + AI agent commerce activity.",
    images: ["/api/og/agent-commerce"],
  },
  robots: { index: true, follow: true },
};

function formatClock(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  if (value.startsWith("1970-")) return "—";
  return date.toISOString().slice(11, 19);
}

function buildTickerItems(
  items: AgentCommerceItem[],
): AgentCommerceTickerItem[] {
  const ticker: AgentCommerceTickerItem[] = [];
  const tokenItems = items.filter((i) => i.live?.tokenSymbol);

  const gainers = tokenItems
    .filter((i) => Number.isFinite(i.live?.priceChange24hPct))
    .slice()
    .sort(
      (a, b) =>
        (b.live?.priceChange24hPct ?? 0) -
        (a.live?.priceChange24hPct ?? 0),
    )
    .slice(0, 5);
  for (const item of gainers) {
    const change = item.live?.priceChange24hPct ?? 0;
    ticker.push({
      kind: change >= 0 ? "token-up" : "token-down",
      href: `/agent-commerce/${item.slug}`,
      label: `$${item.live?.tokenSymbol ?? ""}`,
      text: item.name,
      value: `${change >= 0 ? "+" : ""}${change.toFixed(1)}%`,
      down: change < 0,
    });
  }

  const losers = tokenItems
    .filter((i) => Number.isFinite(i.live?.priceChange24hPct))
    .slice()
    .sort(
      (a, b) =>
        (a.live?.priceChange24hPct ?? 0) -
        (b.live?.priceChange24hPct ?? 0),
    )
    .slice(0, 3);
  for (const item of losers) {
    const change = item.live?.priceChange24hPct ?? 0;
    ticker.push({
      kind: "token-down",
      href: `/agent-commerce/${item.slug}`,
      label: `$${item.live?.tokenSymbol ?? ""}`,
      text: item.name,
      value: `${change.toFixed(1)}%`,
      down: true,
    });
  }

  type FreshGithubRow = {
    item: AgentCommerceItem;
    ts: number;
    stars: number;
  };
  const freshGithub: FreshGithubRow[] = items
    .map<FreshGithubRow | null>((i) => {
      const pushedAt = i.live?.pushedAt;
      const stars = i.live?.stars;
      if (typeof pushedAt !== "string" || typeof stars !== "number") return null;
      const ts = new Date(pushedAt).getTime();
      if (!Number.isFinite(ts) || stars <= 50) return null;
      return { item: i, ts, stars };
    })
    .filter((row): row is FreshGithubRow => row !== null)
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 4);
  for (const { item, ts, stars } of freshGithub) {
    const days = Math.max(0, Math.floor((Date.now() - ts) / 86_400_000));
    ticker.push({
      kind: "github-push",
      href: `/agent-commerce/${item.slug}`,
      label: item.name,
      text: `★${stars.toLocaleString("en-US")}`,
      value: days === 0 ? "today" : `${days}d ago`,
    });
  }

  return ticker;
}

export default async function AgentCommercePage() {
  await Promise.all([
    refreshAgentCommerceFromStore(),
    refreshBaseX402OnchainFromStore(),
    refreshSolanaX402OnchainFromStore(),
    refreshDuneX402VolumeFromStore(),
  ]);

  const file = getAgentCommerceFile();
  const items = getAgentCommerceItems();
  const stats = getAgentCommerceStats();
  const cold = isAgentCommerceCold(file);
  const computed = formatClock(file.fetchedAt);
  const tickerItems = buildTickerItems(items);

  const sortedByScore = items
    .slice()
    .sort((a, b) => b.scores.composite - a.scores.composite);
  const movers = sortedByScore.slice(0, 12);

  const base = getBaseX402Onchain();
  const solana = getSolanaX402Onchain();
  const dune = getDuneX402Volume();

  // Mirror the FreshnessBadge's verdict on the VerdictRibbon — money tone when
  // the feed is live, amber when stale/cold. The 'skills' source uses the
  // 12h slow-cron budget which matches agent-commerce's 12h worker cadence.
  const verdict = classifyFreshness("skills", file.fetchedAt);
  const ribbonTone: VerdictTone =
    verdict.status === "live" ? "money" : "amber";

  return (
    <main className="max-w-[1600px] mx-auto px-4 md:px-6 py-4 md:py-6 home-surface agent-commerce-page">
      <PageHead
        crumb={
          <>
            <b>AGENT COMMERCE</b> · TERMINAL · /AGENT-COMMERCE
          </>
        }
        h1="What agents can transact with."
        lede="On-chain x402 settlements, agent-callable APIs, MCP servers, wallets and marketplaces — scored by Portal readiness, pricing clarity, AISO visibility, and adoption."
        clock={
          <>
            <span className="big">{computed}</span>
            <span className="muted">UTC · UPDATED</span>
            <FreshnessBadge source="skills" lastUpdatedAt={file.fetchedAt} />
          </>
        }
      />

      <KpiBand
        cells={[
          {
            label: "TOTAL",
            value: stats.totalItems,
            sub: "entities",
            pip: "var(--v4-ink-300)",
          },
          {
            label: "x402",
            value: stats.x402EnabledCount,
            sub: "enabled",
            tone: "amber",
            pip: "var(--v4-amber)",
          },
          {
            label: "PORTAL",
            value: stats.portalReadyCount,
            sub: "ready",
            tone: "money",
            pip: "var(--v4-money)",
          },
          {
            label: "MCP",
            value: stats.mcpServerCount,
            sub: "servers",
            tone: "acc",
            pip: "var(--v4-cyan)",
          },
          {
            label: "ACTIONABLE",
            value: stats.agentActionableCount,
            sub: "agent-callable",
            tone: "acc",
            pip: "var(--v4-violet)",
          },
          {
            label: "AISO ≥80",
            value: stats.highAisoCount,
            sub: "highly visible",
            tone: "amber",
            pip: "var(--v4-gold)",
          },
        ]}
      />

      <VerdictRibbon
        tone={ribbonTone}
        stamp={{
          eyebrow: "// COMMERCE RADAR",
          headline: (
            <span
              style={{
                fontFamily:
                  "var(--font-geist-mono), var(--font-jetbrains-mono), monospace",
                fontSize: "var(--v4-text-22, 22px)",
                fontWeight: 600,
                letterSpacing: "0.04em",
                color: "var(--v4-ink-100)",
              }}
            >
              {stats.totalItems} entities
            </span>
          ),
          sub: `${file.windowDays}d window · computed ${computed} UTC`,
        }}
        text={
          <>
            <b>{stats.totalItems} services</b> indexed.{" "}
            <span style={{ color: "var(--v4-amber)" }}>
              {stats.x402EnabledCount} x402-enabled
            </span>
            ,{" "}
            <span style={{ color: "var(--v4-money)" }}>
              {stats.portalReadyCount} Portal Ready
            </span>
            ,{" "}
            <span style={{ color: "var(--v4-cyan)" }}>
              {stats.mcpServerCount} MCP servers
            </span>
            ,{" "}
            <span style={{ color: "var(--v4-violet)" }}>
              {stats.agentActionableCount} agent-actionable
            </span>
            .
          </>
        }
        actionHref="/feeds/agent-commerce.xml"
        actionLabel="RSS →"
      />

      <AgentCommerceTicker items={tickerItems} />

      {cold ? (
        <div className="ac-empty">
          <h2>Pipeline warming up.</h2>
          <p>
            The Agent Commerce snapshot is being assembled — protocols, MCP
            servers, and x402 endpoints will surface here once the next
            ingest tick completes.
          </p>
          <p className="ac-empty__meta">
            Last fetch: <code>{computed}</code>
          </p>
        </div>
      ) : (
        // Pass a slim, top-N projection to the client island. The full
        // corpus would ship ~8.8MB of SSR HTML (perf fix 2026-05-17);
        // top-N keeps the payload under 2MB. Server-side section panels
        // below still see the full `items` because RSC props never
        // round-trip through JSON.
        <AgentCommerceFilteredContent
          items={toSlimAgentCommerceTopItems(items, CLIENT_CORPUS_LIMIT)}
          stats={stats}
          serverTabCounts={buildTabCounts(items, stats.totalItems)}
          corpusTotal={stats.totalItems}
          clientCorpusLimit={CLIENT_CORPUS_LIMIT}
        >
          <SectionHead
            num="// 01"
            title="Composite movers"
            meta={
              <>
                <b>{movers.length}</b> · top by score
              </>
            }
          />
          <MoversBoard items={movers} />

          <SectionHead
            num="// 02"
            title="Protocol pulse"
            meta={
              <>
                <b>{Object.keys(stats.byProtocol).length}</b> · protocols
                tracked
              </>
            }
          />
          <ProtocolPulseGrid stats={stats} />

          <SectionHead
            num="// 03"
            title="Score distribution"
            meta={
              <>
                avg <b>{stats.averageComposite}</b> · top{" "}
                <b>{stats.topComposite}</b>
              </>
            }
          />
          <ScoreDistributionGrid
            items={items}
            topByScore={sortedByScore}
            stats={stats}
          />

          {items.some((i) => i.live?.tokenSymbol) ? (
            <>
              <SectionHead
                num="// 04"
                title="Agent token economy"
                meta={<>CoinGecko · mcap + 24h</>}
              />
              <TokenEconomyBoards items={items} />
            </>
          ) : null}

          {base && base.totalSettlements ? (
            <>
              <SectionHead
                num="// 05"
                title="On-chain x402 settlements · Base"
                meta={
                  <>
                    <b>{base.totalSettlements.toLocaleString("en-US")}</b> ·
                    settlements
                  </>
                }
              />
              <OnchainSettlementsBoard chain="base" data={base} />
            </>
          ) : null}

          {solana && solana.totalSettlements ? (
            <>
              <SectionHead
                num="// 06"
                title="On-chain x402 settlements · Solana"
                meta={
                  <>
                    <b>
                      {solana.totalSettlements.toLocaleString("en-US")}
                    </b>{" "}
                    · settlements
                  </>
                }
              />
              <OnchainSettlementsBoard chain="solana" data={solana} />
            </>
          ) : null}

          {dune?.rows?.length ? (
            <>
              <SectionHead
                num="// 07"
                title="Dune 24h volume"
                meta={<>USDC · via Dune</>}
              />
              <DuneVolumeBoard data={dune} />
            </>
          ) : null}
        </AgentCommerceFilteredContent>
      )}
    </main>
  );
}
