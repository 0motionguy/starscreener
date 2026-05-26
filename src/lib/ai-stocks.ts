// AI stock data — pre-IPO snapshots + public-market quotes.
//
// Pre-IPO entries (OpenAI / Anthropic / xAI / Mistral / Perplexity / Cohere)
// are sourced from public press disclosures and round announcements. They
// are facts at the time of the cited round, not predictions — flagged with
// `valuationDate` + `source` so the staleness is honest.
//
// Public quotes are fetched server-side from Yahoo Finance's public quote
// endpoint (no auth, 60-second revalidate). The endpoint is undocumented
// but stable enough for production read-side. When it fails the fetcher
// returns [] and the panel renders an honest empty state — no fabricated
// prices.
//
// To upgrade to real-time streaming, build a /api/stocks/stream route
// that pushes via SSE/WebSocket and convert AIStocksPanel into a client
// component reading that stream — the shapes below stay stable.

export interface PreIPOEntry {
  /** Display name. */
  name: string;
  /** One-line product/positioning blurb. */
  blurb: string;
  /** Most-recent disclosed valuation in USD. */
  valuationUsd: number;
  /** Pre-formatted human label, e.g. "$157B". */
  valuationLabel: string;
  /** Date of the round / disclosure (ISO YYYY-MM-DD). */
  valuationDate: string;
  /** Press citation. */
  source: string;
  /** IPO posture as of last public disclosure. */
  ipoStatus: "pending" | "rumored" | "filed" | "no-plans";
  /** Expected IPO year if rumored / pending / filed. */
  ipoExpectedYear?: number;
  /** /brand/sources/<slug>.svg — falls back to letter mark when undefined. */
  logoSlug?: string;
}

/**
 * Real pre-IPO AI companies. Order: highest valuation first, then by
 * IPO-imminent signal.
 *
 * All valuations are public knowledge — anyone can verify via the cited
 * source. Update when fresh primary/secondary rounds close.
 */
export const AI_PRE_IPO: PreIPOEntry[] = [
  {
    name: "OpenAI",
    blurb: "ChatGPT · GPT-5 · Sora",
    valuationUsd: 500_000_000_000,
    valuationLabel: "$500B",
    valuationDate: "2025-10-02",
    source: "WSJ secondary tender",
    ipoStatus: "rumored",
    ipoExpectedYear: 2027,
    logoSlug: "openai",
  },
  {
    name: "Anthropic",
    blurb: "Claude · Constitutional AI",
    valuationUsd: 183_000_000_000,
    valuationLabel: "$183B",
    valuationDate: "2025-09-30",
    source: "Bloomberg Series F",
    ipoStatus: "rumored",
    ipoExpectedYear: 2027,
    logoSlug: "anthropic",
  },
  {
    name: "xAI",
    blurb: "Grok · Colossus cluster",
    valuationUsd: 200_000_000_000,
    valuationLabel: "$200B",
    valuationDate: "2025-11-15",
    source: "FT secondary",
    ipoStatus: "no-plans",
    logoSlug: undefined,
  },
  {
    name: "Perplexity",
    blurb: "Answer engine · Comet browser",
    valuationUsd: 18_000_000_000,
    valuationLabel: "$18B",
    valuationDate: "2025-12-01",
    source: "TechCrunch Series E",
    ipoStatus: "no-plans",
    logoSlug: undefined,
  },
  {
    name: "Mistral AI",
    blurb: "Open-weight LLMs · Le Chat",
    valuationUsd: 14_000_000_000,
    valuationLabel: "$14B",
    valuationDate: "2025-09-08",
    source: "Sifted Series C",
    ipoStatus: "no-plans",
    logoSlug: undefined,
  },
  {
    name: "Cohere",
    blurb: "Enterprise RAG · Command-R",
    valuationUsd: 6_800_000_000,
    valuationLabel: "$6.8B",
    valuationDate: "2025-08-22",
    source: "Reuters Series E",
    ipoStatus: "no-plans",
    logoSlug: undefined,
  },
];

export interface PublicStock {
  /** Exchange ticker. */
  ticker: string;
  /** Long company name (from quote response). */
  name: string;
  /** Latest regular-market price. */
  price: number;
  /** Dollar change vs. previous close. */
  change: number;
  /** Percent change vs. previous close. */
  changePct: number;
  /** Latest regular-market volume. */
  volume: number;
  /** 52-week range, both ends. */
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
  /** Currency code (USD, etc). */
  currency: string;
  /** Exchange name (NMS, NYQ, etc). */
  exchange: string;
  /** Why we're tracking it — short editorial blurb. */
  blurb: string;
  /** ISO timestamp the quote was fetched. */
  fetchedAt: string;
}

interface TrackedTicker {
  ticker: string;
  blurb: string;
}

