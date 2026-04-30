// /agent-commerce — Agent Commerce radar (M2M economy: x402, MCP, wallets, APIs).
//
// RSC entry. Tabs + filters live entirely in URL state, parsed at top.
// Mirrors the Signal/Funding page composition: refresh hook, sync getters,
// server-side filter/sort, deterministic render.

import type { Metadata } from "next";
import Link from "next/link";

import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Metric, MetricGrid } from "@/components/ui/Metric";
import { AgentCommerceCard } from "@/components/agent-commerce/AgentCommerceCard";
import { AgentCommerceFilterBar } from "@/components/agent-commerce/AgentCommerceFilterBar";
import { AgentCommerceTabs } from "@/components/agent-commerce/AgentCommerceTabs";
import {
  getAgentCommerceFile,
  getAgentCommerceItems,
  getAgentCommerceStats,
  isAgentCommerceCold,
  refreshAgentCommerceFromStore,
} from "@/lib/agent-commerce";
import {
  applyFilter,
  parseCategory,
  parsePortalReady,
  parsePricing,
  parseProtocols,
  parseSearchQuery,
  parseTab,
  TABS,
  type AgentCommerceFilter,
} from "@/lib/agent-commerce/extract";
import type {
  AgentCommerceItem,
  AgentCommerceProtocol,
} from "@/lib/agent-commerce/types";

export const revalidate = 600;

export const metadata: Metadata = {
  title: "TrendingRepo · Agent Commerce",
  description:
    "x402 services, agent wallets, MCP servers, agent-callable APIs and marketplaces. The DefiLlama for the M2M economy.",
  alternates: { canonical: "/agent-commerce" },
};

interface PageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

function pickFirst(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function buildBaseQuery(
  searchParams: Record<string, string | string[] | undefined>,
): URLSearchParams {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams)) {
    const first = pickFirst(v);
    if (typeof first === "string" && first.length > 0) {
      next.set(k, first);
    }
  }
  return next;
}

function formatClock(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toISOString().slice(11, 19)
    : "warming";
}

function pluralize(n: number, one: string, many: string): string {
  return n === 1 ? `${n} ${one}` : `${n} ${many}`;
}

function buildOpportunities(
  items: AgentCommerceItem[],
): { title: string; reason: string }[] {
  const ops: { title: string; reason: string }[] = [];
  const x402Count = items.filter((i) => i.badges.x402Enabled).length;
  const portalCount = items.filter((i) => i.badges.portalReady).length;
  const billingCount = items.filter(
    (i) =>
      i.category === "payments" &&
      i.kind === "infra" &&
      i.pricing.type === "subscription",
  ).length;
  const inferenceCount = items.filter(
    (i) => i.category === "inference",
  ).length;
  const walletCount = items.filter((i) => i.kind === "wallet").length;

  if (x402Count > 0 && portalCount < x402Count / 2) {
    ops.push({
      title: "Build x402 directory + Portal manifest crawler",
      reason: `${x402Count} x402-enabled services tracked, only ${portalCount} expose Portal manifests. The rest are dark to agent discovery.`,
    });
  }
  if (billingCount < 3) {
    ops.push({
      title: "Build agent billing SaaS",
      reason: "Fewer than 3 dedicated agent-billing tools indexed. Stripe-MCP and a handful of x402 SDKs are the only options. Big gap, slim moat.",
    });
  }
  if (inferenceCount > 6 && items.filter((i) => i.protocols.includes("x402")).length < 2) {
    ops.push({
      title: "Build x402 inference gateway",
      reason: `${inferenceCount} inference APIs but only ${items.filter((i) => i.protocols.includes("x402")).length} accept x402. A gateway that adds 402-pricing to any OpenAI-compatible endpoint would be agent-native by default.`,
    });
  }
  if (walletCount > 0) {
    ops.push({
      title: "Agent-wallet aggregator dashboard",
      reason: `${walletCount} agent wallet providers each ship their own SDK and policy DSL. A unified surface (load any wallet, set spend caps in one schema) is missing.`,
    });
  }
  ops.push({
    title: "Build Agent Commerce analytics for Bloomberg-class buyers",
    reason: "No DefiLlama-equivalent for x402 settlement volume, MCP install counts, or agent-API per-call prices. This page is the seed.",
  });
  return ops;
}

