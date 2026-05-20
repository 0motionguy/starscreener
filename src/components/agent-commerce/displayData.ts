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

const SEEDED_TOKENS: TokenMarketRow[] = [
  {
    id: "seed-fet",
    name: "Fetch.ai",
    symbol: "FET",
    category: "agent infra",
    priceUsd: 0.842,
    changePct: 12.4,
    volumeUsd: 84_000_000,
    marketCapUsd: 2_760_000_000,
  },
  {
    id: "seed-agix",
    name: "SingularityNET",
    symbol: "AGIX",
    category: "agent network",
    priceUsd: 0.413,
    changePct: 8.2,
    volumeUsd: 28_000_000,
    marketCapUsd: 1_430_000_000,
  },
  {
    id: "seed-ocean",
    name: "Ocean Protocol",
    symbol: "OCEAN",
    category: "data marketplace",
    priceUsd: 0.612,
    changePct: 5.1,
    volumeUsd: 19_000_000,
    marketCapUsd: 920_000_000,
  },
  {
    id: "seed-aero",
    name: "Aerodrome",
    symbol: "AERO",
    category: "Base DEX",
    priceUsd: 1.84,
    changePct: 4.8,
    volumeUsd: 42_000_000,
    marketCapUsd: 1_120_000_000,
  },
  {
    id: "seed-rndr",
    name: "Render Network",
    symbol: "RNDR",
    category: "GPU compute",
    priceUsd: 8.42,
    changePct: 3.9,
    volumeUsd: 68_000_000,
    marketCapUsd: 3_460_000_000,
  },
  {
    id: "seed-virtual",
    name: "Virtuals Protocol",
    symbol: "VIRTUAL",
    category: "AI agents",
    priceUsd: 2.18,
    changePct: -2.1,
    volumeUsd: 104_000_000,
    marketCapUsd: 2_180_000_000,
  },
  {
    id: "seed-tao",
    name: "Bittensor",
    symbol: "TAO",
    category: "subnet economy",
    priceUsd: 284,
    changePct: -1.8,
    volumeUsd: 148_000_000,
    marketCapUsd: 9_820_000_000,
  },
  {
    id: "seed-akt",
    name: "Akash Network",
    symbol: "AKT",
    category: "decentralized GPU",
    priceUsd: 1.94,
    changePct: -1.2,
    volumeUsd: 12_000_000,
    marketCapUsd: 520_000_000,
  },
];

const SEEDED_MOVERS: CompositeMoverRow[] = [
  {
    id: "seed-base-pay",
    name: "Base Pay (x402)",
    description: "base.org - USDC settlement on Base for AI agents",
    href: "https://www.base.org",
    glyph: "B",
    badges: ["x402", "portal"],
    score: 94.2,
    delta: 6.4,
  },
  {
    id: "seed-mcp-registry",
    name: "MCP Server Registry",
    description: "modelcontextprotocol.io - canonical MCP discovery",
    href: "https://modelcontextprotocol.io",
    glyph: "M",
    badges: ["mcp", "portal"],
    score: 91.8,
    delta: 3.1,
  },
  {
    id: "seed-fetch-uagents",
    name: "Fetch.ai uAgents",
    description: "fetch.ai - autonomous agent framework on Cosmos",
    href: "https://fetch.ai",
    glyph: "F",
    badges: ["a2a"],
    score: 88.4,
    delta: 2.8,
  },
  {
    id: "seed-anthropic-compute",
    name: "Anthropic Compute API",
    description: "anthropic.com - Claude tool-use plus MCP integration",
    href: "https://www.anthropic.com",
    glyph: "A",
    badges: ["mcp", "portal"],
    score: 87.2,
    delta: 1.4,
  },
  {
    id: "seed-virtuals",
    name: "Virtuals Protocol",
    description: "virtuals.io - co-owned AI agents on Base",
    href: "https://www.virtuals.io",
    glyph: "V",
    badges: ["x402", "a2a"],
    score: 82.6,
    delta: -0.8,
  },
  {
    id: "seed-stripe-agent-pay",
    name: "Stripe Agent Pay",
    description: "stripe.com - agent-initiated payments API",
    href: "https://stripe.com",
    glyph: "S",
    badges: ["x402", "portal"],
    score: 81.4,
    delta: 4.2,
  },
  {
    id: "seed-openai-apps",
    name: "OpenAI Apps",
    description: "platform.openai.com - GPT actions and tool calling",
    href: "https://platform.openai.com",
    glyph: "O",
    badges: ["portal"],
    score: 78.8,
    delta: 1.1,
  },
  {
    id: "seed-perplexity-api",
    name: "Perplexity API",
    description: "perplexity.ai - web search for agents",
    href: "https://www.perplexity.ai",
    glyph: "P",
    badges: ["portal"],
    score: 76.2,
    delta: 2.4,
  },
  {
    id: "seed-dune-mcp",
    name: "Dune Analytics MCP",
    description: "dune.com - query 100+ chains via MCP",
    href: "https://dune.com",
    glyph: "D",
    badges: ["mcp"],
    score: 74.8,
    delta: 1.8,
  },
  {
    id: "seed-coinbase-wallet",
    name: "Coinbase Wallet SDK",
    description: "developer.coinbase.com - agent-friendly wallets",
    href: "https://developer.coinbase.com",
    glyph: "C",
    badges: ["x402"],
    score: 72.4,
    delta: 0.9,
  },
];

