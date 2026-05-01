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

// ---------------------------------------------------------------------------
// V4 — structured funding event shape
// ---------------------------------------------------------------------------
//
// The V4 funding vertical (W4) consumes a clean, normalized event record
// rather than raw signals. Producers (PitchBook / Tracxn ingestion in
// phase 2.1, or a future internal extractor) write `FundingEvent[]` to
// the data-store under the `funding-events` key; the aggregate ETL in
// `src/lib/funding/aggregate.ts` reads from there.
//
// Distinct from `FundingRound` above — that's the legacy phase-2 shape
// that mixes display fields (logoUrl, amountDisplay) with structural
// fields. `FundingEvent` is structural-only; the UI derives display
// strings from `amountUsd` etc. at render time.

/**
 * V4 round taxonomy — independent of the legacy `FundingRoundType`.
 *
 * Named `FundingEventRound` (not `FundingRound`) because the latter is
 * already taken by the legacy phase-2 record interface above. The two
 * shapes are unrelated; new code should prefer the V4 shape.
 */
export type FundingEventRound =
  | "pre-seed"
  | "seed"
  | "series-a"
  | "series-b"
  | "series-c"
  | "series-d+"
  | "bridge"
  | "acquisition"
  | "ipo";

/**
 * How confident the producer is that this event is correctly attributed
 * to the named company / repo:
 *   - exact-domain: companyWebsite host matched a tracked repo's homepage
 *   - exact-name:   companyName matched the repo owner or repo name
 *   - alias:        companyName matched a curated alias (funding-aliases)
 *   - fuzzy:        normalized similarity above the matcher threshold
 */
export type FundingEventConfidence =
  | "exact-domain"
  | "exact-name"
  | "alias"
  | "fuzzy";

/** A normalized funding event — the V4 record shape. */
export interface FundingEvent {
  /** Stable producer-assigned id (used for dedupe). */
  id: string;
  companyName: string;
  /** Slugified company name — UI uses this for `/funding/<slug>` links. */
  companySlug?: string;
  /** owner/name when the event is attributed to a tracked GitHub repo. */
  repoFullName?: string;
  roundType: FundingEventRound;
  /** Round size in USD. Null for undisclosed rounds. */
  amountUsd?: number;
  /** ISO 8601 timestamp the round was announced / closed. */
  closedAt: string;
  /** Investor names — order = press-release order; first slot is usually the lead. */
  investors: string[];
  sourceUrl: string;
  sourceName: string;
  confidence: FundingEventConfidence;
  /** Optional sector tag (ai, fintech, climate, ...) — used by sector aggregates. */
  sector?: string;
}

/** Data-store payload shape for the `funding-events` key. */
export interface FundingEventsFile {
  fetchedAt: string;
  source: string;
  events: FundingEvent[];
}
