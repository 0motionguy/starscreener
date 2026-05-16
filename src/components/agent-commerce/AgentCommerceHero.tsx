// Agent Commerce — hero scaffolding (page-head + verdict ribbon + KPI band).
//
// Extracted from `src/app/agent-commerce/page.tsx` as part of A8-P2 so the
// follow-on visible-redesign PR can reshape the hero band without a 2k-line
// diff. Pure presentation: every value comes in via props.

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
    <>
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
      </section>

      <MetricGrid columns={6} className="kpi-band">
        <Metric label="Total" value={stats.totalItems} sub="entities" pip />
        <Metric label="New 7d" value={stats.thisWeekCount} sub="this week" tone="external" pip />
        <Metric label="x402" value={stats.x402EnabledCount} sub="enabled" tone="accent" pip />
        <Metric label="Portal" value={stats.portalReadyCount} sub="ready" tone="positive" pip />
        <Metric label="MCP" value={stats.mcpServerCount} sub="servers" tone="consensus" pip />
        <Metric label="AISO ≥80" value={stats.highAisoCount} sub="visible" tone="warning" pip />
      </MetricGrid>
    </>
  );
}