export function tokenRowsFromItems(items: AgentCommerceItem[]): TokenMarketRow[] {
  return items
    .filter((item) => typeof item.live?.priceChange24hPct === "number")
    .map((item) => ({
      id: item.id,
      name: item.name,
      symbol: item.live?.tokenSymbol ?? item.name.slice(0, 5).toUpperCase(),
      category: item.category,
      priceUsd: item.live?.priceUsd ?? derivePrice(item),
      changePct: item.live?.priceChange24hPct ?? deriveTokenDelta(item),
      volumeUsd: item.live?.volume24hUsd ?? deriveVolume(item),
      marketCapUsd: item.live?.marketCapUsd ?? deriveMarketCap(item),
    }));
}

export function getTokenRows(
  items: AgentCommerceItem[],
  direction: "gainers" | "losers",
  limit: number,
): TokenMarketRow[] {
  const live = tokenRowsFromItems(items);
  const source = direction === "gainers" ? live.filter((r) => r.changePct > 0) : live.filter((r) => r.changePct < 0);
  const sorted = source.sort((a, b) =>
    direction === "gainers" ? b.changePct - a.changePct : a.changePct - b.changePct,
  );
  const seeded = SEEDED_TOKENS.filter((row) =>
    direction === "gainers" ? row.changePct > 0 : row.changePct < 0,
  );

  return fillRows(sorted, seeded, limit, (row) => row.symbol);
}

export function getCompositeMoverRows(
  items: AgentCommerceItem[],
  limit: number,
): CompositeMoverRow[] {
  const live = [...items]
    .sort((a, b) => b.scores.composite - a.scores.composite)
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

  return fillRows(live, SEEDED_MOVERS, limit, (row) => row.name.toLowerCase());
}

export function getScoreSample(items: AgentCommerceItem[], targetCount = 142): number[] {
  const live = items.map((item) => item.scores.composite);
  const seeded = SEEDED_MOVERS.map((row) => row.score);
  const sample = [...live, ...seeded];
  while (sample.length < targetCount) {
    const i = sample.length;
    const band = 28 + ((i * 17) % 58);
    const wave = ((i * 7) % 13) / 10;
    sample.push(Math.min(99, band + wave));
  }
  return sample.slice(0, targetCount);
}

export function seededTokenMarketCap(items: AgentCommerceItem[]): number {
  const liveCap = tokenRowsFromItems(items).reduce((sum, row) => sum + row.marketCapUsd, 0);
  if (liveCap > 0) return liveCap;
  return SEEDED_TOKENS.reduce((sum, row) => sum + row.marketCapUsd, 0);
}

function fillRows<T>(
  primary: T[],
  fallback: T[],
  limit: number,
  keyFor: (row: T) => string,
): T[] {
  const out: T[] = [];
  const seen = new Set<string>();
  for (const row of [...primary, ...fallback]) {
    const key = keyFor(row);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
    if (out.length === limit) break;
  }
  return out;
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

function deriveTokenDelta(item: AgentCommerceItem): number {
  return Number((((item.scores.composite - 50) / 8) + ((item.live?.socialTotal ?? 0) / 120)).toFixed(1));
}

function derivePrice(item: AgentCommerceItem): number {
  const base = Math.max(0.18, item.scores.composite / 41);
  return Number(base.toFixed(base >= 1 ? 2 : 3));
}

function deriveVolume(item: AgentCommerceItem): number {
  return Math.round((item.live?.socialTotal ?? item.scores.socialMentions ?? 10) * 420_000);
}

function deriveMarketCap(item: AgentCommerceItem): number {
  return Math.round((item.live?.stars ?? item.scores.composite * 100) * 85_000);
}
