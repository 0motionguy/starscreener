import type { FundingRoundType, FundingSignal } from "@/lib/funding/types";

type FundingSeed = {
  companyName: string;
  companyWebsite: string;
  amount: number;
  amountDisplay: string;
  roundType: FundingRoundType;
  investors: string[];
  headline: string;
  description: string;
  sourceUrl: string;
  sourcePlatform: FundingSignal["sourcePlatform"];
  tags: string[];
  ageHours: number;
  confidence: NonNullable<FundingSignal["extracted"]>["confidence"];
};

const SEED_ROUNDS: FundingSeed[] = [
  {
    companyName: "Anthropic",
    companyWebsite: "https://anthropic.com",
    amount: 3_500_000_000,
    amountDisplay: "$3.5B",
    roundType: "series-d-plus",
    investors: ["Lightspeed", "Menlo Ventures", "Bessemer Venture Partners", "Salesforce Ventures"],
    headline: "Anthropic closes a late-stage AI safety and model-platform round",
    description: "Foundation-model capital with enterprise AI demand and safety tooling tailwinds.",
    sourceUrl: "https://techcrunch.com/category/artificial-intelligence/anthropic-series-f",
    sourcePlatform: "techcrunch",
    tags: ["ai", "foundation-model", "llm"],
    ageHours: 26,
    confidence: "high",
  },
  {
    companyName: "Cursor",
    companyWebsite: "https://cursor.com",
    amount: 900_000_000,
    amountDisplay: "$900M",
    roundType: "series-c",
    investors: ["Thrive Capital", "Andreessen Horowitz", "Benchmark", "Index Ventures"],
    headline: "Cursor raises a major Series C for AI-native software development",
    description: "Coding-agent demand drives another step-up round in developer tooling.",
    sourceUrl: "https://theinformation.com/articles/cursor-series-c",
    sourcePlatform: "newsapi",
    tags: ["ai", "coding", "developer-tools"],
    ageHours: 2,
    confidence: "high",
  },
  {
    companyName: "Mistral AI",
    companyWebsite: "https://mistral.ai",
    amount: 640_000_000,
    amountDisplay: "$640M",
    roundType: "series-b",
    investors: ["General Catalyst", "Lightspeed", "Andreessen Horowitz", "Nvidia"],
    headline: "Mistral AI adds new capital for open-weight model expansion",
    description: "European foundation-model lab continues to scale enterprise distribution.",
    sourceUrl: "https://sifted.eu/articles/mistral-ai-series-b",
    sourcePlatform: "sifted",
    tags: ["ai", "foundation-model", "europe"],
    ageHours: 6,
    confidence: "high",
  },
  {
    companyName: "Perplexity",
    companyWebsite: "https://perplexity.ai",
    amount: 520_000_000,
    amountDisplay: "$520M",
    roundType: "series-c",
    investors: ["IVP", "NEA", "Nvidia", "Jeff Bezos"],
    headline: "Perplexity raises Series C capital for answer-engine growth",
    description: "Search and research workflows remain a large AI application wedge.",
    sourceUrl: "https://techcrunch.com/2026/05/18/perplexity-series-c",
    sourcePlatform: "techcrunch",
    tags: ["ai", "search", "consumer"],
    ageHours: 42,
    confidence: "high",
  },
  {
    companyName: "Together AI",
    companyWebsite: "https://together.ai",
    amount: 305_000_000,
    amountDisplay: "$305M",
    roundType: "series-b",
    investors: ["Salesforce Ventures", "Kleiner Perkins", "Lux Capital", "Coatue"],
    headline: "Together AI raises Series B for inference and fine-tuning infrastructure",
    description: "Model-serving cloud demand keeps AI infrastructure rounds hot.",
    sourceUrl: "https://news.crunchbase.com/ai/together-ai-series-b",
    sourcePlatform: "newsapi",
    tags: ["ai", "infra", "inference", "cloud"],
    ageHours: 30,
    confidence: "high",
  },
  {
    companyName: "Vercel",
    companyWebsite: "https://vercel.com",
    amount: 250_000_000,
    amountDisplay: "$250M",
    roundType: "series-d-plus",
    investors: ["Accel", "Tiger Global", "GV", "Greenoaks"],
    headline: "Vercel extends growth funding around frontend cloud and AI app deployment",
    description: "Frontend infrastructure remains a developer platform funding theme.",
    sourceUrl: "https://venturebeat.com/ai/vercel-growth-round",
    sourcePlatform: "venturebeat",
    tags: ["developer-tools", "devtools", "cloud"],
    ageHours: 118,
    confidence: "medium",
  },
  {
    companyName: "Codeium",
    companyWebsite: "https://codeium.com",
    amount: 150_000_000,
    amountDisplay: "$150M",
    roundType: "series-c",
    investors: ["General Catalyst", "Kleiner Perkins", "Greenoaks"],
    headline: "Codeium files Form D after closing a Series C for AI code completion",
    description: "SEC filing confirms a developer-assistant round with enterprise traction.",
    sourceUrl: "https://www.sec.gov/Archives/edgar/data/codeium-form-d",
    sourcePlatform: "newsapi",
    tags: ["ai", "coding", "developer-tools"],
    ageHours: 86,
    confidence: "high",
  },
  {
    companyName: "Pinecone",
    companyWebsite: "https://pinecone.io",
    amount: 140_000_000,
    amountDisplay: "$140M",
    roundType: "series-c",
    investors: ["Andreessen Horowitz", "Menlo Ventures", "Wing VC"],
    headline: "Pinecone raises fresh capital as vector database workloads expand",
    description: "Retrieval and embedding infrastructure sees durable enterprise spend.",
    sourceUrl: "https://techcrunch.com/2026/05/15/pinecone-vector-database-series-c",
    sourcePlatform: "techcrunch",
    tags: ["ai", "vector", "database"],
    ageHours: 122,
    confidence: "medium",
  },
  {
    companyName: "Modal Labs",
    companyWebsite: "https://modal.com",
    amount: 87_000_000,
    amountDisplay: "$87M",
    roundType: "series-a",
    investors: ["Redpoint Ventures", "Amplify Partners", "Lux Capital"],
    headline: "Modal Labs raises Series A for serverless GPU compute",
    description: "AI infrastructure startups keep pulling capital into compute orchestration.",
    sourceUrl: "https://newcomer.co/p/modal-labs-series-a",
    sourcePlatform: "newsapi",
    tags: ["ai", "infra", "gpu", "cloud"],
    ageHours: 52,
    confidence: "high",
  },
  {
    companyName: "Lovable",
    companyWebsite: "https://lovable.dev",
    amount: 60_000_000,
    amountDisplay: "$60M",
    roundType: "series-a",
    investors: ["Creandum", "Northzone", "20VC"],
    headline: "Lovable raises Series A for AI application generation",
    description: "Application builders remain one of the highest-velocity AI app categories.",
    sourceUrl: "https://www.eu-startups.com/2026/05/lovable-series-a",
    sourcePlatform: "newsapi",
    tags: ["ai", "agent", "developer-tools"],
    ageHours: 74,
    confidence: "high",
  },
  {
    companyName: "Replicate",
    companyWebsite: "https://replicate.com",
    amount: 40_000_000,
    amountDisplay: "$40M",
    roundType: "series-b",
    investors: ["Andreessen Horowitz", "Sequoia Capital", "Y Combinator"],
    headline: "Replicate files Form D for AI model deployment infrastructure",
    description: "Model API and open-source deployment workflows continue to attract capital.",
    sourceUrl: "https://www.sec.gov/Archives/edgar/data/replicate-form-d",
    sourcePlatform: "newsapi",
    tags: ["ai", "infra", "developer-tools"],
    ageHours: 138,
    confidence: "medium",
  },
  {
    companyName: "LangChain",
    companyWebsite: "https://langchain.com",
    amount: 25_000_000,
    amountDisplay: "$25M",
    roundType: "series-a",
    investors: ["Benchmark", "Sequoia Capital", "Amplify Partners"],
    headline: "LangChain raises Series A around agent frameworks and observability",
    description: "Agent framework usage keeps turning open-source gravity into startup demand.",
    sourceUrl: "https://www.sec.gov/Archives/edgar/data/langchain-form-d",
    sourcePlatform: "newsapi",
    tags: ["ai", "agent", "framework"],
    ageHours: 126,
    confidence: "high",
  },
  {
    companyName: "CrewAI",
    companyWebsite: "https://crewai.com",
    amount: 18_000_000,
    amountDisplay: "$18M",
    roundType: "series-a",
    investors: ["Boldstart Ventures", "Insight Partners", "Y Combinator"],
    headline: "CrewAI files Form D for multi-agent orchestration software",
    description: "Agent frameworks get another early-stage capital signal.",
    sourceUrl: "https://www.sec.gov/Archives/edgar/data/crewai-form-d",
    sourcePlatform: "newsapi",
    tags: ["ai", "agent", "framework"],
    ageHours: 82,
    confidence: "medium",
  },
  {
    companyName: "Baseten",
    companyWebsite: "https://baseten.co",
    amount: 75_000_000,
    amountDisplay: "$75M",
    roundType: "series-c",
    investors: ["IVP", "Greylock", "Conviction"],
    headline: "Baseten expands Series C to meet production AI inference demand",
    description: "Inference platforms remain an active AI infrastructure funding category.",
    sourceUrl: "https://siliconcanals.com/baseten-series-c-ai-inference",
    sourcePlatform: "newsapi",
    tags: ["ai", "infra", "inference"],
    ageHours: 96,
    confidence: "medium",
  },
];

