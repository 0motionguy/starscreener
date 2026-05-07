// Funding extraction — regex-based parsing of funding headlines.
//
// Goal: pull structured signals from headlines like:
//   "Anthropic raises $450M in Series C funding"
//   "Mistral AI secures $640 million at $6 billion valuation"
//   "YC-backed startup Snorkel gets $35M Series B"
//
// Confidence levels:
//   high   — amount + round type + company all extracted cleanly
//   medium — amount + company, round type inferred or generic
//   low    — partial extraction (only amount or only company)
//   none   — nothing matched

import type {
  FundingExtraction,
  FundingRoundType,
  ExtractionConfidence,
  FundingSignal,
  FundingStats,
} from "./types";
import { enrichInvestors } from "./enrich-investors";

// ---------------------------------------------------------------------------
// Round-type keywords
// ---------------------------------------------------------------------------

const ROUND_PATTERNS: { type: FundingRoundType; patterns: RegExp[] }[] = [
  {
    type: "pre-seed",
    patterns: [/\bpre[-\s]?seed\b/i, /\bpreseed\b/i],
  },
  {
    type: "seed",
    patterns: [/\bseed\b/i],
  },
  {
    type: "series-a",
    patterns: [/\bseries\s*A\b/i],
  },
  {
    type: "series-b",
    patterns: [/\bseries\s*B\b/i],
  },
  {
    type: "series-c",
    patterns: [/\bseries\s*C\b/i],
  },
  {
    type: "series-d-plus",
    patterns: [/\bseries\s*[D-Z]\b/i, /\bseries\s*D\+?\b/i],
  },
  {
    type: "growth",
    patterns: [/\bgrowth\b/i, /\blate[-\s]?stage\b/i],
  },
  {
    type: "ipo",
    patterns: [/\bIPO\b/i, /\binitial public offering\b/i],
  },
  {
    type: "acquisition",
    patterns: [/\bacquired\b/i, /\bacquisition\b/i, /\bbuys\s+\b/i, /\bbought\b/i],
  },
];

// ---------------------------------------------------------------------------
// Amount extraction
// ---------------------------------------------------------------------------

const AMOUNT_PATTERN =
  /\$\s*([\d,.]+)\s*([KMBT]?)\b|\b([\d,.]+)\s*(million|billion|mn|m|bn|b)\s*(?:dollar)?s?\b/gi;

const MULTIPLIERS: Record<string, number> = {
  k: 1_000,
  m: 1_000_000,
  mn: 1_000_000,
  million: 1_000_000,
  b: 1_000_000_000,
  bn: 1_000_000_000,
  billion: 1_000_000_000,
  t: 1_000_000_000_000,
  trillion: 1_000_000_000_000,
};

function normalizeAmount(
  value: string,
  suffix: string,
): { amount: number; display: string } | null {
  const cleanValue = value.replace(/,/g, "");
  const numeric = Number.parseFloat(cleanValue);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;

  const key = suffix.toLowerCase().trim();
  const multiplier = MULTIPLIERS[key] ?? 1;
  const amount = numeric * multiplier;

  // Build display string
  let display: string;
  if (amount >= 1_000_000_000) {
    display = `$${(amount / 1_000_000_000).toFixed(amount % 1_000_000_000 === 0 ? 0 : 1)}B`;
  } else if (amount >= 1_000_000) {
    display = `$${(amount / 1_000_000).toFixed(amount % 1_000_000 === 0 ? 0 : 1)}M`;
  } else if (amount >= 1_000) {
    display = `$${(amount / 1_000).toFixed(0)}K`;
  } else {
    display = `$${amount.toLocaleString("en-US")}`;
  }

  return { amount, display };
}

