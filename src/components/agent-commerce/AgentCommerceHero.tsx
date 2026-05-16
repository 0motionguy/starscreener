// Agent Commerce — unified hero band (page-head + verdict + KPI band).
//
// A8-P3: reshaped from the three stacked sections that landed in A8-P2 into
// a single visual panel. The page-head crumb/h1/lede sit at the TOP of the
// band, the verdict ribbon runs through the middle, and the KPI band sits
// FLUSH against the bottom — one border, one background, three rows divided
// only by thin internal lines. Class names are scoped under `.ac-hero-band`
// so the global `.page-head` / `.verdict` / `.kpi-band` chrome doesn't
// double up. Pure presentation: every value comes in via props.
import Link from "next/link";

import { Metric, MetricGrid } from "@/components/ui/Metric";

import type { AgentCommerceStats } from "@/lib/agent-commerce/types";

function pluralize(n: number, one: string, many: string): string {
  return n === 1 ? `${n} ${one}` : `${n} ${many}`;
}

export interface AgentCommerceHeroProps {
  /** ISO 8601 clock string already formatted to HH:MM:SS by the page. */
  computed: string;
  /** Window descriptor (e.g. `30` for a 30-day window). */
  windowDays: number;
  stats: AgentCommerceStats;
}

export function AgentCommerceHero({
  computed,
  windowDays,
  stats,
}: AgentCommerceHeroProps) {
  return (
    <section className="ac-hero-band" aria-label="Agent Commerce overview">
      <div className="ac-hero-head">
        <div className="ac-hero-head__title">
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
        <div className="ac-hero-head__clock">
          <span className="big">{computed}</span>
          <span className="live">updated</span>
        </div>
      </div>

      <div className="ac-hero-verdict">
        <div className="v-stamp">
          <span>commerce radar</span>
          <span className="ts">{stats.totalItems} entities</span>
          <span className="ago">{windowDays}d window</span>
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
      </div>

      <MetricGrid columns={6} className="ac-hero-kpi">
        <Metric label="Total" value={stats.totalItems} sub="entities" pip />
        <Metric label="New 7d" value={stats.thisWeekCount} sub="this week" tone="external" pip />
        <Metric label="x402" value={stats.x402EnabledCount} sub="enabled" tone="accent" pip />
        <Metric label="Portal" value={stats.portalReadyCount} sub="ready" tone="positive" pip />
        <Metric label="MCP" value={stats.mcpServerCount} sub="servers" tone="consensus" pip />
        <Metric label="AISO ≥80" value={stats.highAisoCount} sub="visible" tone="warning" pip />
      </MetricGrid>
    </section>
  );
}
