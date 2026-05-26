// Display-data helpers for the /agent-commerce surface.
//
// 2026-05-23: stripped SEED_TOKENS (Fetch.ai $0.842, AGIX $0.413, OCEAN
// $0.612, AERO $1.84, RNDR $8.42, VIRTUAL $2.18, TAO $284, AKT $1.94) and
// SEED_MOVERS (Base Pay, MCP Registry, Coinbase Wallet, etc) and the
// derive*() synthesizers that fabricated price/volume/mcap from non-price
// fields. Token data now comes from CoinGecko via fetchAgentTokens();
// composite movers come from the real AgentCommerceItem spine.
//
// Honesty contract: empty real data → empty tables, not invented rows.

import type { AgentToken } from "@/lib/agent-commerce/live-tokens";
import type { AgentCommerceItem } from "@/lib/agent-commerce/types";

export interface TokenMarketRow {
  id: string;
  name: string;
  symbol: string;
  category: string;
  priceUsd: number;
  changePct: number;
  volumeUsd: number;
  marketCapUsd: number;
  /** Real CDN-hosted logo URL from CoinGecko. */
  logoUrl: string;
}

export interface CompositeMoverRow {
  id: string;
  name: string;
  description: string;
  href: string;
  glyph: string;
  badges: Array<"x402" | "mcp" | "a2a" | "portal">;
  score: number;
  delta: number;
}

/** Map live CoinGecko tokens into TokenMarketRow shape (1-to-1). */
export function tokenRowsFromAgentTokens(tokens: AgentToken[]): TokenMarketRow[] {
  return tokens.map((t) => ({
    id: t.id,
    name: t.name,
    symbol: t.symbol,
    category: t.category,
    priceUsd: t.priceUsd,
    changePct: t.changePct24h,
    volumeUsd: t.volumeUsd,
    marketCapUsd: t.marketCapUsd,
    logoUrl: t.logoUrl,
  }));
}

/** Filtered + sorted gainer/loser slice from real CoinGecko data. */
export function getTokenRows(
  tokens: AgentToken[],
  direction: "gainers" | "losers",
  limit: number,
): TokenMarketRow[] {
  const rows = tokenRowsFromAgentTokens(tokens);
  const filtered =
    direction === "gainers"
      ? rows.filter((r) => r.changePct > 0)
      : rows.filter((r) => r.changePct < 0);
  filtered.sort((a, b) =>
    direction === "gainers" ? b.changePct - a.changePct : a.changePct - b.changePct,
  );
  return filtered.slice(0, limit);
}

/** Composite movers from real AgentCommerceItem spine. Empty → empty. */
export function getCompositeMoverRows(
  items: AgentCommerceItem[],
  limit: number,
): CompositeMoverRow[] {
  return [...items]
    .sort((a, b) => b.scores.composite - a.scores.composite)
    .slice(0, limit)
    .map((item) => ({
      id: item.id,
      name: item.name,
      description: shortDesc(item),
      href: item.links.website ?? item.links.docs ?? item.links.github ?? "#",
      glyph: item.name.charAt(0).toUpperCase(),
      badges: badgesFor(item),
      score: item.scores.composite,
      delta: deriveMoverDelta(item),
    }));
}

/** Score distribution sample — real items only, no padding to target count. */
export function getScoreSample(items: AgentCommerceItem[]): number[] {
  return items.map((item) => item.scores.composite);
}

/** Aggregate market cap across live tokens. Empty → 0. */
export function liveTokenMarketCap(tokens: AgentToken[]): number {
  return tokens.reduce((sum, t) => sum + (t.marketCapUsd || 0), 0);
}

function badgesFor(item: AgentCommerceItem): CompositeMoverRow["badges"] {
  const badges: CompositeMoverRow["badges"] = [];
  if (item.badges.x402Enabled || item.protocols.includes("x402")) badges.push("x402");
  if (item.badges.mcpServer || item.protocols.includes("mcp")) badges.push("mcp");
  if (item.protocols.includes("a2a")) badges.push("a2a");
  if (item.badges.portalReady || item.badges.agentActionable) badges.push("portal");
  return badges.length > 0 ? badges : ["portal"];
}

function shortDesc(item: AgentCommerceItem): string {
  if (item.brief) return item.brief.length > 82 ? `${item.brief.slice(0, 81)}...` : item.brief;
  if (item.links.website) return item.links.website.replace(/^https?:\/\//, "").replace(/\/$/, "");
  return `${item.category} - ${item.kind}`;
}

function deriveMoverDelta(item: AgentCommerceItem): number {
  const social = item.live?.socialTotal ?? 0;
  const recent = item.live?.pushedAt ? Date.parse(item.live.pushedAt) > Date.now() - 14 * 86_400_000 : false;
  const score = item.scores.composite;
  const delta = (score - 55) / 12 + social / 80 + (recent ? 1.1 : 0);
  return Number(delta.toFixed(1));
}
