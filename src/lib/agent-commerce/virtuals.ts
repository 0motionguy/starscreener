// Virtuals Protocol — live agent registry fetcher.
//
// Virtuals.io is the largest on-Base AI-agent registry (~40k tokenized
// agents at time of writing). Each agent is an on-chain token (ERC-20) +
// LP pair on Base with mcap denominated in VIRTUAL. Their public API is
// open (no auth) and returns rich per-agent state:
//
//   - name, symbol, category, chain, status
//   - image.url (real S3-hosted logo per agent)
//   - mcapInVirtual, totalValueLocked, liquidityUsd
//   - holderCount, holderCountPercent24h
//   - priceChangePercent24h, volume24h
//   - tokenAddress (Base), lpAddress
//
// Conversion: mcapInVirtual × VIRTUAL_price_usd → mcapUsd. The VIRTUAL
// price comes from our existing CoinGecko fetch (live-tokens.ts).
//
// Server-side only, 5-minute revalidate. Failure → []. Never fabricates.

import { fetchWithTimeout } from "./fetch-timeout";

export interface VirtualAgent {
  id: number;
  name: string;
  symbol: string;
  category: string;
  chain: string;
  status: string;
  /** Real CDN-hosted logo URL (S3). */
  imageUrl: string;
  /** Market cap in VIRTUAL tokens. */
  mcapInVirtual: number;
  /** Market cap in USD (mcapInVirtual × VIRTUAL price USD). 0 when unknown. */
  mcapUsd: number;
  /** Liquidity in USD on the LP pair. */
  liquidityUsd: number;
  /** Volume in last 24h, denominated in VIRTUAL. */
  volume24h: number;
  /** Number of unique token holders. */
  holderCount: number;
  /** 24h change in holder count (percent). */
  holderChangePct24h: number;
  /** 24h price change (percent). */
  priceChangePct24h: number;
  /** On-chain token contract (Base). */
  tokenAddress: string;
  /** Basescan URL for the token. */
  basescanUrl: string;
  /** virtuals.io detail-page URL. */
  virtualsUrl: string;
  /** ISO timestamp the data was fetched. */
  fetchedAt: string;
}

interface VirtualsApiAgent {
  id: number;
  name: string;
  symbol: string;
  category: string | null;
  chain: string;
  status: string;
  image?: { url?: string } | null;
  mcapInVirtual: number | null;
  liquidityUsd: number | null;
  volume24h: number | null;
  holderCount: number | null;
  holderCountPercent24h: number | null;
  priceChangePercent24h: number | null;
  tokenAddress: string;
}

interface VirtualsApiResponse {
  data?: VirtualsApiAgent[];
  meta?: { pagination?: { total?: number } };
}

const VIRTUALS_UA =
  "Mozilla/5.0 (compatible; TrendingRepo/1.0; +https://trendingrepo.com)";
const VIRTUALS_TIMEOUT_MS = 4_000;

/**
 * Fetch top N Virtuals Protocol agents by market cap descending.
 *
 * @param virtualPriceUsd USD price of one VIRTUAL token (from CoinGecko).
 *                        Pass 0 if unknown — USD mcap will surface as 0.
 * @param limit           How many agents to return. Default 12.
 */
export async function fetchVirtualAgents(
  virtualPriceUsd: number,
  limit = 12,
): Promise<VirtualAgent[]> {
  const url =
    `https://api.virtuals.io/api/virtuals` +
    `?pagination%5Bpage%5D=1` +
    `&pagination%5BpageSize%5D=${limit}` +
    `&sort=mcapInVirtual:desc` +
    `&filters%5Bstatus%5D=AVAILABLE`;
  const fetchedAt = new Date().toISOString();

  try {
    const res = await fetchWithTimeout(url, {
      timeoutMs: VIRTUALS_TIMEOUT_MS,
      headers: { "User-Agent": VIRTUALS_UA, Accept: "application/json" },
      next: { revalidate: 300 },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as VirtualsApiResponse;
    const rows = data.data ?? [];
    if (rows.length === 0) return [];

    const out: VirtualAgent[] = [];
    for (const r of rows) {
      if (!r.name || !r.tokenAddress) continue;
      const mcapInVirtual = Number(r.mcapInVirtual) || 0;
      const mcapUsd =
        virtualPriceUsd > 0 ? mcapInVirtual * virtualPriceUsd : 0;
      const basescanUrl = `https://basescan.org/token/${r.tokenAddress}`;
      const virtualsUrl = `https://app.virtuals.io/virtuals/${r.id}`;
      out.push({
        id: r.id,
        name: r.name,
        symbol: (r.symbol ?? "").toUpperCase(),
        category: r.category ?? "—",
        chain: r.chain,
        status: r.status,
        imageUrl: r.image?.url ?? "",
        mcapInVirtual,
        mcapUsd,
        liquidityUsd: Number(r.liquidityUsd) || 0,
        volume24h: Number(r.volume24h) || 0,
        holderCount: Number(r.holderCount) || 0,
        holderChangePct24h: Number(r.holderCountPercent24h) || 0,
        priceChangePct24h: Number(r.priceChangePercent24h) || 0,
        tokenAddress: r.tokenAddress,
        basescanUrl,
        virtualsUrl,
        fetchedAt,
      });
    }
    return out;
  } catch {
    return [];
  }
}

export function formatVirtualMcap(usd: number, fallbackInVirtual: number): string {
  if (usd > 0) {
    if (usd >= 1_000_000_000) return `$${(usd / 1_000_000_000).toFixed(2)}B`;
    if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(1)}M`;
    if (usd >= 1_000) return `$${(usd / 1_000).toFixed(0)}K`;
    return `$${Math.round(usd)}`;
  }
  // No VIRTUAL price → show the raw mcapInVirtual with a "V" suffix so the
  // reader knows the unit. Honest fallback, not fabricated USD.
  if (fallbackInVirtual >= 1_000_000) return `${(fallbackInVirtual / 1_000_000).toFixed(1)}M V`;
  if (fallbackInVirtual >= 1_000) return `${(fallbackInVirtual / 1_000).toFixed(0)}K V`;
  return `${Math.round(fallbackInVirtual)} V`;
}

export function formatVirtualHolders(n: number): string {
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