/**
 * Curated AI-exposure public tickers. Ordered by AI relevance, not market cap.
 * Mid- and small-caps with high AI exposure (PLTR, SMCI, C3.ai) sit alongside
 * the megacaps so the panel reads as an AI portfolio, not just S&P megacaps.
 */
const AI_PUBLIC_TICKERS: TrackedTicker[] = [
  { ticker: "NVDA", blurb: "AI accelerators" },
  { ticker: "MSFT", blurb: "Azure · OpenAI partner" },
  { ticker: "GOOGL", blurb: "Gemini · DeepMind · TPU" },
  { ticker: "META", blurb: "Llama · Reality Labs" },
  { ticker: "AMZN", blurb: "AWS · Anthropic backer" },
  { ticker: "AAPL", blurb: "Apple Intelligence" },
  { ticker: "AMD", blurb: "Instinct GPUs · MI300" },
  { ticker: "AVGO", blurb: "Custom AI silicon" },
  { ticker: "TSM", blurb: "Foundry for everyone" },
  { ticker: "ARM", blurb: "AI-edge architecture" },
  { ticker: "PLTR", blurb: "Foundry · AIP" },
  { ticker: "ORCL", blurb: "OCI · OpenAI Stargate" },
  { ticker: "SMCI", blurb: "AI server racks" },
  { ticker: "CRM", blurb: "Agentforce" },
  { ticker: "SNOW", blurb: "Cortex AI data" },
  { ticker: "DDOG", blurb: "LLM observability" },
  { ticker: "NET", blurb: "Workers AI · inference" },
  { ticker: "AI", blurb: "C3.ai enterprise" },
];

interface YahooChartMeta {
  symbol: string;
  shortName?: string;
  longName?: string;
  regularMarketPrice?: number;
  chartPreviousClose?: number;
  previousClose?: number;
  regularMarketVolume?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  currency?: string;
  exchangeName?: string;
}

interface YahooChartResponse {
  chart?: {
    result?: Array<{ meta?: YahooChartMeta }>;
    error?: { code: string; description: string } | null;
  };
}

const YAHOO_UA =
  "Mozilla/5.0 (compatible; TrendingRepo/1.0; +https://trendingrepo.com)";

/** Per-symbol fetch. Yahoo's v7 quote endpoint now 401s, but the v8 chart
 *  endpoint stays open. Returns null on any failure — never invents data. */
async function fetchOneQuote(ticker: string): Promise<YahooChartMeta | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=5d`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": YAHOO_UA, Accept: "application/json" },
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as YahooChartResponse;
    return data.chart?.result?.[0]?.meta ?? null;
  } catch {
    return null;
  }
}

/**
 * Fetch live quotes for the curated AI ticker list, in parallel. Server-side
 * only. Failure mode is `[]` so the panel renders an honest empty state.
 *
 * Future websocket upgrade path: replace this call with a subscription to
 * `/api/stocks/stream` that pushes incremental updates over SSE. Component
 * shape stays the same — only the data source flips.
 */
export async function fetchPublicAiStocks(): Promise<PublicStock[]> {
  const fetchedAt = new Date().toISOString();
  const metas = await Promise.all(
    AI_PUBLIC_TICKERS.map((t) => fetchOneQuote(t.ticker)),
  );

  const out: PublicStock[] = [];
  AI_PUBLIC_TICKERS.forEach((tracked, i) => {
    const m = metas[i];
    if (!m || typeof m.regularMarketPrice !== "number" || m.regularMarketPrice <= 0) {
      return;
    }
    const prevClose = m.chartPreviousClose ?? m.previousClose ?? 0;
    const change = prevClose > 0 ? m.regularMarketPrice - prevClose : 0;
    const changePct = prevClose > 0 ? (change / prevClose) * 100 : 0;
    out.push({
      ticker: tracked.ticker,
      name: m.longName ?? m.shortName ?? tracked.ticker,
      price: m.regularMarketPrice,
      change,
      changePct,
      volume: m.regularMarketVolume ?? 0,
      fiftyTwoWeekHigh: m.fiftyTwoWeekHigh ?? 0,
      fiftyTwoWeekLow: m.fiftyTwoWeekLow ?? 0,
      currency: m.currency ?? "USD",
      exchange: m.exchangeName ?? "",
      blurb: tracked.blurb,
      fetchedAt,
    });
  });
  return out;
}

export function formatMarketCap(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "—";
  if (value >= 1_000_000_000_000) return `$${(value / 1_000_000_000_000).toFixed(2)}T`;
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  return `$${Math.round(value).toLocaleString()}`;
}

export function formatPrice(value: number, currency: string): string {
  if (!Number.isFinite(value)) return "—";
  const prefix = currency === "USD" ? "$" : "";
  return `${prefix}${value.toFixed(2)}`;
}

export function formatChangePct(pct: number): string {
  if (!Number.isFinite(pct)) return "—";
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}
