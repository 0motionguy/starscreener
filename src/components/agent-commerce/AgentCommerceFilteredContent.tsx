"use client";

// Agent Commerce — client-side filter shell.
//
// Cache fix B: the previous server component awaited `searchParams`, which
// forced /agent-commerce off ISR (full dynamic on every request). This
// component reads `useSearchParams()` on the client, so the surrounding RSC
// shell stays statically prerenderable under `revalidate=1200`.
//
// Perf fix (2026-05-17): the page used to pass the FULL AgentCommerceItem
// corpus (~7.6k items × ~2.7KB each → 8.8MB serialized HTML). The client
// island only needs a thin slice of each item for filter/tab counts + the
// 12-card browse grid render. Heavy fields (`sources`, `live`, timestamps)
// stay server-side where the panel components (MoversBoard,
// TokenEconomyBoards, ScoreDistributionGrid…) still receive the full corpus
// as RSC props that are NOT round-tripped to client JSON.
//
// The page passes a slim-corpus + heavy panel children in via
// props/render props; this component renders the tab strip, filter bar,
// browse grid, and the active-filter snapshot. Section panels (movers,
// score distribution, token economy, on-chain, dune) live as JSX children
// supplied by the page so they remain server-rendered.

import { useEffect, useMemo, useState } from "react";
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
  type AgentCommerceTab,
} from "@/lib/agent-commerce/extract";
import type {
  AgentCommerceItem,
  AgentCommerceStats,
} from "@/lib/agent-commerce/types";

/**
 * Slim shape sent to the client island. Drops `sources`, `live`,
 * `firstSeenAt`, `lastUpdatedAt` — none of those are read by the filter
 * logic in `applyFilter`, the tab/protocol counters, or the
 * `AgentCommerceCard` render path. Keeps the SSR HTML payload small.
 *
 * If you add a new filter that needs a heavier field, extend
 * `toSlimItem()` in `src/lib/agent-commerce/slim.ts` rather than passing
 * the full `AgentCommerceItem` corpus here.
 */
export type SlimAgentCommerceItem = Pick<
  AgentCommerceItem,
  | "id"
  | "slug"
  | "name"
  | "brief"
  | "kind"
  | "category"
  | "protocols"
  | "pricing"
  | "capabilities"
  | "links"
  | "badges"
  | "scores"
  | "tags"
>;

interface AgentCommerceFilteredContentProps {
  /**
   * Top-`clientCorpusLimit` items from the full corpus, slimmed to only
   * the fields the filter/card render path reads. Sized so the
   * serialized SSR payload stays under the page's HTML budget.
   */
  items: SlimAgentCommerceItem[];
  stats: AgentCommerceStats;
  /**
   * Precomputed tab counts over the FULL corpus. The client island only
   * holds the top-N slice, so it can't recompute these without dropping
   * accuracy.
   */
  serverTabCounts?: Partial<Record<AgentCommerceTab, number>>;
  /** Full corpus size (before slim/top-N projection). */
  corpusTotal?: number;
  /** Same as the server's `CLIENT_CORPUS_LIMIT`; surfaced in UX hints. */
  clientCorpusLimit?: number;
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
  serverTabCounts,
  corpusTotal,
  clientCorpusLimit,
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

  // Per-tab counts for the tab strip. Prefer the server-precomputed
  // counts (which see the full corpus) over the client-side fallback
  // (which only sees the top-N slim slice we shipped).
  const tabCounts = useMemo(() => {
    if (serverTabCounts) return serverTabCounts;
    const counts: Partial<Record<(typeof TABS)[number], number>> = {};
    for (const tab of TABS) {
      if (tab === "overview" || tab === "signals" || tab === "opportunities") {
        counts[tab] = stats.totalItems;
        continue;
      }
      const subset = items.filter((item) => {
        if (tab === "payments") {
          return (
            item.protocols.includes("x402") ||
            item.protocols.includes("a2a") ||
            item.kind === "protocol" ||
            item.kind === "infra"
          );
        }
        if (tab === "marketplaces") return item.kind === "marketplace";
        if (tab === "apis") return item.kind === "api";
        if (tab === "wallets") return item.kind === "wallet";
        if (tab === "mcp") return item.badges.mcpServer || item.kind === "tool";
        return true;
      });
      counts[tab] = subset.length;
    }
    return counts;
  }, [items, stats.totalItems, serverTabCounts]);

  const filtered = useMemo(() => applyFilter(items, filter), [items, filter]);
  const sorted = useMemo(
    () => filtered.slice().sort((a, b) => b.scores.composite - a.scores.composite),
    [filtered],
  );
  const totalRendered = sorted.length;

  // Pagination: render INITIAL_BROWSE_LIMIT cards on first paint; the
  // "Load more" button below bumps `visibleCount` in PAGE_SIZE chunks
  // until all matching items are shown. Reset whenever the filter narrows
  // so users don't carry an oversize count into a smaller corpus.
  const INITIAL_BROWSE_LIMIT = 50;
  const PAGE_SIZE = 50;
  const [visibleCount, setVisibleCount] = useState(INITIAL_BROWSE_LIMIT);
  useEffect(() => {
    setVisibleCount(INITIAL_BROWSE_LIMIT);
  }, [filter]);
  const grid = sorted.slice(0, visibleCount);
  const remaining = Math.max(0, totalRendered - grid.length);

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
              corpusTotal && clientCorpusLimit && corpusTotal > clientCorpusLimit ? (
                <>
                  <b>{totalRendered}</b> / matching · top{" "}
                  <b>{clientCorpusLimit}</b> of {corpusTotal}
                </>
              ) : (
                <>
                  <b>{totalRendered}</b> / matching
                </>
              )
            }
          />
          <div className="ac-grid">
            {grid.map((item) => (
              <AgentCommerceCard key={item.id} item={item} />
            ))}
          </div>
          {remaining > 0 ? (
            <div className="ac-load-more">
              <button
                type="button"
                className="ac-load-more__btn"
                onClick={() =>
                  setVisibleCount((c) =>
                    Math.min(c + PAGE_SIZE, totalRendered),
                  )
                }
                aria-label={`Load ${Math.min(PAGE_SIZE, remaining)} more cards`}
              >
                Load {Math.min(PAGE_SIZE, remaining)} more ·{" "}
                <span className="ac-load-more__count">
                  {grid.length} of {totalRendered}
                </span>
              </button>
            </div>
          ) : null}
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
