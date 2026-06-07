import type { FundingRoundType, FundingSignal } from "@/lib/funding/types";

// 2026-05-23: SEED_ROUNDS (Anthropic $3.5B / Cursor $900M / Mistral $640M /
// Perplexity $520M / Together AI $305M / Vercel $250M / Codeium $150M /
// Pinecone $140M / Modal $87M / Lovable $60M / Replicate $40M / LangChain
// $25M / CrewAI $18M / Baseten $75M) and the associated SEED_SEC_COMPANIES
// set + buildSeedFundingSignals() factory were removed. The funding page
// reads live RSS (TechCrunch / VentureBeat / Sifted) + committed
// funding-news.json only — no fabricated rounds.
//
// Real-data-only signal preparer. The `minimum` parameter is preserved
// for API compatibility but no longer triggers SEED_ROUNDS padding —
// previous behavior fabricated Anthropic $3.5B / Cursor $900M / Mistral
// $640M etc. when the live spine was thin. Honesty contract: empty real
// data renders as fewer rows, not as invented rows.
export function ensureFundingSignals(
  signals: FundingSignal[],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept for caller compat
  _minimum = 12,
): FundingSignal[] {
  const output: FundingSignal[] = [];
  const seen = new Set<string>();
  for (const signal of signals) {
    const company = signal.extracted?.companyName ?? signal.headline;
    const key = `${company}:${signal.sourceUrl || signal.id}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(signal);
  }
  return output.sort((a, b) => {
    const amountDelta = (b.extracted?.amount ?? 0) - (a.extracted?.amount ?? 0);
    if (amountDelta !== 0) return amountDelta;
    return Date.parse(b.publishedAt) - Date.parse(a.publishedAt);
  });
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
 * to decide whether a signal belongs to that publisher.
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
 * Filter funding signals to the rows belonging to a single publisher slug.
 * Returns the input array unchanged
 * when `activeSource` is undefined / empty / unknown — matching the
 * "no filter applied" no-op semantics of `filterReposBySources` so the
 * caller can pass the raw URL-derived value without first checking
 * presence.
 *
 * Contract:
 * - Single-source filter, driven by `?source=<slug>` on the funding URL.
 *   This helper narrows downstream consumers (FundingTape, TopRoundsTable,
 *   SectorHeatmap, CapitalFlowChart) to that publisher's slice.
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