export default async function AgentCommercePage({ searchParams }: PageProps) {
  await refreshAgentCommerceFromStore();
  const sp = (await searchParams) ?? {};
  const baseQuery = buildBaseQuery(sp);

  const filter: AgentCommerceFilter = {
    tab: parseTab(pickFirst(sp.tab)),
    category: parseCategory(pickFirst(sp.cat)),
    protocols: parseProtocols(pickFirst(sp.protocol)),
    pricing: parsePricing(pickFirst(sp.pricing)),
    portalReady: parsePortalReady(pickFirst(sp.portalready)),
    query: parseSearchQuery(pickFirst(sp.q)),
  };

  const file = getAgentCommerceFile();
  const all = getAgentCommerceItems();
  const stats = getAgentCommerceStats();
  const cold = isAgentCommerceCold(file);
  const computed = formatClock(file.fetchedAt);

  // Per-tab counts for tab strip
  const tabCounts: Partial<Record<(typeof TABS)[number], number>> = {};
  for (const tab of TABS) {
    if (tab === "overview" || tab === "signals" || tab === "opportunities") {
      tabCounts[tab] = stats.totalItems;
      continue;
    }
    const subset = applyFilter(all, {
      ...filter,
      tab,
      category: null,
      protocols: new Set<AgentCommerceProtocol>(),
      pricing: null,
      portalReady: false,
      query: "",
    });
    tabCounts[tab] = subset.length;
  }

  const filtered = applyFilter(all, filter);
  const sorted = filtered
    .slice()
    .sort((a, b) => b.scores.composite - a.scores.composite);
  const heroes = sorted.slice(0, 6);
  const grid = sorted.slice(0, 60);

  const totalRendered = sorted.length;
  const opportunities = filter.tab === "opportunities" ? buildOpportunities(all) : [];

  const protocolBreakdown = Object.entries(stats.byProtocol)
    .map(([proto, n]) => ({ proto, n }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 6);

  return (
    <main className="home-surface agent-commerce-page">
      <section className="page-head">
        <div>
          <div className="crumb">
            <b>Agent Commerce</b> / m2m terminal / x402 · MCP · wallets
          </div>
          <h1>What agents can transact with.</h1>
          <p className="lede">
            x402 services, agent-callable APIs, MCP servers, wallets and
            marketplaces — scored by Portal readiness, pricing clarity, AISO
            visibility, and adoption.
          </p>
        </div>
        <div className="clock">
          <span className="big">{computed}</span>
          <span className="live">updated</span>
        </div>
      </section>

      <section className="verdict">
        <div className="v-stamp">
          <span>commerce radar</span>
          <span className="ts">{stats.totalItems} entities</span>
          <span className="ago">{file.windowDays}d window</span>
        </div>
        <p className="v-text">
          <b>{pluralize(stats.totalItems, "service", "services")}</b> indexed.{" "}
          <span className="hl-early">{stats.x402EnabledCount} x402-enabled</span>,{" "}
          <span className="hl-early">{stats.portalReadyCount} Portal Ready</span>,{" "}
          <span className="hl-div">{stats.mcpServerCount} MCP servers</span>,{" "}
          <span className="hl-early">{stats.agentActionableCount} agent-actionable</span>.
        </p>
        <div className="v-actions">
          <Link href="/feeds/agent-commerce.xml">RSS</Link>
          <Link href="/funding">Funding</Link>
          <Link href="/signals">Signals</Link>
        </div>
      </section>

      <MetricGrid columns={6} className="kpi-band">
        <Metric label="Total" value={stats.totalItems} sub="entities" pip />
        <Metric label="New 7d" value={stats.thisWeekCount} sub="this week" tone="external" pip />
        <Metric label="x402" value={stats.x402EnabledCount} sub="enabled" tone="accent" pip />
        <Metric label="Portal" value={stats.portalReadyCount} sub="ready" tone="positive" pip />
        <Metric label="MCP" value={stats.mcpServerCount} sub="servers" tone="consensus" pip />
        <Metric label="AISO ≥80" value={stats.highAisoCount} sub="visible" tone="warning" pip />
      </MetricGrid>

      <AgentCommerceTabs active={filter.tab} counts={tabCounts} baseQuery={baseQuery} />

      <AgentCommerceFilterBar
        category={filter.category}
        protocols={filter.protocols}
        pricing={filter.pricing}
        portalReady={filter.portalReady}
        query={filter.query}
        baseQuery={baseQuery}
      />

      {cold ? (
        <div className="ac-empty">
          <h2>Agent Commerce snapshot warming up.</h2>
          <p>
            The seed has not been built yet. Run <code>npm run build:agent-commerce</code> to
            populate <code>data/agent-commerce.json</code>.
          </p>
        </div>
      ) : totalRendered === 0 ? (
        <div className="ac-empty">
          <h2>No matches for the current filter.</h2>
          <p>Loosen the protocol / pricing / portal-ready filters above, or pick a different tab.</p>
        </div>
      ) : filter.tab === "opportunities" ? (
        <section className="grid">
          {opportunities.map((op, idx) => (
            <Card className="col-6" key={idx}>
              <CardHeader showCorner right={<span className="sec-num">{`// ${String(idx + 1).padStart(2, "0")}`}</span>}>
                {op.title}
              </CardHeader>
              <CardBody>
                <p style={{ margin: 0, color: "var(--color-text-subtle)", fontSize: 13, lineHeight: 1.5 }}>
                  {op.reason}
                </p>
              </CardBody>
            </Card>
          ))}
        </section>
      ) : filter.tab === "signals" ? (
        <div className="grid">
          <Card className="col-6">
            <CardHeader showCorner right={<span>protocols</span>}>
              Protocol distribution
            </CardHeader>
            <CardBody>
              {protocolBreakdown.map(({ proto, n }, idx) => {
                const max = Math.max(...protocolBreakdown.map((p) => p.n), 1);
                const width = Math.round((n / max) * 100);
                return (
                  <div className="ac-score-row" key={proto}>
                    <span>{proto}</span>
                    <span className="ac-score-track">
                      <i style={{ width: `${width}%` }} />
                    </span>
                    <span className="ac-score-num">{n}</span>
                  </div>
                );
              })}
            </CardBody>
          </Card>
          <Card className="col-6">
            <CardHeader showCorner right={<span>top {Math.min(8, sorted.length)}</span>}>
              Composite leaderboard
            </CardHeader>
            <CardBody>
              {sorted.slice(0, 8).map((item) => (
                <div className="ac-score-row" key={item.id}>
                  <Link
                    href={`/agent-commerce/${item.slug}`}
                    style={{
                      color: "var(--color-text-default)",
                      textDecoration: "none",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {item.name}
                  </Link>
                  <span className="ac-score-track">
                    <i style={{ width: `${item.scores.composite}%` }} />
                  </span>
                  <span className="ac-score-num">{item.scores.composite}</span>
                </div>
              ))}
            </CardBody>
          </Card>
        </div>
      ) : (
        <>
          {filter.tab === "overview" && heroes.length > 0 ? (
            <>
              <div className="sec-head">
                <span className="sec-num">{"// 01"}</span>
                <h2 className="sec-title">Top of stack</h2>
                <span className="sec-meta">
                  <b>{heroes.length}</b> / by composite
                </span>
              </div>
              <div className="ac-grid">
                {heroes.map((item) => (
                  <AgentCommerceCard key={item.id} item={item} />
                ))}
              </div>
            </>
          ) : null}

          <div className="sec-head">
            <span className="sec-num">{filter.tab === "overview" ? "// 02" : "// 01"}</span>
            <h2 className="sec-title">
              {filter.tab === "overview" ? "All entities" : "Entities"}
            </h2>
            <span className="sec-meta">
              <b>{totalRendered}</b> /{" "}
              {filter.tab === "overview" ? "tracked" : `in ${filter.tab}`}
            </span>
          </div>
          <div className="ac-grid">
            {grid.map((item) => (
              <AgentCommerceCard key={item.id} item={item} />
            ))}
          </div>
        </>
      )}
    </main>
  );
}
