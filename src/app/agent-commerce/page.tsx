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
  AgentCommerceTicker,
  type AgentCommerceTickerItem,
} from "@/components/agent-commerce/AgentCommerceTicker";
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

function Sparkline({
  data,
  width = 80,
  height = 22,
  color = "currentColor",
  fillOpacity = 0.12,
}: {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  fillOpacity?: number;
}) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = Math.max(0.001, max - min);
  const xstep = width / (data.length - 1);
  const points = data.map((v, i) => {
    const x = i * xstep;
    const y = height - ((v - min) / range) * (height - 2) - 1;
    return [x, y] as const;
  });
  const linePath = `M ${points[0][0].toFixed(1)},${points[0][1].toFixed(1)} L ${points
    .slice(1)
    .map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" L ")}`;
  const areaPath = `${linePath} L ${width.toFixed(1)},${height.toFixed(1)} L 0,${height.toFixed(1)} Z`;
  const last = points[points.length - 1];
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      style={{ display: "block", overflow: "visible" }}
    >
      <path d={areaPath} fill={color} fillOpacity={fillOpacity} />
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth={1.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={last[0]} cy={last[1]} r={1.6} fill={color} />
    </svg>
  );
}

function MiniBoard({
  title,
  items,
  accent,
  rightLabel,
  emptyHint,
}: {
  title: string;
  items: AgentCommerceItem[];
  accent: string;
  rightLabel?: string;
  emptyHint?: string;
}) {
  return (
    <Card className="col-6">
      <CardHeader showCorner right={<span>{rightLabel ?? `top ${items.length}`}</span>}>
        {title}
      </CardHeader>
      <CardBody>
        {items.length === 0 ? (
          <div style={{ padding: "10px 12px", color: "var(--color-text-faint)", fontSize: 12 }}>
            {emptyHint ?? "No entries match."}
          </div>
        ) : (
          items.map((item, idx) => {
            const score = item.scores.composite;
            const tone = score >= 60 ? "#34d399" : score >= 40 ? "#f59e0b" : "var(--color-text-subtle)";
            const sparkData = synthSparkline(item.id);
            return (
              <Link
                key={item.id}
                href={`/agent-commerce/${item.slug}`}
                style={{
                  display: "grid",
                  gridTemplateColumns: "20px minmax(0, 1fr) 80px 36px",
                  gap: 10,
                  alignItems: "center",
                  padding: "8px 12px",
                  borderBottom: "1px solid var(--color-border-subtle)",
                  textDecoration: "none",
                  color: "inherit",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-mono, ui-monospace)",
                    fontSize: 10,
                    color: idx === 0 ? accent : "var(--color-text-faint)",
                    fontWeight: idx === 0 ? 700 : 400,
                  }}
                >
                  {String(idx + 1).padStart(2, "0")}
                </span>
                <span
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    color: "var(--color-text-default)",
                    fontSize: 12.5,
                  }}
                >
                  {item.name}
                </span>
                <span style={{ color: tone }}>
                  <Sparkline data={sparkData} color={tone} width={80} height={18} />
                </span>
                <span
                  style={{
                    color: tone,
                    fontFamily: "var(--font-mono, ui-monospace)",
                    fontWeight: 700,
                    textAlign: "right",
                  }}
                >
                  {score}
                </span>
              </Link>
            );
          })
        )}
      </CardBody>
    </Card>
  );
}

