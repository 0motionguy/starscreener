// Funding Radar — data types for startup/AI funding signals.
//
// Phase 1 (Signal Radar): headlines from RSS + social, with optional
// regex extraction for company, amount, round type.
// Phase 2 (Structured): full FundingRound records with investor lists.

export type FundingSourcePlatform =
  | "techcrunch"
  | "venturebeat"
  | "sifted"
  | "telegram"
  | "twitter"
  | "reddit"
  | "submit"
  | "yc"
  | "newsapi";

export type FundingRoundType =
  | "pre-seed"
  | "seed"
  | "series-a"
  | "series-b"
  | "series-c"
  | "series-d-plus"
  | "growth"
  | "ipo"
  | "acquisition"
  | "undisclosed";

export type ExtractionConfidence = "high" | "medium" | "low" | "none";

/** A raw funding signal — may or may not have structured extraction. */
export interface FundingSignal {
  id: string;
  headline: string;
  description: string;
  sourceUrl: string;
  sourcePlatform: FundingSourcePlatform;
  publishedAt: string; // ISO 8601
  discoveredAt: string; // ISO 8601
  /** Structured extraction from headline/body. Null when regex couldn't parse. */
  extracted: FundingExtraction | null;
  /** Tags derived from content (ai, fintech, europe, etc.) */
  tags: string[];
}

/** Structured fields extracted from a funding headline/article. */
export interface FundingExtraction {
  companyName: string;
  companyWebsite: string | null;
  companyLogoUrl: string | null; // Clearbit or generated
  amount: number | null; // normalized to USD numeric
  amountDisplay: string; // "$5M", "$12.5M", "Undisclosed"
  currency: string;
  roundType: FundingRoundType;
  investors: string[]; // investor names
  investorsEnriched: FundingInvestorRef[];
  confidence: ExtractionConfidence;
}

/** Lightweight investor reference extracted from articles. */
export interface FundingInvestorRef {
  name: string;
  isKnown: boolean;
  confidence: "high" | "medium" | "low";
}

/** Investor reference (Phase 2). */
export interface FundingInvestor {
  name: string;
  website: string | null;
  logoUrl: string | null;
  isLead: boolean;
}

/** Full structured funding round (Phase 2). */
export interface FundingRound {
  id: string;
  companyName: string;
  companyWebsite: string | null;
  companyLogoUrl: string | null;
  amount: number | null;
  amountDisplay: string;
  currency: string;
  roundType: FundingRoundType;
  investors: FundingInvestor[];
  description: string;
  tags: string[];
  sourceUrl: string;
  sourcePlatform: FundingSourcePlatform;
  announcedAt: string;
  discoveredAt: string;
  confidence: ExtractionConfidence;
  reviewed: boolean;
}

/** The JSON file produced by the scraper. */
export interface FundingNewsFile {
  fetchedAt: string;
  source: string;
  windowDays: number;
  signals: FundingSignal[];
}

/** Stats for the page header. */
export interface FundingStats {
  totalSignals: number;
  extractedSignals: number;
  totalAmountUsd: number | null;
  topRound: FundingSignal | null;
  thisWeekCount: number;
  sourcesBreakdown: Record<string, number>;
}