export function extractAmount(text: string): {
  amount: number;
  display: string;
  raw: string;
} | null {
  const matches = Array.from(text.matchAll(AMOUNT_PATTERN));
  if (matches.length === 0) return null;

  // Find all valuation word positions
  const valuationMatches = Array.from(text.matchAll(/\bvaluation\b/gi));

  // First pass: identify all amounts and flag valuations
  const candidates: Array<{
    amount: number;
    display: string;
    raw: string;
    isValuation: boolean;
  }> = [];

  for (const match of matches) {
    const value = match[1] ?? match[3] ?? "";
    const suffix = match[2] ?? match[4] ?? "";
    const normalized = normalizeAmount(value, suffix);
    if (!normalized) continue;

    const matchEnd = (match.index ?? 0) + match[0].length;

    // Check if this amount is immediately followed by "valuation"
    let isValuation = false;
    for (const v of valuationMatches) {
      const dist = v.index - matchEnd;
      if (dist >= 0 && dist <= 5) {
        isValuation = true;
        break;
      }
    }

    // Fallback: old context-based heuristic for less clear cases
    if (!isValuation) {
      const context = text.slice(
        Math.max(0, (match.index ?? 0) - 40),
        (match.index ?? 0) + 40,
      );
      const hasValuationWord = /\bvaluation\b/i.test(context);
      const hasRaiseWord = /\braise|raising|funding|round|invest|closes|secured\b/i.test(context);
      isValuation = hasValuationWord && !hasRaiseWord;
    }

    candidates.push({
      ...normalized,
      raw: match[0],
      isValuation,
    });
  }

  if (candidates.length === 0) return null;

  // If there's a non-valuation amount, pick the largest non-valuation
  const nonValuations = candidates.filter((c) => !c.isValuation);
  if (nonValuations.length > 0) {
    return nonValuations.reduce((best, c) => (c.amount > best.amount ? c : best));
  }

  // All amounts are valuations — return the largest (best guess)
  return candidates.reduce((best, c) => (c.amount > best.amount ? c : best));
}

// ---------------------------------------------------------------------------
// Round type extraction
// ---------------------------------------------------------------------------

