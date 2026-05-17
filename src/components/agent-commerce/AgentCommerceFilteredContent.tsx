"use client";

// Agent Commerce — client-side filter shell.
//
// Cache fix B: the previous server component awaited `searchParams`, which
// forced /agent-commerce off ISR (full dynamic on every request). This
// component reads `useSearchParams()` on the client, so the surrounding RSC
// shell stays statically prerenderable under `revalidate=1200`.
//
// The page passes the full corpus + heavy panel children in via props/render
// props; this component renders the tab strip, filter bar, browse grid, and
// the active-filter snapshot. Section panels (movers, score distribution,
// token economy, on-chain, dune) live as JSX children supplied by the page so
// they remain server-rendered.

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";

import type { ReactNode } from "react";

import { AgentCommerceCard } from "@/components/agent-commerce/AgentCommerceCard";
import { AgentCommerceFilterBar } from "@/components/agent-commerce/AgentCommerceFilterBar";
import { AgentCommerceTabs } from "@/components/agent-commerce/AgentCommerceTabs";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { SectionHead } from "@/components/ui/SectionHead";
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
  AgentCommerceStats,
} from "@/lib/agent-commerce/types";

interface AgentCommerceFilteredContentProps {
  items: AgentCommerceItem[];
  stats: AgentCommerceStats;
  /** Section panels keyed by section number — rendered above the browse grid. */
  children: ReactNode;
}

function buildBaseQuery(sp: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams();
  for (const [k, v] of sp.entries()) {
    if (v.length > 0) next.set(k, v);
  }
  return next;
}

export function AgentCommerceFilteredContent({
  items,
  stats,
  children,
}: AgentCommerceFilteredContentProps) {
  const sp = useSearchParams();

  const filter: AgentCommerceFilter = useMemo(
    () => ({
      tab: parseTab(sp.get("tab")),
      category: parseCategory(sp.get("cat")),
      protocols: parseProtocols(sp.get("protocol")),
      pricing: parsePricing(sp.get("pricing")),
      portalReady: parsePortalReady(sp.get("portalready")),
      query: parseSearchQuery(sp.get("q")),
    }),
    [sp],
  );

  const baseQuery = useMemo(
    () => buildBaseQuery(new URLSearchParams(sp.toString())),
    [sp],
  );

  // Per-tab counts for the tab strip — derived client-side because tab counts
  // change when category/protocol filters mutate the corpus.
  const tabCounts = useMemo(() => {
    const counts: Partial<Record<(typeof TABS)[number], number>> = {};
    for (const tab of TABS) {
      if (tab === "overview" || tab === "signals" || tab === "opportunities") {
        counts[tab] = stats.totalItems;
        continue;
      }
      const subset = applyFilter(items, {
        ...filter,
        tab,
        category: null,
        protocols: new Set<AgentCommerceProtocol>(),
        pricing: null,
        portalReady: false,
        query: "",
      });
      counts[tab] = subset.length;
    }
    return counts;
  }, [items, stats.totalItems, filter]);

  const filtered = useMemo(() => applyFilter(items, filter), [items, filter]);
  const sorted = useMemo(
    () => filtered.slice().sort((a, b) => b.scores.composite - a.scores.composite),
    [filtered],
  );
  const grid = sorted.slice(0, 60);
  const totalRendered = sorted.length;

  return (
    <>
      <AgentCommerceTabs
        active={filter.tab}
        counts={tabCounts}
        baseQuery={baseQuery}
      />
      <AgentCommerceFilterBar
        category={filter.category}
        protocols={filter.protocols}
        pricing={filter.pricing}
        portalReady={filter.portalReady}
        query={filter.query}
        baseQuery={baseQuery}
      />

      {children}

      <SectionHead
        num="// 08"
        title="Filter snapshot"
        meta={
          <>
            <b>{totalRendered}</b> / matching · tab <b>{filter.tab}</b>
          </>
        }
      />
      <Card>
        <CardHeader showCorner right={<span>{filter.tab}</span>}>
          Active filters
        </CardHeader>
        <CardBody>
          <div className="ac-filter-snapshot">
            <div>
              matching <b>{totalRendered}</b> of {stats.totalItems} entities
            </div>
            <div>
              category:{" "}
              <span className="ac-filter-snapshot__val">
                {filter.category ?? "all"}
              </span>
            </div>
            <div>
              protocol:{" "}
              <span className="ac-filter-snapshot__val">
                {filter.protocols.size === 0
                  ? "any"
                  : Array.from(filter.protocols).join(", ")}
              </span>
            </div>
            <div>
              pricing:{" "}
              <span className="ac-filter-snapshot__val">
                {filter.pricing ?? "any"}
              </span>
            </div>
            <div>
              portal-ready:{" "}
              <span className="ac-filter-snapshot__val">
                {filter.portalReady ? "on" : "off"}
              </span>
            </div>
            {filter.query ? (
              <div>
                query:{" "}
                <span className="ac-filter-snapshot__val">
                  &ldquo;{filter.query}&rdquo;
                </span>
              </div>
            ) : null}
          </div>
        </CardBody>
      </Card>

      {totalRendered > 0 ? (
        <>
          <SectionHead
            num="// 09"
            title={
              <>
                Browse {filter.tab === "overview" ? "all" : filter.tab}
              </>
            }
            meta={
              <>
                <b>{totalRendered}</b> / matching
              </>
            }
          />
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
  );
}