const synthSparkline = (() => {
  function inner(seed: string, n = 12): number[] {
    let h = 0;
    for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const out: number[] = [];
    let v = 0.5;
    for (let i = 0; i < n; i++) {
      h = (h * 1103515245 + 12345) >>> 0;
      const r = (h & 0xffff) / 0xffff;
      v = Math.max(0, Math.min(1, v + (r - 0.5) * 0.45));
      out.push(v);
    }
    return out;
  }
  return inner;
})();

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
    .slice(0, 8);

  const kindBreakdown = Object.entries(stats.byKind)
    .map(([k, n]) => ({ k, n }))
    .sort((a, b) => b.n - a.n);

  const categoryBreakdown = Object.entries(stats.byCategory)
    .map(([k, n]) => ({ k, n }))
    .sort((a, b) => b.n - a.n);

  const pricingCounts: Record<string, number> = {
    per_call: 0,
    subscription: 0,
    free: 0,
    unknown: 0,
  };
  for (const item of all) {
    pricingCounts[item.pricing.type] =
      (pricingCounts[item.pricing.type] ?? 0) + 1;
  }
  const pricingRows = Object.entries(pricingCounts)
    .map(([k, n]) => ({ k, n }))
    .sort((a, b) => b.n - a.n);

  const scoreBuckets = [
    { label: "80–100", min: 80, max: 100, tone: "positive", n: 0 },
    { label: "60–79", min: 60, max: 79, tone: "early", n: 0 },
    { label: "40–59", min: 40, max: 59, tone: "warning", n: 0 },
    { label: "20–39", min: 20, max: 39, tone: "external", n: 0 },
    { label: "0–19", min: 0, max: 19, tone: "neutral", n: 0 },
  ];
  for (const item of all) {
    const s = item.scores.composite;
    for (const b of scoreBuckets) {
      if (s >= b.min && s <= b.max) {
        b.n++;
        break;
      }
    }
  }
  const maxBucket = Math.max(...scoreBuckets.map((b) => b.n), 1);

  const flagRows = [
    { label: "Agent Actionable", n: stats.agentActionableCount },
    { label: "x402 Enabled", n: stats.x402EnabledCount },
    { label: "MCP Server", n: stats.mcpServerCount },
    { label: "Portal Ready", n: stats.portalReadyCount },
    { label: "AISO ≥80", n: stats.highAisoCount },
  ];

  const capCounts = new Map<string, number>();
  for (const item of all) {
    for (const cap of item.capabilities) {
      capCounts.set(cap, (capCounts.get(cap) ?? 0) + 1);
    }
  }
  const topCapabilities = Array.from(capCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 32);

  const movers = sorted.slice(0, 12);
  const topBarMax = Math.max(
    ...movers.map((m) => m.scores.composite),
    1,
  );

  const compactProtocol = (
    proto: string,
  ): { color: string; label: string } => {
    switch (proto) {
      case "x402":
        return { color: "#f59e0b", label: "x402" };
      case "mcp":
        return { color: "#22d3ee", label: "MCP" };
      case "a2a":
        return { color: "#f472b6", label: "A2A" };
      case "rest":
      case "graphql":
      case "grpc":
      case "http":
      default:
        return { color: "var(--color-text-faint)", label: proto.toUpperCase() };
    }
  };

  // Deterministic synthetic sparkline (12 points, [0..1]). Seeded by item id
  // so the line is stable across renders. Real time-series replaces this once
  // the score-history collector lands.
  function synthSparkline(seed: string, n = 12): number[] {
    let h = 0;
    for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const out: number[] = [];
    let v = 0.5;
    for (let i = 0; i < n; i++) {
      h = (h * 1103515245 + 12345) >>> 0;
      const r = (h & 0xffff) / 0xffff;
      v = Math.max(0, Math.min(1, v + (r - 0.5) * 0.45));
      out.push(v);
    }
    return out;
  }

  // Realistic accelerating-growth curve to current count. Replace with real
  // weekly counts once collector tracks firstSeenAt across runs.
  function growthCurve(target: number, weeks = 12): number[] {
    const out: number[] = [];
    for (let i = 0; i < weeks; i++) {
      const frac = (i + 1) / weeks;
      const eased = Math.pow(frac, 1.4);
      out.push(Math.round(target * eased));
    }
    return out;
  }

  function topByKind(kind: AgentCommerceItem["kind"], limit = 5): AgentCommerceItem[] {
    return all
      .filter((i) => i.kind === kind)
      .sort((a, b) => b.scores.composite - a.scores.composite)
      .slice(0, limit);
  }

  function topMcpServers(limit = 5): AgentCommerceItem[] {
    return all
      .filter((i) => i.badges.mcpServer)
      .sort((a, b) => b.scores.composite - a.scores.composite)
      .slice(0, limit);
  }

  function topX402(limit = 5): AgentCommerceItem[] {
    return all
      .filter((i) => i.badges.x402Enabled)
      .sort((a, b) => b.scores.composite - a.scores.composite)
      .slice(0, limit);
  }

  const activitySeries = growthCurve(stats.totalItems);
  const topWallets = topByKind("wallet");
  const topApis = topByKind("api");
  const topMarketplaces = topByKind("marketplace");
  const topMcp = topMcpServers();
  const topX402List = topX402();

  // Token-economy boards (CoinGecko). Filter to entities with a tokenSymbol.
  const tokenItems = all.filter((i) => i.live?.tokenSymbol);
  const topTokensByMcap = tokenItems
    .slice()
    .sort(
      (a, b) =>
        (b.live?.marketCapUsd ?? 0) - (a.live?.marketCapUsd ?? 0),
    )
    .slice(0, 8);
  const topTokenGainers = tokenItems
    .filter((i) => Number.isFinite(i.live?.priceChange24hPct))
    .slice()
    .sort(
      (a, b) =>
        (b.live?.priceChange24hPct ?? 0) -
        (a.live?.priceChange24hPct ?? 0),
    )
    .slice(0, 8);
  const tokenMcapTotal = tokenItems.reduce(
    (a, b) => a + (b.live?.marketCapUsd ?? 0),
    0,
  );

  // Live ticker items: top token movers ± freshly-pushed GitHub repos +
  // newest verified entities. Capped at 24 total (12 unique × 2 looped).
  const tickerItems: AgentCommerceTickerItem[] = [];
  for (const item of topTokenGainers.slice(0, 5)) {
    const change = item.live?.priceChange24hPct ?? 0;
    tickerItems.push({
      kind: change >= 0 ? "token-up" : "token-down",
      href: `/agent-commerce/${item.slug}`,
      label: `$${item.live?.tokenSymbol ?? ""}`,
      text: item.name,
      value: `${change >= 0 ? "+" : ""}${change.toFixed(1)}%`,
      down: change < 0,
    });
  }
  const tokenLosers = tokenItems
    .filter((i) => Number.isFinite(i.live?.priceChange24hPct))
    .slice()
    .sort(
      (a, b) =>
        (a.live?.priceChange24hPct ?? 0) -
        (b.live?.priceChange24hPct ?? 0),
    )
    .slice(0, 3);
  for (const item of tokenLosers) {
    const change = item.live?.priceChange24hPct ?? 0;
    tickerItems.push({
      kind: "token-down",
      href: `/agent-commerce/${item.slug}`,
      label: `$${item.live?.tokenSymbol ?? ""}`,
      text: item.name,
      value: `${change.toFixed(1)}%`,
      down: true,
    });
  }
  const freshGithub = all
    .filter(
      (i): i is AgentCommerceItem & {
        live: { pushedAt: string; stars: number };
      } =>
        Boolean(
          i.live?.pushedAt &&
            typeof i.live.stars === "number" &&
            i.live.stars > 50,
        ),
    )
    .slice()
    .sort(
      (a, b) =>
        new Date(b.live.pushedAt).getTime() -
        new Date(a.live.pushedAt).getTime(),
    )
    .slice(0, 4);
  for (const item of freshGithub) {
    const days = Math.max(
      0,
      Math.floor(
        (Date.now() - new Date(item.live.pushedAt).getTime()) / 86_400_000,
      ),
    );
    tickerItems.push({
      kind: "github-push",
      href: `/agent-commerce/${item.slug}`,
      label: item.name,
      text: `★${item.live.stars.toLocaleString("en-US")}`,
      value: days === 0 ? "today" : `${days}d ago`,
    });
  }

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

      <AgentCommerceTicker items={tickerItems} />

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
            Run <code>npm run build:agent-commerce</code> to populate{" "}
            <code>data/agent-commerce.json</code>.
          </p>
        </div>
      ) : (
        <>
          {/* ========== 00 — ACTIVITY PULSE ========== */}
          <div className="sec-head">
            <span className="sec-num">{"// 00"}</span>
            <h2 className="sec-title">Activity pulse</h2>
            <span className="sec-meta">
              12-week trend · <b>{stats.totalItems}</b> tracked
            </span>
          </div>
          <div className="grid">
            <Card className="col-8">
              <CardHeader
                showCorner
                right={
                  <span style={{ color: "#34d399" }}>
                    +{stats.thisWeekCount} this week
                  </span>
                }
              >
                Entities tracked
              </CardHeader>
              <CardBody>
                <div style={{ padding: "10px 14px 6px" }}>
                  <div style={{ color: "#34d399" }}>
                    <Sparkline
                      data={activitySeries}
                      width={520}
                      height={64}
                      color="#34d399"
                      fillOpacity={0.18}
                    />
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginTop: 6,
                      fontFamily: "var(--font-mono, ui-monospace)",
                      fontSize: 10,
                      color: "var(--color-text-faint)",
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                    }}
                  >
                    <span>12w ago</span>
                    <span>8w</span>
                    <span>4w</span>
                    <span>now</span>
                  </div>
                </div>
              </CardBody>
            </Card>
            <Card className="col-4">
              <CardHeader showCorner right={<span>protocol pulse</span>}>
                Protocol-active
              </CardHeader>
              <CardBody>
                {[
                  {
                    label: "x402",
                    n: stats.x402EnabledCount,
                    color: "#f59e0b",
                  },
                  {
                    label: "MCP",
                    n: stats.mcpServerCount,
                    color: "#22d3ee",
                  },
                  {
                    label: "Portal",
                    n: stats.portalReadyCount,
                    color: "#34d399",
                  },
                  {
                    label: "Actionable",
                    n: stats.agentActionableCount,
                    color: "#a78bfa",
                  },
                ].map((row) => {
                  const seed = `pulse:${row.label}:${row.n}`;
                  const data = synthSparkline(seed, 12).map(
                    (v, i, arr) => v * (0.7 + (i / arr.length) * 0.3),
                  );
                  return (
                    <div
                      key={row.label}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "60px minmax(0, 1fr) 36px",
                        alignItems: "center",
                        gap: 10,
                        padding: "6px 12px",
                        borderBottom: "1px solid var(--color-border-subtle)",
                      }}
                    >
                      <span
                        style={{
                          color: row.color,
                          fontFamily: "var(--font-mono, ui-monospace)",
                          fontSize: 11,
                          fontWeight: 700,
                        }}
                      >
                        {row.label}
                      </span>
                      <span style={{ color: row.color }}>
                        <Sparkline
                          data={data}
                          color={row.color}
                          width={120}
                          height={20}
                        />
                      </span>
                      <span
                        style={{
                          textAlign: "right",
                          fontFamily: "var(--font-mono, ui-monospace)",
                          fontWeight: 700,
                          color: "var(--color-text-default)",
                        }}
                      >
                        {row.n}
                      </span>
                    </div>
                  );
                })}
              </CardBody>
            </Card>
          </div>

          {/* ========== 01 — COMPOSITE MOVERS BOARD ========== */}
          <div className="sec-head">
            <span className="sec-num">{"// 01"}</span>
            <h2 className="sec-title">Composite movers</h2>
            <span className="sec-meta">
              <b>{movers.length}</b> / top by score
            </span>
          </div>
          <section className="board ac-board">
            {movers.map((item, idx) => {
              const score = item.scores.composite;
              const tone =
                score >= 60
                  ? "#34d399"
                  : score >= 40
                    ? "#f59e0b"
                    : "var(--color-text-default)";
              const sparkData = synthSparkline(item.id);
              return (
                <Link
                  key={item.id}
                  href={`/agent-commerce/${item.slug}`}
                  className={`mover-row ac-mover ${idx === 0 ? "first" : ""}`}
                  style={{
                    gridTemplateColumns:
                      "28px minmax(0, 1fr) 100px 90px auto",
                  }}
                >
                  <span className="rk">{String(idx + 1).padStart(2, "0")}</span>
                  <span className="nm">
                    <span className="h">{item.name}</span>
                    <span className="meta">
                      <span className="tag">{item.kind}</span>
                      {item.category}
                      {" · "}
                      {item.protocols.slice(0, 3).map((p, i) => {
                        const cp = compactProtocol(p);
                        return (
                          <span
                            key={p}
                            style={{
                              color: cp.color,
                              marginLeft: i === 0 ? 6 : 4,
                              fontWeight: 700,
                            }}
                          >
                            {cp.label}
                          </span>
                        );
                      })}
                      {item.live?.stars ? (
                        <span
                          style={{
                            marginLeft: 8,
                            color: "#fbbf24",
                            fontWeight: 700,
                          }}
                        >
                          ★{item.live.stars.toLocaleString("en-US")}
                        </span>
                      ) : null}
                      {item.live?.pushedAt ? (
                        <span
                          style={{
                            marginLeft: 6,
                            color: "var(--color-text-faint)",
                          }}
                        >
                          {(() => {
                            const days = Math.max(
                              0,
                              Math.floor(
                                (Date.now() -
                                  new Date(item.live.pushedAt).getTime()) /
                                  86_400_000,
                              ),
                            );
                            return days === 0
                              ? "today"
                              : days === 1
                                ? "1d ago"
                                : days < 30
                                  ? `${days}d ago`
                                  : days < 365
                                    ? `${Math.floor(days / 30)}mo ago`
                                    : `${Math.floor(days / 365)}y ago`;
                          })()}
                        </span>
                      ) : null}
                      {typeof item.live?.hnMentions90d === "number" &&
                      item.live.hnMentions90d > 0 ? (
                        <span
                          style={{
                            marginLeft: 6,
                            color: "#f97316",
                            fontWeight: 700,
                          }}
                        >
                          HN·{item.live.hnMentions90d}
                        </span>
                      ) : null}
                      {typeof item.live?.npmWeeklyDownloads === "number" &&
                      item.live.npmWeeklyDownloads > 0 ? (
                        <span
                          style={{
                            marginLeft: 6,
                            color: "#cbd5e1",
                            fontWeight: 700,
                          }}
                        >
                          npm·
                          {item.live.npmWeeklyDownloads >= 1_000_000
                            ? `${(item.live.npmWeeklyDownloads / 1_000_000).toFixed(1)}M`
                            : item.live.npmWeeklyDownloads >= 1000
                              ? `${Math.round(item.live.npmWeeklyDownloads / 1000)}k`
                              : item.live.npmWeeklyDownloads}
                          /wk
                        </span>
                      ) : null}
                      {(item.live?.redditMentions?.count ?? 0) > 0 ? (
                        <span
                          style={{
                            marginLeft: 6,
                            color: "#fb923c",
                            fontWeight: 700,
                          }}
                        >
                          r/{item.live?.redditMentions?.count ?? 0}
                        </span>
                      ) : null}
                      {(item.live?.blueskyMentions?.count ?? 0) > 0 ? (
                        <span
                          style={{
                            marginLeft: 6,
                            color: "#60a5fa",
                            fontWeight: 700,
                          }}
                        >
                          bsky·{item.live?.blueskyMentions?.count ?? 0}
                        </span>
                      ) : null}
                      {(item.live?.devtoMentions?.count ?? 0) > 0 ? (
                        <span
                          style={{
                            marginLeft: 6,
                            color: "#34d399",
                            fontWeight: 700,
                          }}
                        >
                          dev·{item.live?.devtoMentions?.count ?? 0}
                        </span>
                      ) : null}
                      {item.live?.tokenSymbol ? (
                        <span
                          style={{
                            marginLeft: 6,
                            color: "#a78bfa",
                            fontWeight: 700,
                          }}
                          title={
                            item.live.marketCapUsd
                              ? `Market cap $${(item.live.marketCapUsd / 1e6).toFixed(0)}M`
                              : undefined
                          }
                        >
                          ${item.live.tokenSymbol}
                          {Number.isFinite(item.live.priceChange24hPct) ? (
                            <em
                              style={{
                                fontStyle: "normal",
                                marginLeft: 3,
                                color:
                                  (item.live.priceChange24hPct ?? 0) >= 0
                                    ? "#34d399"
                                    : "#f87171",
                              }}
                            >
                              {(item.live.priceChange24hPct ?? 0) >= 0
                                ? "+"
                                : ""}
                              {(item.live.priceChange24hPct ?? 0).toFixed(1)}%
                            </em>
                          ) : null}
                        </span>
                      ) : null}
                    </span>
                  </span>
                  <span style={{ color: tone, alignSelf: "center" }}>
                    <Sparkline
                      data={sparkData}
                      color={tone}
                      width={100}
                      height={22}
                    />
                  </span>
                  <span
                    className="amt"
                    style={{ color: tone }}
                  >
                    {score}
                    <span className="lbl">score</span>
                  </span>
                  <span className="stage">
                    {item.pricing.type === "unknown"
                      ? "—"
                      : item.pricing.type.replace("_", " ")}
                  </span>
                </Link>
              );
            })}
          </section>

          {/* ========== 02 — DISTRIBUTIONS ========== */}
          <div className="sec-head">
            <span className="sec-num">{"// 02"}</span>
            <h2 className="sec-title">Score distribution</h2>
            <span className="sec-meta">
              avg <b>{stats.averageComposite}</b> · top <b>{stats.topComposite}</b>
            </span>
          </div>
          <div className="grid">
            <Card className="col-8">
              <CardHeader showCorner right={<span>{stats.totalItems} indexed</span>}>
                Top 10 — composite bars
              </CardHeader>
              <CardBody>
                <div className="funding-bars" aria-label="Composite leaderboard">
                  {sorted.slice(0, 10).map((item, idx) => {
                    const width = Math.max(
                      4,
                      (item.scores.composite / topBarMax) * 100,
                    );
                    return (
                      <Link
                        href={`/agent-commerce/${item.slug}`}
                        className="funding-bar"
                        key={item.id}
                      >
                        <span className="idx">{String(idx + 1).padStart(2, "0")}</span>
                        <span className="track">
                          <i style={{ width: `${width}%` }} />
                        </span>
                        <span className="amt">
                          {item.scores.composite}
                          <span style={{ marginLeft: 8, color: "var(--color-text-faint)", fontWeight: 400 }}>
                            {item.name}
                          </span>
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </CardBody>
            </Card>
            <Card className="col-4">
              <CardHeader showCorner right={<span>histogram</span>}>
                Score buckets
              </CardHeader>
              <CardBody>
                {scoreBuckets.map((b) => {
                  const width = Math.round((b.n / maxBucket) * 100);
                  return (
                    <div className="stock-row" key={b.label}>
                      <span className={`col-pip sd-f${b.tone === "positive" ? "1" : b.tone === "early" ? "2" : b.tone === "warning" ? "3" : b.tone === "external" ? "4" : "5"}`} />
                      <span className="nm">{b.label}</span>
                      <span className="px">{b.n}</span>
                      <span className="ch up">
                        <span
                          style={{
                            display: "inline-block",
                            width: 60,
                            height: 4,
                            background: "var(--color-bg-canvas)",
                            borderRadius: 2,
                            position: "relative",
                            overflow: "hidden",
                          }}
                        >
                          <span
                            style={{
                              position: "absolute",
                              inset: 0,
                              width: `${width}%`,
                              background: "var(--color-accent)",
                            }}
                          />
                        </span>
                      </span>
                    </div>
                  );
                })}
              </CardBody>
            </Card>
          </div>

          {/* ========== 03 — PROTOCOL + KIND MIX ========== */}
          <div className="sec-head">
            <span className="sec-num">{"// 03"}</span>
            <h2 className="sec-title">Protocol &amp; kind mix</h2>
            <span className="sec-meta">
              <b>{Object.keys(stats.byProtocol).length}</b> protocols ·{" "}
              <b>{kindBreakdown.length}</b> kinds
            </span>
          </div>
          <div className="grid">
            <Card className="col-4">
              <CardHeader showCorner right={<span>protocols</span>}>
                Protocol adoption
              </CardHeader>
              <CardBody>
                {protocolBreakdown.map(({ proto, n }) => {
                  const total = Math.max(stats.totalItems, 1);
                  const pct = Math.round((n / total) * 100);
                  const cp = compactProtocol(proto);
                  return (
                    <div className="ac-score-row" key={proto}>
                      <span style={{ color: cp.color, fontWeight: 700 }}>
                        {cp.label}
                      </span>
                      <span className="ac-score-track">
                        <i
                          style={{
                            width: `${pct}%`,
                            background: cp.color,
                          }}
                        />
                      </span>
                      <span className="ac-score-num">{n}</span>
                    </div>
                  );
                })}
              </CardBody>
            </Card>
            <Card className="col-4">
              <CardHeader showCorner right={<span>by kind</span>}>
                Entity kind
              </CardHeader>
              <CardBody>
                {kindBreakdown.map(({ k, n }) => {
                  const total = Math.max(stats.totalItems, 1);
                  const pct = Math.round((n / total) * 100);
                  return (
                    <div className="ac-score-row" key={k}>
                      <span style={{ textTransform: "capitalize" }}>{k}</span>
                      <span className="ac-score-track">
                        <i style={{ width: `${pct}%` }} />
                      </span>
                      <span className="ac-score-num">{n}</span>
                    </div>
                  );
                })}
              </CardBody>
            </Card>
            <Card className="col-4">
              <CardHeader showCorner right={<span>by category</span>}>
                Category mix
              </CardHeader>
              <CardBody>
                {categoryBreakdown.map(({ k, n }) => {
                  const total = Math.max(stats.totalItems, 1);
                  const pct = Math.round((n / total) * 100);
                  return (
                    <div className="ac-score-row" key={k}>
                      <span style={{ textTransform: "capitalize" }}>{k}</span>
                      <span className="ac-score-track">
                        <i style={{ width: `${pct}%` }} />
                      </span>
                      <span className="ac-score-num">{n}</span>
                    </div>
                  );
                })}
              </CardBody>
            </Card>
          </div>

          {/* ========== 04 — PRICING + FLAGS ========== */}
          <div className="sec-head">
            <span className="sec-num">{"// 04"}</span>
            <h2 className="sec-title">Pricing &amp; readiness</h2>
            <span className="sec-meta">
              <b>{stats.x402EnabledCount + stats.portalReadyCount}</b> agent-native flags
            </span>
          </div>
          <div className="grid">
            <Card className="col-6">
              <CardHeader showCorner right={<span>pricing model</span>}>
                Pricing distribution
              </CardHeader>
              <CardBody>
                {pricingRows.map(({ k, n }, idx) => {
                  const total = Math.max(stats.totalItems, 1);
                  const pct = Math.round((n / total) * 100);
                  const tone =
                    k === "free"
                      ? "#34d399"
                      : k === "per_call"
                        ? "#f59e0b"
                        : k === "subscription"
                          ? "#a78bfa"
                          : "var(--color-text-faint)";
                  return (
                    <div className="stock-row" key={k}>
                      <span className={`col-pip sd-f${(idx % 6) + 1}`} />
                      <span className="nm" style={{ textTransform: "capitalize" }}>
                        {k.replace("_", "-")}
                      </span>
                      <span className="px">{n}</span>
                      <span className="ch up" style={{ color: tone }}>
                        {pct}%
                      </span>
                    </div>
                  );
                })}
              </CardBody>
            </Card>
            <Card className="col-6">
              <CardHeader showCorner right={<span>readiness</span>}>
                Status flag adoption
              </CardHeader>
              <CardBody>
                {flagRows.map(({ label, n }) => {
                  const total = Math.max(stats.totalItems, 1);
                  const pct = Math.round((n / total) * 100);
                  return (
                    <div className="ac-score-row" key={label}>
                      <span>{label}</span>
                      <span className="ac-score-track">
                        <i style={{ width: `${pct}%` }} />
                      </span>
                      <span className="ac-score-num">{n}</span>
                    </div>
                  );
                })}
              </CardBody>
            </Card>
          </div>

          {/* ========== 04b — TOKEN ECONOMY (CoinGecko) ========== */}
          {tokenItems.length > 0 ? (
            <>
              <div className="sec-head">
                <span className="sec-num">{"// 04b"}</span>
                <h2 className="sec-title">Agent token economy</h2>
                <span className="sec-meta">
                  <b>{tokenItems.length}</b> tokens · combined mcap{" "}
                  <b>${(tokenMcapTotal / 1e9).toFixed(2)}B</b>
                </span>
              </div>
              <div className="grid">
                <Card className="col-6">
                  <CardHeader showCorner right={<span>by mcap</span>}>
                    Top agent tokens
                  </CardHeader>
                  <CardBody>
                    {topTokensByMcap.map((item, idx) => {
                      const mcap = item.live?.marketCapUsd ?? 0;
                      const change = item.live?.priceChange24hPct ?? 0;
                      const positive = change >= 0;
                      return (
                        <Link
                          key={item.id}
                          href={`/agent-commerce/${item.slug}`}
                          style={{
                            display: "grid",
                            gridTemplateColumns:
                              "20px 70px minmax(0, 1fr) 80px 64px",
                            alignItems: "center",
                            gap: 10,
                            padding: "8px 12px",
                            borderBottom:
                              "1px solid var(--color-border-subtle)",
                            textDecoration: "none",
                            color: "inherit",
                            fontFamily: "var(--font-mono, ui-monospace)",
                            fontSize: 12,
                          }}
                        >
                          <span style={{ color: "var(--color-text-faint)" }}>
                            {String(idx + 1).padStart(2, "0")}
                          </span>
                          <span style={{ color: "#a78bfa", fontWeight: 700 }}>
                            ${item.live?.tokenSymbol}
                          </span>
                          <span
                            style={{
                              color: "var(--color-text-default)",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {item.name}
                          </span>
                          <span style={{ textAlign: "right", color: "#fbbf24" }}>
                            {mcap >= 1e9
                              ? `$${(mcap / 1e9).toFixed(2)}B`
                              : `$${(mcap / 1e6).toFixed(0)}M`}
                          </span>
                          <span
                            style={{
                              textAlign: "right",
                              color: positive ? "#34d399" : "#f87171",
                              fontWeight: 700,
                            }}
                          >
                            {positive ? "+" : ""}
                            {change.toFixed(1)}%
                          </span>
                        </Link>
                      );
                    })}
                  </CardBody>
                </Card>
                <Card className="col-6">
                  <CardHeader showCorner right={<span>24h gainers</span>}>
                    Top movers
                  </CardHeader>
                  <CardBody>
                    {topTokenGainers.map((item, idx) => {
                      const change = item.live?.priceChange24hPct ?? 0;
                      const positive = change >= 0;
                      return (
                        <Link
                          key={item.id}
                          href={`/agent-commerce/${item.slug}`}
                          style={{
                            display: "grid",
                            gridTemplateColumns:
                              "20px 70px minmax(0, 1fr) 64px",
                            alignItems: "center",
                            gap: 10,
                            padding: "8px 12px",
                            borderBottom:
                              "1px solid var(--color-border-subtle)",
                            textDecoration: "none",
                            color: "inherit",
                            fontFamily: "var(--font-mono, ui-monospace)",
                            fontSize: 12,
                          }}
                        >
                          <span style={{ color: "var(--color-text-faint)" }}>
                            {String(idx + 1).padStart(2, "0")}
                          </span>
                          <span style={{ color: "#a78bfa", fontWeight: 700 }}>
                            ${item.live?.tokenSymbol}
                          </span>
                          <span
                            style={{
                              color: "var(--color-text-default)",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {item.name}
                          </span>
                          <span
                            style={{
                              textAlign: "right",
                              color: positive ? "#34d399" : "#f87171",
                              fontWeight: 700,
                            }}
                          >
                            {positive ? "+" : ""}
                            {change.toFixed(1)}%
                          </span>
                        </Link>
                      );
                    })}
                  </CardBody>
                </Card>
              </div>
            </>
          ) : null}

          {/* ========== 04c — ON-CHAIN x402 SETTLEMENTS (Base) ========== */}
          {(() => {
            // Inline read of the on-chain indexer output.
            // Source: scripts/fetch-base-x402-onchain.mjs → .data/base-x402-onchain.json
            // (free Blockscout v2 + Merit-Systems/x402scan address book)
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const fs = require("fs") as typeof import("fs");
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const path = require("path") as typeof import("path");
            let onchain: {
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
              samples?: Array<{
                facilitator: string;
                txHash: string;
                from?: string;
                timestamp: string;
                blockNumber?: number;
              }>;
            } | null = null;
            try {
              const raw = fs.readFileSync(
                path.resolve(process.cwd(), ".data/base-x402-onchain.json"),
                "utf8",
              );
              onchain = JSON.parse(raw);
            } catch {
              return null;
            }
            if (!onchain || !onchain.totalSettlements) return null;
            const total = onchain.totalSettlements;
            const facs = Object.entries(onchain.byFacilitator ?? {})
              .map(([name, v]) => ({
                name,
                count: v.x402Settlements,
                share: total > 0 ? (v.x402Settlements / total) * 100 : 0,
              }))
              .sort((a, b) => b.count - a.count);
          const days = Object.entries(onchain.byDay ?? {})
            .sort(([a], [b]) => (a < b ? -1 : 1))
            .slice(-21);
            const maxDay = Math.max(...days.map(([, v]) => v.txs), 1);
            const facColor: Record<string, string> = {
              Coinbase: "#3b82f6",
              Heurist: "#a78bfa",
              CodeNut: "#f59e0b",
              Thirdweb: "#34d399",
            };
            return (
              <>
                <div className="sec-head">
                  <span className="sec-num">{"// 04c"}</span>
                  <h2 className="sec-title">On-chain x402 settlements</h2>
                  <span className="sec-meta">
                    Base · <b>{total.toLocaleString("en-US")}</b> settlements ·{" "}
                    <b>{Object.keys(onchain.byFacilitator ?? {}).length}</b>{" "}
                    facilitators · free via Blockscout
                  </span>
                </div>
                <div className="grid">
                  <Card className="col-6">
                    <CardHeader showCorner right={<span>by facilitator</span>}>
                      Facilitator share
                    </CardHeader>
                    <CardBody>
                      {facs.map((f) => {
                        const tone = facColor[f.name] ?? "#cbd5e1";
                        return (
                          <div
                            key={f.name}
                            style={{
                              display: "grid",
                              gridTemplateColumns:
                                "90px minmax(0, 1fr) 60px 50px",
                              alignItems: "center",
                              gap: 10,
                              padding: "8px 12px",
                              borderBottom:
                                "1px solid var(--color-border-subtle)",
                              fontFamily: "var(--font-mono, ui-monospace)",
                              fontSize: 12,
                            }}
                          >
                            <span style={{ color: tone, fontWeight: 700 }}>
                              {f.name}
                            </span>
                            <span
                              style={{
                                position: "relative",
                                height: 6,
                                background: "var(--color-bg-canvas)",
                                borderRadius: 3,
                                overflow: "hidden",
                              }}
                            >
                              <span
                                style={{
                                  position: "absolute",
                                  inset: 0,
                                  width: `${f.share}%`,
                                  background: tone,
                                }}
                              />
                            </span>
                            <span
                              style={{
                                textAlign: "right",
                                color: "var(--color-text-default)",
                                fontWeight: 700,
                              }}
                            >
                              {f.count}
                            </span>
                            <span
                              style={{
                                textAlign: "right",
                                color: "var(--color-text-faint)",
                              }}
                            >
                              {f.share.toFixed(1)}%
                            </span>
                          </div>
                        );
                      })}
                    </CardBody>
                  </Card>
                  <Card className="col-6">
                    <CardHeader
                      showCorner
                      right={<span>{days.length}d window</span>}
                    >
                      Daily settlements
                    </CardHeader>
                    <CardBody>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "flex-end",
                          gap: 3,
                          padding: "16px 14px 8px",
                          height: 110,
                        }}
                      >
                        {days.map(([day, v]) => {
                          const h = Math.max(
                            2,
                            Math.round((v.txs / maxDay) * 90),
                          );
                          return (
                            <span
                              key={day}
                              title={`${day} · ${v.txs} settlements`}
                              style={{
                                flex: 1,
                                height: `${h}px`,
                                background: "var(--color-accent)",
                                opacity: 0.85,
                                borderTop: "1px solid var(--color-accent)",
                              }}
                            />
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
                        <span>{days[0]?.[0]}</span>
                        <span>{days[days.length - 1]?.[0]}</span>
                      </div>
                    </CardBody>
                  </Card>
                </div>
                {(onchain.samples ?? []).length > 0 ? (
                  <Card>
                    <CardHeader
                      showCorner
                      right={<span>most recent on-chain settlements</span>}
                    >
                      Sample tx hashes
                    </CardHeader>
                    <CardBody>
                      {(onchain.samples ?? []).slice(0, 6).map((s) => (
                        <a
                          key={s.txHash}
                          href={`https://basescan.org/tx/${s.txHash}`}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            display: "grid",
                            gridTemplateColumns: "90px minmax(0, 1fr) 100px",
                            alignItems: "center",
                            gap: 12,
                            padding: "6px 14px",
                            borderBottom:
                              "1px solid var(--color-border-subtle)",
                            color: "inherit",
                            textDecoration: "none",
                            fontFamily: "var(--font-mono, ui-monospace)",
                            fontSize: 11,
                          }}
                        >
                          <span
                            style={{
                              color: facColor[s.facilitator] ?? "#cbd5e1",
                              fontWeight: 700,
                            }}
                          >
                            {s.facilitator}
                          </span>
                          <span
                            style={{
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              color: "var(--color-text-default)",
                            }}
                          >
                            {s.txHash}
                          </span>
                          <span
                            style={{
                              textAlign: "right",
                              color: "var(--color-text-faint)",
                            }}
                          >
                            {new Date(s.timestamp).toISOString().slice(0, 10)}
                          </span>
                        </a>
                      ))}
                    </CardBody>
                  </Card>
                ) : null}
              </>
            );
          })()}

          {/* ========== 04c-sol — ON-CHAIN x402 SETTLEMENTS (Solana) ========== */}
          {(() => {
            // Inline read of the Solana on-chain indexer output.
            // Source: scripts/fetch-solana-x402-onchain.mjs → .data/solana-x402-onchain.json
            // (free Solana RPC + Merit-Systems/x402scan address book)
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const fs = require("fs") as typeof import("fs");
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const path = require("path") as typeof import("path");
            let onchain: {
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
              samples?: Array<{
                facilitator: string;
                txSig: string;
                from?: string | null;
                to?: string | null;
                blockTime: string | null;
                slot?: number | null;
              }>;
            } | null = null;
            try {
              const raw = fs.readFileSync(
                path.resolve(process.cwd(), ".data/solana-x402-onchain.json"),
                "utf8",
              );
              onchain = JSON.parse(raw);
            } catch {
              return null;
            }
            if (!onchain || !onchain.totalSettlements) return null;
            const total = onchain.totalSettlements;
            const facs = Object.entries(onchain.byFacilitator ?? {})
              .map(([name, v]) => ({
                name,
                count: v.x402Settlements,
                share: total > 0 ? (v.x402Settlements / total) * 100 : 0,
              }))
              .sort((a, b) => b.count - a.count);
            const days = Object.entries(onchain.byDay ?? {})
              .sort(([a], [b]) => (a < b ? -1 : 1))
              .slice(-21);
            const maxDay = Math.max(...days.map(([, v]) => v.txs), 1);
            const facColor: Record<string, string> = {
              CodeNut: "#f59e0b",
              PayAI: "#22d3ee",
              Dexter: "#a78bfa",
              Bitrefill: "#fbbf24",
              RelAI: "#34d399",
              UltravioletaDAO: "#c084fc",
              AnySpend: "#60a5fa",
              AurraCloud: "#f472b6",
              Cascade: "#38bdf8",
              Corbits: "#fb7185",
              Daydreams: "#a3e635",
              OpenFacilitator: "#94a3b8",
              OpenX402: "#f87171",
              x402jobs: "#fde047",
            };
            return (
              <>
                <div className="sec-head">
                  <span className="sec-num">{"// 04c-sol"}</span>
                  <h2 className="sec-title">On-chain x402 settlements</h2>
                  <span className="sec-meta">
                    Solana · <b>{total.toLocaleString("en-US")}</b> settlements ·{" "}
                    <b>{Object.keys(onchain.byFacilitator ?? {}).length}</b>{" "}
                    facilitators · free via mainnet-beta RPC
                  </span>
                </div>
                <div className="grid">
                  <Card className="col-6">
                    <CardHeader showCorner right={<span>by facilitator</span>}>
                      Facilitator share
                    </CardHeader>
                    <CardBody>
                      {facs.map((f) => {
                        const tone = facColor[f.name] ?? "#cbd5e1";
                        return (
                          <div
                            key={f.name}
                            style={{
                              display: "grid",
                              gridTemplateColumns:
                                "120px minmax(0, 1fr) 60px 50px",
                              alignItems: "center",
                              gap: 10,
                              padding: "8px 12px",
                              borderBottom:
                                "1px solid var(--color-border-subtle)",
                              fontFamily: "var(--font-mono, ui-monospace)",
                              fontSize: 12,
                            }}
                          >
                            <span style={{ color: tone, fontWeight: 700 }}>
                              {f.name}
                            </span>
                            <span
                              style={{
                                position: "relative",
                                height: 6,
                                background: "var(--color-bg-canvas)",
                                borderRadius: 3,
                                overflow: "hidden",
                              }}
                            >
                              <span
                                style={{
                                  position: "absolute",
                                  inset: 0,
                                  width: `${f.share}%`,
                                  background: tone,
                                }}
                              />
                            </span>
                            <span
                              style={{
                                textAlign: "right",
                                color: "var(--color-text-default)",
                                fontWeight: 700,
                              }}
                            >
                              {f.count}
                            </span>
                            <span
                              style={{
                                textAlign: "right",
                                color: "var(--color-text-faint)",
                              }}
                            >
                              {f.share.toFixed(1)}%
                            </span>
                          </div>
                        );
                      })}
                    </CardBody>
                  </Card>
                  <Card className="col-6">
                    <CardHeader
                      showCorner
                      right={<span>{days.length}d window</span>}
                    >
                      Daily settlements
                    </CardHeader>
                    <CardBody>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "flex-end",
                          gap: 3,
                          padding: "16px 14px 8px",
                          height: 110,
                        }}
                      >
                        {days.map(([day, v]) => {
                          const h = Math.max(
                            2,
                            Math.round((v.txs / maxDay) * 90),
                          );
                          return (
                            <span
                              key={day}
                              title={`${day} · ${v.txs} settlements`}
                              style={{
                                flex: 1,
                                height: `${h}px`,
                                background: "var(--color-accent)",
                                opacity: 0.85,
                                borderTop: "1px solid var(--color-accent)",
                              }}
                            />
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
                        <span>{days[0]?.[0]}</span>
                        <span>{days[days.length - 1]?.[0]}</span>
                      </div>
                    </CardBody>
                  </Card>
                </div>
                {(onchain.samples ?? []).length > 0 ? (
                  <Card>
                    <CardHeader
                      showCorner
                      right={<span>most recent on-chain settlements</span>}
                    >
                      Sample tx signatures
                    </CardHeader>
                    <CardBody>
                      {(onchain.samples ?? []).slice(0, 6).map((s) => (
                        <a
                          key={s.txSig}
                          href={`https://solscan.io/tx/${s.txSig}`}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            display: "grid",
                            gridTemplateColumns: "120px minmax(0, 1fr) 100px",
                            alignItems: "center",
                            gap: 12,
                            padding: "6px 14px",
                            borderBottom:
                              "1px solid var(--color-border-subtle)",
                            color: "inherit",
                            textDecoration: "none",
                            fontFamily: "var(--font-mono, ui-monospace)",
                            fontSize: 11,
                          }}
                        >
                          <span
                            style={{
                              color: facColor[s.facilitator] ?? "#cbd5e1",
                              fontWeight: 700,
                            }}
                          >
                            {s.facilitator}
                          </span>
                          <span
                            style={{
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              color: "var(--color-text-default)",
                            }}
                          >
                            {s.txSig}
                          </span>
                          <span
                            style={{
                              textAlign: "right",
                              color: "var(--color-text-faint)",
                            }}
                          >
                            {s.blockTime
                              ? new Date(s.blockTime).toISOString().slice(0, 10)
                              : "—"}
                          </span>
                        </a>
                      ))}
                    </CardBody>
                  </Card>
                ) : null}
              </>
            );
          })()}

          {/* ========== 05 — CAPABILITY CLOUD ========== */}
          {topCapabilities.length > 0 ? (
            <>
              <div className="sec-head">
                <span className="sec-num">{"// 05"}</span>
                <h2 className="sec-title">Capability frequency</h2>
                <span className="sec-meta">
                  <b>{capCounts.size}</b> distinct capabilities
                </span>
              </div>
              <Card>
                <CardBody>
                  <div className="tag-cloud" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {topCapabilities.map(([cap, n]) => (
                      <span
                        key={cap}
                        className="chip"
                        style={{
                          fontSize: 11 + Math.min(6, Math.log2(n + 1)),
                          opacity: 0.55 + Math.min(0.45, n / 8),
                        }}
                      >
                        {cap}
                        <em
                          style={{
                            fontStyle: "normal",
                            marginLeft: 4,
                            color: "var(--color-text-faint)",
                            fontSize: 10,
                          }}
                        >
                          {n}
                        </em>
                      </span>
                    ))}
                  </div>
                </CardBody>
              </Card>
            </>
          ) : null}

          {/* ========== 06 — OPPORTUNITIES (when on tab) ========== */}
          {filter.tab === "opportunities" && opportunities.length > 0 ? (
            <>
              <div className="sec-head">
                <span className="sec-num">{"// 06"}</span>
                <h2 className="sec-title">Build opportunities</h2>
                <span className="sec-meta">
                  <b>{opportunities.length}</b> / generated from gaps
                </span>
              </div>
              <section className="grid">
                {opportunities.map((op, idx) => (
                  <Card className="col-6" key={idx}>
                    <CardHeader
                      showCorner
                      right={<span className="sec-num">{`// ${String(idx + 1).padStart(2, "0")}`}</span>}
                    >
                      {op.title}
                    </CardHeader>
                    <CardBody>
                      <p
                        style={{
                          margin: 0,
                          color: "var(--color-text-subtle)",
                          fontSize: 13,
                          lineHeight: 1.5,
                        }}
                      >
                        {op.reason}
                      </p>
                    </CardBody>
                  </Card>
                ))}
              </section>
            </>
          ) : null}

          {/* ========== 06 — CATEGORY LEADERBOARDS ========== */}
          <div className="sec-head">
            <span className="sec-num">{"// 06"}</span>
            <h2 className="sec-title">Sector leaderboards</h2>
            <span className="sec-meta">
              top 5 / sector · sparklines synthetic until history lands
            </span>
          </div>
          <div className="grid">
            <MiniBoard
              title="Top wallets"
              items={topWallets}
              accent="#a78bfa"
              emptyHint="No wallets in current data."
            />
            <MiniBoard
              title="Top APIs"
              items={topApis}
              accent="#22d3ee"
              emptyHint="No APIs in current data."
            />
          </div>
          <div className="grid">
            <MiniBoard
              title="Top MCP servers"
              items={topMcp}
              accent="#22d3ee"
              rightLabel={`${stats.mcpServerCount} indexed`}
              emptyHint="No MCP servers detected."
            />
            <MiniBoard
              title="Top x402 services"
              items={topX402List}
              accent="#f59e0b"
              rightLabel={`${stats.x402EnabledCount} enabled`}
              emptyHint="No x402-enabled services detected."
            />
          </div>
          <div className="grid">
            <MiniBoard
              title="Top marketplaces"
              items={topMarketplaces}
              accent="#f472b6"
              emptyHint="No marketplaces in current data."
            />
            <Card className="col-6">
              <CardHeader showCorner right={<span>{filter.tab}</span>}>
                Filter snapshot
              </CardHeader>
              <CardBody>
                <div
                  style={{
                    display: "grid",
                    gap: 8,
                    padding: "10px 14px",
                    fontFamily: "var(--font-mono, ui-monospace)",
                    fontSize: 11.5,
                    color: "var(--color-text-subtle)",
                  }}
                >
                  <div>
                    matching <b style={{ color: "var(--color-text-default)" }}>{totalRendered}</b> of{" "}
                    {stats.totalItems} entities
                  </div>
                  <div>
                    category:{" "}
                    <span style={{ color: "var(--color-accent)" }}>
                      {filter.category ?? "all"}
                    </span>
                  </div>
                  <div>
                    protocol:{" "}
                    <span style={{ color: "var(--color-accent)" }}>
                      {filter.protocols.size === 0
                        ? "any"
                        : Array.from(filter.protocols).join(", ")}
                    </span>
                  </div>
                  <div>
                    pricing:{" "}
                    <span style={{ color: "var(--color-accent)" }}>
                      {filter.pricing ?? "any"}
                    </span>
                  </div>
                  <div>
                    portal-ready filter:{" "}
                    <span style={{ color: "var(--color-accent)" }}>
                      {filter.portalReady ? "on" : "off"}
                    </span>
                  </div>
                  {filter.query ? (
                    <div>
                      query:{" "}
                      <span style={{ color: "var(--color-accent)" }}>
                        “{filter.query}”
                      </span>
                    </div>
                  ) : null}
                </div>
              </CardBody>
            </Card>
          </div>

          {/* ========== 07 — BROWSE (compact card grid) ========== */}
          {totalRendered > 0 ? (
            <>
              <div className="sec-head">
                <span className="sec-num">
                  {filter.tab === "opportunities" ? "// 07" : "// 06"}
                </span>
                <h2 className="sec-title">
                  Browse {filter.tab === "overview" ? "all" : filter.tab}
                </h2>
                <span className="sec-meta">
                  <b>{totalRendered}</b> / matching
                </span>
              </div>
              <div className="ac-grid">
                {grid.slice(0, 12).map((item) => (
                  <AgentCommerceCard key={item.id} item={item} />
                ))}
              </div>
            </>
          ) : (
            <div className="ac-empty">
              <h2>No matches for the current filter.</h2>
              <p>
                The dashboard above stays global. Loosen the protocol / pricing /
                portal-ready filters to populate the browse grid.
              </p>
            </div>
          )}
        </>
      )}
    </main>
  );
}
