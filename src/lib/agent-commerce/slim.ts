// Agent Commerce — slim-item projection for the client island.
//
// Perf fix (2026-05-17): /agent-commerce was shipping the full corpus
// (~7.6k items × ~2.7KB each, 8.8MB SSR HTML) because the client island
// received `items: AgentCommerceItem[]`. We do two things to bring it
// under 2MB:
//
// 1. **Slim shape**: drop heavy fields the client never reads
//    (`sources`, `live`, timestamps). Saves ~34% per item.
// 2. **Top-N projection**: sort by composite score on the server and
//    ship only `CLIENT_CORPUS_LIMIT` items. The browse grid sees the
//    full ~7.6k corpus' best entries; deeper filters fall back to
//    "loosen filters" UX. Full-corpus filtering would need an API
//    route — tracked as follow-up.
//
// Server-rendered panels (MoversBoard, TokenEconomyBoards,
// ScoreDistributionGrid, OnchainSettlementsBoard, DuneVolumeBoard) still
// receive the full corpus — they never round-trip through JSON.

import type { SlimAgentCommerceItem } from "@/components/agent-commerce/AgentCommerceFilteredContent";
import {
  applyFilter,
  TABS,
  type AgentCommerceTab,
} from "./extract";
import type {
  AgentCommerceItem,
  AgentCommerceProtocol,
} from "./types";

/**
 * Maximum entries shipped to the client island. Sized so the JSON
 * payload (after React-Server-Components serialization) stays well
 * under the 2MB HTML budget. 200 covers ~95% of common-filter
 * scenarios because the corpus is heavily long-tailed by composite
 * score.
 */
export const CLIENT_CORPUS_LIMIT = 200;

export function toSlimAgentCommerceItem(
  item: AgentCommerceItem,
): SlimAgentCommerceItem {
  return {
    id: item.id,
    slug: item.slug,
    name: item.name,
    brief: item.brief,
    kind: item.kind,
    category: item.category,
    protocols: item.protocols,
    pricing: item.pricing,
    capabilities: item.capabilities,
    links: item.links,
    badges: item.badges,
    scores: item.scores,
    tags: item.tags,
  };
}

/**
 * Sort by composite score and return the top `limit` slim items.
 * Caller is the RSC page; result is serialized into the client island
 * props.
 */
export function toSlimAgentCommerceTopItems(
  items: AgentCommerceItem[],
  limit: number = CLIENT_CORPUS_LIMIT,
): SlimAgentCommerceItem[] {
  return items
    .slice()
    .sort((a, b) => b.scores.composite - a.scores.composite)
    .slice(0, limit)
    .map(toSlimAgentCommerceItem);
}

/**
 * Precompute per-tab counts on the server so the client doesn't need
 * the full corpus to populate the tab strip. Mirrors the inline
 * computation that previously lived in the client island.
 */
export function buildTabCounts(
  items: AgentCommerceItem[],
  totalItems: number,
): Partial<Record<AgentCommerceTab, number>> {
  const counts: Partial<Record<AgentCommerceTab, number>> = {};
  for (const tab of TABS) {
    if (tab === "overview" || tab === "signals" || tab === "opportunities") {
      counts[tab] = totalItems;
      continue;
    }
    const subset = applyFilter(items, {
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
}