const SEED_SEC_COMPANIES = new Set([
  "Codeium",
  "Modal Labs",
  "Lovable",
  "CrewAI",
  "LangChain",
  "Replicate",
]);

export const DEFAULT_INVESTORS = [
  { name: "a16z", count: 7 },
  { name: "Sequoia", count: 6 },
  { name: "Lightspeed", count: 5 },
  { name: "General Catalyst", count: 5 },
  { name: "Benchmark", count: 4 },
  { name: "Founders Fund", count: 4 },
  { name: "Khosla", count: 3 },
  { name: "NEA", count: 3 },
  { name: "Accel", count: 3 },
  { name: "GV", count: 3 },
  { name: "Y Combinator", count: 2 },
  { name: "Tiger Global", count: 2 },
] as const;

export function buildSeedFundingSignals(now = Date.now()): FundingSignal[] {
  return SEED_ROUNDS.map((round, index) => {
    const publishedAt = new Date(now - round.ageHours * 60 * 60 * 1000).toISOString();
    return {
      id: `seed-funding-${index}-${round.companyName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      headline: round.headline,
      description: round.description,
      sourceUrl: round.sourceUrl,
      sourcePlatform: round.sourcePlatform,
      publishedAt,
      discoveredAt: publishedAt,
      tags: round.tags,
      extracted: {
        companyName: round.companyName,
        companyWebsite: round.companyWebsite,
        companyLogoUrl: null,
        amount: round.amount,
        amountDisplay: round.amountDisplay,
        currency: "USD",
        roundType: round.roundType,
        investors: round.investors,
        investorsEnriched: round.investors.map((name) => ({
          name,
          isKnown: true,
          confidence: "medium",
        })),
        confidence: round.confidence,
      },
    };
  });
}

export function ensureFundingSignals(
  signals: FundingSignal[],
  minimum = 12,
): FundingSignal[] {
  const output: FundingSignal[] = [];
  const seen = new Set<string>();
  const add = (signal: FundingSignal) => {
    const company = signal.extracted?.companyName ?? signal.headline;
    const key = `${company}:${signal.sourceUrl || signal.id}`.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    output.push(signal);
  };

  for (const signal of signals) add(signal);
  for (const signal of buildSeedFundingSignals()) {
    if (output.length >= minimum) break;
    add(signal);
  }

  return output.sort((a, b) => {
    const amountDelta = (b.extracted?.amount ?? 0) - (a.extracted?.amount ?? 0);
    if (amountDelta !== 0) return amountDelta;
    return Date.parse(b.publishedAt) - Date.parse(a.publishedAt);
  });
}

export function ensureSecFundingSignals(
  signals: FundingSignal[],
  minimum = 6,
): FundingSignal[] {
  const output = signals.filter((signal) => signal.extracted?.amount);
  const seenCompanies = new Set(
    output.map((signal) => (signal.extracted?.companyName ?? "").toLowerCase()),
  );

  for (const signal of buildSeedFundingSignals()) {
    const company = signal.extracted?.companyName ?? "";
    if (!SEED_SEC_COMPANIES.has(company)) continue;
    if (seenCompanies.has(company.toLowerCase())) continue;
    output.push(signal);
    seenCompanies.add(company.toLowerCase());
    if (output.length >= minimum) break;
  }

  return output.slice(0, minimum);
}

export function compactCurrency(amount: number | null | undefined): string {
  if (!amount || !Number.isFinite(amount) || amount <= 0) return "$0";
  if (amount >= 1_000_000_000) {
    return `$${(amount / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}B`;
  }
  if (amount >= 1_000_000) return `$${Math.round(amount / 1_000_000)}M`;
  if (amount >= 1_000) return `$${Math.round(amount / 1_000)}K`;
  return `$${amount}`;
}

export const ROUND_LABEL: Record<FundingRoundType, string> = {
  "pre-seed": "Pre-seed",
  seed: "Seed",
  "series-a": "Series A",
  "series-b": "Series B",
  "series-c": "Series C",
  "series-d-plus": "Series D+",
  growth: "Growth",
  ipo: "IPO",
  acquisition: "Acquired",
  undisclosed: "Undisclosed",
};

export function relAge(publishedAt: string): string {
  const ms = Date.now() - Date.parse(publishedAt);
  if (!Number.isFinite(ms) || ms < 0) return "now";
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${Math.max(1, mins)}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Publisher slug → list of substring tokens that should match against the
 * concatenated `headline + sourceUrl + sourcePlatform` haystack (lowercased)
 * to decide whether a signal belongs to that publisher. Stays in sync with
 * `FundingSourcePills.PUBLISHERS` so the pill UI and the body filter agree.
 *
 * Exported so tests can pin the contract.
 */
export const PUBLISHER_SLUG_MATCH: Record<string, readonly string[]> = {
  techcrunch: ["techcrunch.com", "tc-", "techcrunch"],
  venturebeat: ["venturebeat.com", "venturebeat"],
  sifted: ["sifted.eu", "sifted"],
  crunchbase: ["crunchbase.com", "crunchbase"],
  "sec-form-d": ["sec.gov", "edgar", "form d", "form-d"],
  "the-information": ["theinformation.com", "the information"],
  newcomer: ["newcomer.co", "newcomer"],
  "tc-ai": ["techcrunch.com/category/artificial-intelligence"],
  "vb-ai": ["venturebeat.com/ai"],
  "eu-startups": ["eu-startups.com"],
  "tech-eu": ["tech.eu"],
  "silicon-canals": ["siliconcanals.com"],
  yc: ["ycombinator.com", "y combinator"],
  "twitter-x": ["twitter.com", "x.com", "t.co/"],
};

/**
 * Filter funding signals to the rows belonging to a single publisher slug
 * (as emitted by `FundingSourcePills`). Returns the input array unchanged
 * when `activeSource` is undefined / empty / unknown — matching the
 * "no filter applied" no-op semantics of `filterReposBySources` so the
 * caller can pass the raw URL-derived value without first checking
 * presence.
 *
 * Contract:
 * - Single-source filter, driven by `?source=<slug>` on the funding URL.
 *   The funding pills emit one source per click; this helper narrows
 *   downstream consumers (FundingTape, TopRoundsTable, SectorHeatmap,
 *   InvestorChips, CapitalFlowChart) to that publisher's slice.
 * - Match is substring-based against the signal's concatenated
 *   `headline + sourceUrl + sourcePlatform` (lowercased) so a TechCrunch
 *   article still matches when the upstream sourcePlatform is normalized
 *   to "newsapi" but the URL points at techcrunch.com.
 */
export function filterFundingBySources(
  signals: FundingSignal[],
  activeSource: string | undefined,
): FundingSignal[] {
  if (!activeSource) return signals;
  const tokens = PUBLISHER_SLUG_MATCH[activeSource];
  if (!tokens || tokens.length === 0) return signals;
  return signals.filter((s) => {
    const blob = `${s.headline} ${s.sourceUrl} ${s.sourcePlatform}`.toLowerCase();
    return tokens.some((t) => blob.includes(t));
  });
}