export function extractRoundType(text: string): FundingRoundType | null {
  for (const { type, patterns } of ROUND_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(text)) return type;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Company name extraction
// ---------------------------------------------------------------------------

const COMPANY_STOP_WORDS = new Set([
  "raises",
  "raised",
  "secures",
  "secured",
  "gets",
  "got",
  "lands",
  "closed",
  "closes",
  "announces",
  "announce",
  "funding",
  "round",
  "investment",
  "million",
  "billion",
  "startup",
  "company",
  "ai",
  "the",
  "and",
  "for",
  "from",
  "with",
  "in",
]);

export function extractCompanyName(headline: string): string | null {
  // Strip common prefixes that aren't company names
  let cleanHeadline = headline
    .replace(/^\s*(?:sources?[:\s]+|report[:\s]+|breaking[:\s]+)/i, "")
    .replace(/^\s*ex[-–]/i, "");

  // Strip trailing "in talks to" / "is in talks to" / "in discussions to"
  cleanHeadline = cleanHeadline.replace(/\s+in\s+(?:talks|discussions)\s+to\s+.*$/i, "");

  // Common patterns:
  // "CompanyName raises $X..."
  // "CompanyName secures $X..."
  // "...raise X for Company"
  const patterns = [
    /^([A-Z][A-Za-z0-9\s&\.]+?)\s+(?:raises?|secures?|gets?|lands?|closes?|closed)\b/i,
    /^([A-Z][A-Za-z0-9\s&\.]+?)\s+(?:announces?|announced)\b/i,
    /^([A-Z][A-Za-z0-9\s&\.]+?)\s+(?:has\s+raised)\b/i,
    /(?:raise[d-s]?\s+\$?[\d.,]+\s*(?:[KMB]|million|billion)?\s+(?:for|to\s+build)\s+)([A-Z][A-Za-z0-9\s&\.]+?)(?:\s+(?:to|for|with)|\s*$)/i,
  ];

  for (const pattern of patterns) {
    const match = cleanHeadline.match(pattern);
    if (match) {
      const candidate = match[1].trim();
      // Sanity check: not too short, not a stop word
      if (candidate.length >= 2 && !COMPANY_STOP_WORDS.has(candidate.toLowerCase())) {
        return candidate;
      }
    }
  }

  // Fallback: first 1-3 capitalized words, but skip stop words
  const words = cleanHeadline.match(/^([A-Z][a-zA-Z0-9]*(?:[-'][A-Za-z]+)*(?:\s+[A-Z][a-zA-Z0-9]*(?:[-'][A-Za-z]+)*){0,2})/);
  if (words) {
    const candidate = words[1].trim();
    if (candidate.length >= 2 && !COMPANY_STOP_WORDS.has(candidate.toLowerCase())) {
      return candidate;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Tag extraction
// ---------------------------------------------------------------------------

const TAG_KEYWORDS: { tag: string; keywords: string[] }[] = [
  { tag: "ai", keywords: ["ai", "artificial intelligence", "machine learning", "ml", "llm", "generative ai", "agent", "mcp"] },
  { tag: "fintech", keywords: ["fintech", "payments", "banking", "crypto", "blockchain", "defi", "web3"] },
  { tag: "healthcare", keywords: ["healthcare", "health", "biotech", "medical", "pharma", "drug"] },
  { tag: "climate", keywords: ["climate", "carbon", "clean energy", "sustainability", "green"] },
  { tag: "europe", keywords: ["european", "europe", "uk", "germany", "france", "netherlands", "sweden", "berlin", "london", "paris"] },
  { tag: "india", keywords: ["india", "indian", "bangalore", "mumbai", "delhi"] },
  { tag: "hardware", keywords: ["hardware", "robotics", "semiconductor", "chip", "iot", "drone"] },
  { tag: "saas", keywords: ["saas", "enterprise", "b2b", "developer tools", "devtools"] },
  { tag: "consumer", keywords: ["consumer", "social", "marketplace", "e-commerce", "retail"] },
  { tag: "defense", keywords: ["defense", "military", "aerospace", "space", "satellite"] },
];

export function extractTags(headline: string, description: string): string[] {
  const text = `${headline} ${description}`.toLowerCase();
  const tags: string[] = [];
  for (const { tag, keywords } of TAG_KEYWORDS) {
    for (const keyword of keywords) {
      if (text.includes(keyword.toLowerCase())) {
        tags.push(tag);
        break;
      }
    }
  }
  return tags;
}

// ---------------------------------------------------------------------------
// Investor extraction from text
// ---------------------------------------------------------------------------
//
// Pulls candidate investor names from headline + description using cue
// patterns ("led by X", "from Y", "backed by Z"). The matched names are then
// passed to enrichInvestors() which canonicalises against KNOWN_INVESTORS
// and tags each name with isKnown / confidence / logoUrl. Conservative on
// purpose — false positives here pollute the page, so anything ambiguous
// stays out of the raw list.

const INVESTOR_CUE_PATTERNS: RegExp[] = [
  /(?:led|co-led)\s+by\s+([A-Z][A-Za-z0-9&.\s'’-]+?)(?:,|;|\.|\band\b|\bwith\b|\bin\b|\bto\b|\bfor\b|\bat\b|$)/g,
  /(?:backed|funded|supported)\s+by\s+([A-Z][A-Za-z0-9&.\s'’-]+?)(?:,|;|\.|\band\b|\bwith\b|\bin\b|\bto\b|\bfor\b|\bat\b|$)/g,
  /investors?\s+(?:include|included|are|were)\s+([A-Z][A-Za-z0-9&.\s'’-]+?)(?:,|;|\.|\band\b|\bwith\b|$)/g,
  /(?:participated|joined)\s+(?:by|in)\s+([A-Z][A-Za-z0-9&.\s'’-]+?)(?:,|;|\.|\band\b|\bwith\b|$)/g,
  /(?:money|funding|investment)\s+from\s+([A-Z][A-Za-z0-9&.\s'’-]+?)(?:,|;|\.|\band\b|\bwith\b|$)/g,
  /\bfrom\s+([A-Z][A-Za-z0-9&.'’-]+(?:\s+[A-Z][A-Za-z0-9&.'’-]+){0,3})\b(?=\s+for|\s+to|\s+at|\s+as|\s*[.,;])/g,
];

const INVESTOR_TRAILING_NOISE = /\b(?:and|with|along|together|as|in|on|at|for|from|to|the)$/i;

const INVESTOR_NAME_STOP_WORDS = new Set([
  "the", "a", "an", "this", "that", "it", "company", "startup", "firm",
  "fund", "previous", "existing", "new", "several", "multiple", "various",
  "other", "investors", "backers", "funders", "including", "among", "such",
  "shareholders", "current", "former", "undisclosed", "yesterday", "today",
  "last", "year", "month", "week",
]);

function cleanInvestorCandidate(raw: string): string | null {
  let s = raw.replace(/\s+/g, " ").trim();
  // Strip trailing noise tokens iteratively (e.g. "Sequoia and").
  for (let i = 0; i < 3; i += 1) {
    const m = s.match(/\s+(\S+)$/);
    if (m && INVESTOR_TRAILING_NOISE.test(m[1])) {
      s = s.slice(0, s.length - m[1].length).trim();
    } else {
      break;
    }
  }
  if (s.length < 2) return null;
  if (INVESTOR_NAME_STOP_WORDS.has(s.toLowerCase())) return null;
  return s;
}

export function extractInvestorsFromText(text: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  for (const pattern of INVESTOR_CUE_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      const raw = match[1] ?? "";
      // Split on "," / "and" / "with" — multi-investor phrases.
      const parts = raw.split(/\s*(?:,|\band\b|\bwith\b)\s*/i);
      for (const part of parts) {
        const cleaned = cleanInvestorCandidate(part);
        if (!cleaned) continue;
        const key = cleaned.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        found.push(cleaned);
      }
    }
  }
  return found;
}

// ---------------------------------------------------------------------------
// Main extraction entry point
// ---------------------------------------------------------------------------

export function extractFundingFromHeadline(
  headline: string,
  description: string,
): FundingExtraction | null {
  const combined = `${headline} ${description}`;

  const companyName = extractCompanyName(headline);
  const amount = extractAmount(combined);
  const roundType = extractRoundType(combined);

  if (!companyName && !amount && !roundType) {
    return null;
  }

  // Determine confidence
  let confidence: ExtractionConfidence = "none";
  if (companyName && amount && roundType) {
    confidence = "high";
  } else if ((companyName && amount) || (companyName && roundType)) {
    confidence = "medium";
  } else if (companyName || amount) {
    confidence = "low";
  }

  const investors = extractInvestorsFromText(combined);
  const investorsEnriched = enrichInvestors(investors);

  return {
    companyName: companyName ?? "Unknown",
    companyWebsite: null,
    companyLogoUrl: null,
    amount: amount?.amount ?? null,
    amountDisplay: amount?.display ?? "Undisclosed",
    currency: "USD",
    roundType: roundType ?? "undisclosed",
    investors,
    investorsEnriched,
    confidence,
  };
}

// ---------------------------------------------------------------------------
// Stats builder
// ---------------------------------------------------------------------------

export function buildFundingStats(signals: FundingSignal[]): FundingStats {
  const now = Date.now();
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;

  let extractedCount = 0;
  let totalAmount = 0;
  let topRound: FundingSignal | null = null;
  let topAmount = 0;
  const sources: Record<string, number> = {};

  for (const signal of signals) {
    sources[signal.sourcePlatform] = (sources[signal.sourcePlatform] ?? 0) + 1;

    if (signal.extracted) {
      extractedCount++;
      if (signal.extracted.amount) {
        totalAmount += signal.extracted.amount;
        if (signal.extracted.amount > topAmount) {
          topAmount = signal.extracted.amount;
          topRound = signal;
        }
      }
    }
  }

  const thisWeekCount = signals.filter((s) => {
    const t = Date.parse(s.publishedAt);
    return Number.isFinite(t) && t >= weekAgo;
  }).length;

  return {
    totalSignals: signals.length,
    extractedSignals: extractedCount,
    totalAmountUsd: totalAmount > 0 ? totalAmount : null,
    topRound,
    thisWeekCount,
    sourcesBreakdown: sources,
  };
}
