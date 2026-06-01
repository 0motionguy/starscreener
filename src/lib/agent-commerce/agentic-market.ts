// agentic.market — Coinbase-aligned x402 service registry.
//
// agentic.market is the public catalog of x402-enabled APIs that AI agents
// can call with pay-per-request USDC pricing. Their API is open (no auth)
// and lives at api.agentic.market/v1/services. At time of writing they
// catalog ~893 services across Inference / Data / Search / Media / Social /
// Trading / Infra / Storage / Travel, on Base + Solana + Polygon.
//
// We fetch the first batch (top 200 by registry order) and render:
//   - category breakdown counts
//   - network breakdown counts
//   - top services with logo (via Google favicon on `domain`), min price,
//     endpoint count, supported networks
//
// Server-side, 5-minute revalidate. Failure → empty state. No fabrication.

import { fetchWithTimeout } from "./fetch-timeout";

export interface X402Endpoint {
  url: string;
  method: string;
  description: string;
  pricing?: {
    amount: string;
    currency: string;
    network: string;
    scheme?: string;
    maxAmount?: string;
    minAmount?: string;
  };
}

export interface X402Service {
  id: string;
  name: string;
  description: string;
  domain: string;
  category: string;
  networks: string[];
  endpoints: X402Endpoint[];
  providerUrl: string;
  enriched: boolean;
  /** Min USDC price across all endpoints (excludes "—" / missing). */
  minPriceUsd: number;
  /** Max USDC price across all endpoints. */
  maxPriceUsd: number;
  /** Total endpoint count for this service. */
  endpointCount: number;
  /** Real favicon URL from Google's free service. */
  logoUrl: string;
}

export interface X402CategoryStat {
  category: string;
  count: number;
}

export interface X402NetworkStat {
  network: string;
  count: number;
}

export interface X402Market {
  services: X402Service[];
  totalServices: number;
  categories: X402CategoryStat[];
  networks: X402NetworkStat[];
  fetchedAt: string;
}

interface ApiPricing {
  amount?: string;
  currency?: string;
  network?: string;
  scheme?: string;
  maxAmount?: string;
  minAmount?: string;
}

interface ApiEndpoint {
  url?: string;
  method?: string;
  description?: string;
  pricing?: ApiPricing;
}

interface ApiService {
  id?: string;
  name?: string;
  description?: string;
  domain?: string;
  category?: string;
  networks?: string[];
  endpoints?: ApiEndpoint[];
  providerUrl?: string;
  enriched?: boolean;
}

interface ApiResponse {
  services?: ApiService[];
  total?: number;
  limit?: number;
  offset?: number;
}

const AGENTIC_UA =
  "Mozilla/5.0 (compatible; TrendingRepo/1.0; +https://trendingrepo.com)";
const AGENTIC_TIMEOUT_MS = 4_000;

/** Normalize CAIP-2 network strings ("eip155:8453") to chain display labels. */
function normalizeNetwork(net: string): string {
  const lower = (net || "").toLowerCase();
  if (lower === "base" || lower === "eip155:8453") return "Base";
  if (lower === "solana" || lower.startsWith("solana:")) return "Solana";
  if (lower === "polygon" || lower === "eip155:137") return "Polygon";
  if (lower.startsWith("eip155:1")) return "Ethereum";
  return net || "—";
}

function priceFromPricing(p: ApiPricing | undefined): number {
  if (!p) return NaN;
  const amount = Number.parseFloat(p.amount ?? "");
  // x402 prices are always denominated in stablecoin (USDC), so amount IS USD.
  // We don't multiply by anything — it's already USD.
  if (!Number.isFinite(amount) || amount <= 0) return NaN;
  return amount;
}

function summarizeService(api: ApiService): X402Service | null {
  if (!api.name) return null;
  const endpoints: X402Endpoint[] = (api.endpoints ?? [])
    .filter((e) => e.url)
    .map((e) => ({
      url: e.url ?? "",
      method: e.method ?? "GET",
      description: e.description ?? "",
      pricing: e.pricing
        ? {
            amount: e.pricing.amount ?? "",
            currency: e.pricing.currency ?? "USDC",
            network: normalizeNetwork(e.pricing.network ?? ""),
            scheme: e.pricing.scheme,
            maxAmount: e.pricing.maxAmount,
            minAmount: e.pricing.minAmount,
          }
        : undefined,
    }));
  const prices = endpoints
    .map((e) => priceFromPricing(e.pricing))
    .filter((n) => Number.isFinite(n) && n > 0);
  const minPriceUsd = prices.length > 0 ? Math.min(...prices) : 0;
  const maxPriceUsd = prices.length > 0 ? Math.max(...prices) : 0;
  const networksRaw = api.networks ?? [];
  const networks = Array.from(
    new Set(networksRaw.map(normalizeNetwork).filter((n) => n && n !== "—")),
  );
  const domain = (api.domain ?? "").trim();
  const logoUrl = domain
    ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`
    : "";

  return {
    id: api.id ?? api.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    name: api.name,
    description: api.description ?? "",
    domain,
    category: api.category || "Other",
    networks,
    endpoints,
    providerUrl: api.providerUrl ?? "",
    enriched: Boolean(api.enriched),
    minPriceUsd,
    maxPriceUsd,
    endpointCount: endpoints.length,
    logoUrl,
  };
}

/**
 * Fetch the x402 service registry from agentic.market. Default limit=200
 * (the API caps at ~250 per request). We don't paginate — for the panel
 * we only need top services, not the full 893-row index.
 */
export async function fetchX402Market(limit = 200): Promise<X402Market> {
  const fetchedAt = new Date().toISOString();
  const url = `https://api.agentic.market/v1/services?limit=${limit}&offset=0`;

  try {
    const res = await fetchWithTimeout(url, {
      timeoutMs: AGENTIC_TIMEOUT_MS,
      headers: { "User-Agent": AGENTIC_UA, Accept: "application/json" },
      next: { revalidate: 300 },
    });
    if (!res.ok) {
      return { services: [], totalServices: 0, categories: [], networks: [], fetchedAt };
    }
    const data = (await res.json()) as ApiResponse;
    const rawServices = data.services ?? [];
    const services: X402Service[] = [];
    const catCounts = new Map<string, number>();
    const netCounts = new Map<string, number>();

    for (const raw of rawServices) {
      const s = summarizeService(raw);
      if (!s) continue;
      services.push(s);
      const cat = s.category || "Other";
      catCounts.set(cat, (catCounts.get(cat) ?? 0) + 1);
      for (const n of s.networks) {
        netCounts.set(n, (netCounts.get(n) ?? 0) + 1);
      }
    }

    const categories: X402CategoryStat[] = Array.from(catCounts.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count);

    const networks: X402NetworkStat[] = Array.from(netCounts.entries())
      .map(([network, count]) => ({ network, count }))
      .sort((a, b) => b.count - a.count);

    return {
      services,
      totalServices: data.total ?? services.length,
      categories,
      networks,
      fetchedAt,
    };
  } catch {
    return { services: [], totalServices: 0, categories: [], networks: [], fetchedAt };
  }
}

export function formatUsdcPrice(usd: number): string {
  if (!Number.isFinite(usd) || usd <= 0) return "—";
  if (usd < 0.001) return `$${usd.toFixed(5)}`;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  if (usd < 100) return `$${usd.toFixed(2)}`;
  return `$${usd.toFixed(0)}`;
}
