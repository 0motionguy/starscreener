// Live AI-agent + agent-commerce token quotes via CoinGecko's public API.
//
// CoinGecko's free /coins/markets endpoint is no-auth (with light rate
// limits) and returns price, 24h/7d change, market cap, volume, AND the
// canonical brand-logo image URL per token — exactly the four fields the
// /agent-commerce tables need. One fetch, real prices, real logos.
//
// Server-side only. Failure mode is `[]` so the consumer renders an honest
// empty state — never fabricates prices.
//
// To upgrade to a websocket stream later, wrap this in an SSE endpoint
// (e.g. CoinGecko Pro WS or DEX-level sources like cookies.fun) and flip
// the consumers to a client island. Shapes below stay stable.

export interface AgentToken {
  /** CoinGecko id (e.g. "bittensor"). */
  id: string;
  /** Trading symbol (e.g. "TAO"). */
  symbol: string;
  /** Display name. */
  name: string;
  /** Logo URL hosted by CoinGecko's CDN. */
  logoUrl: string;
  /** Latest USD price. */
  priceUsd: number;
  /** 24h price change percent. */
  changePct24h: number;
  /** 7d price change percent (may be null if not returned). */
  changePct7d: number | null;
  /** 24h volume USD. */
  volumeUsd: number;
  /** Market cap USD. */
  marketCapUsd: number;
  /** Editorial category we assign for the table — "agent infra", "agent token", etc. */
  category: string;
  /** ISO timestamp the quote was fetched. */
  fetchedAt: string;
}

interface TrackedToken {
  /** CoinGecko id. */
  id: string;
  /** Our editorial classification — surfaces in the table. */
  category: string;
}

/**
 * Curated AI-agent / agent-commerce universe. Anything CoinGecko doesn't
 * have just gets dropped from the response — no synthesized rows.
 *
 * Order doesn't matter for fetching; the response is sorted server-side
 * by market_cap_desc, and consumers re-sort by their own metric.
 */
const TRACKED_TOKENS: TrackedToken[] = [
  // Tier 1 — agent infrastructure with substantive market caps
  { id: "bittensor", category: "subnet economy" },
  { id: "internet-computer", category: "agent runtime" },
  { id: "the-graph", category: "agent data" },
  { id: "fetch-ai", category: "agent infra" },
  { id: "render-token", category: "GPU compute" },
  { id: "akash-network", category: "decentralized GPU" },
  { id: "ocean-protocol", category: "data marketplace" },
  { id: "singularitynet", category: "agent network" },
  { id: "aerodrome-finance", category: "Base DEX" },
  // Tier 2 — agent / AI-native tokens on Base + Solana
  { id: "virtual-protocol", category: "AI agents" },
  { id: "ai16z", category: "agent fund" },
  { id: "arkham", category: "agent intel" },
  { id: "numerai", category: "agent ML" },
  { id: "cookie", category: "agent index" },
  { id: "griffain", category: "agent platform" },
  { id: "aixbt-by-virtuals", category: "agent token" },
  { id: "zerebro", category: "agent token" },
  { id: "swarms", category: "multi-agent" },
];

interface CoinGeckoMarketRow {
  id: string;
  symbol: string;
  name: string;
  image: string;
  current_price: number | null;
  market_cap: number | null;
  total_volume: number | null;
  price_change_percentage_24h: number | null;
  price_change_percentage_7d_in_currency?: number | null;
}

const COINGECKO_UA =
  "Mozilla/5.0 (compatible; TrendingRepo/1.0; +https://trendingrepo.com)";

/**
 * Fetch live quotes for the curated AI-agent token universe. Single
 * CoinGecko request, server-side, 5-min revalidate. Returns rows in
 * declared TRACKED_TOKENS order so the page's editorial intent survives
 * CoinGecko's market-cap sort.
 */
export async function fetchAgentTokens(): Promise<AgentToken[]> {
  const ids = TRACKED_TOKENS.map((t) => t.id).join(",");
  const url =
    `https://api.coingecko.com/api/v3/coins/markets` +
    `?vs_currency=usd&ids=${ids}&order=market_cap_desc&per_page=50&page=1` +
    `&sparkline=false&price_change_percentage=24h,7d`;
  const fetchedAt = new Date().toISOString();

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": COINGECKO_UA, Accept: "application/json" },
      // 5 minutes — CoinGecko's free tier rate-limits aggressively if hit too
      // often. Prices on this surface don't need sub-minute freshness.
      next: { revalidate: 300 },
    });
    if (!res.ok) return [];
    const rows = (await res.json()) as CoinGeckoMarketRow[];
    if (!Array.isArray(rows) || rows.length === 0) return [];

    const byId = new Map(rows.map((r) => [r.id, r]));
    const out: AgentToken[] = [];
    for (const tracked of TRACKED_TOKENS) {
      const r = byId.get(tracked.id);
      if (!r) continue;
      if (typeof r.current_price !== "number" || r.current_price <= 0) continue;
      out.push({
        id: r.id,
        symbol: (r.symbol || "").toUpperCase(),
        name: r.name,
        logoUrl: r.image,
        priceUsd: r.current_price,
        changePct24h: r.price_change_percentage_24h ?? 0,
        changePct7d: r.price_change_percentage_7d_in_currency ?? null,
        volumeUsd: r.total_volume ?? 0,
        marketCapUsd: r.market_cap ?? 0,
        category: tracked.category,
        fetchedAt,
      });
    }
    return out;
  } catch {
    return [];
  }
}

export function formatTokenPrice(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "—";
  if (value >= 1000) return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  if (value >= 1) return `$${value.toFixed(2)}`;
  if (value >= 0.01) return `$${value.toFixed(3)}`;
  return `$${value.toFixed(5)}`;
}

export function formatTokenMarketCap(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "—";
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${Math.round(value)}`;
}

export function formatTokenVolume(value: number): string {
  return formatTokenMarketCap(value);
}

export function formatTokenChange(pct: number): string {
  if (!Number.isFinite(pct)) return "—";
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}
