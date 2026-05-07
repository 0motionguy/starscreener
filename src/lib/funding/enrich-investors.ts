// Enriches raw investor names parsed from RSS funding signals.
//
// Input: raw strings like "a16z", "Andreessen Horowitz", "Greylock Partners",
// "TypeOne Ventures" — what the regex extractor pulled out of a headline or
// article body.
//
// Output: normalized records of shape
//   { name: canonicalName, isKnown: true,  confidence: 'high', logoUrl }
//   { name: rawName,       isKnown: false, confidence: 'low' }
//
// Matching is case-insensitive + suffix-stripped (Capital / Ventures /
// Partners / LLC / Inc all collapse). Aliases are configured in
// known-investors.ts. Both extractors (worker + legacy) call this with the
// same input shape so the data downstream is identical.

import {
  KNOWN_INVESTORS,
  NORMALIZED_INDEX,
  buildInvestorLogoUrl,
  normalizeInvestorName,
  type KnownInvestor,
} from './known-investors';

export interface InvestorEnriched {
  name: string;
  isKnown: boolean;
  confidence: 'high' | 'medium' | 'low';
  logoUrl?: string;
}

function tokensOf(s: string): string[] {
  return s.split(/\s+/).filter((t) => t.length > 0);
}

function tokenSubsetMatch(haystackTokens: string[], needleTokens: string[]): boolean {
  // True iff every needle token appears as a whole-token in haystack OR
  // every haystack token appears as a whole-token in needle. Both
  // directions cover "Andreessen" vs "Andreessen Horowitz" and
  // "Andreessen Horowitz Capital" vs "Andreessen Horowitz" symmetrically,
  // while preventing partial substring matches like "vision" matching
  // "visionaries".
  if (haystackTokens.length === 0 || needleTokens.length === 0) return false;
  const haySet = new Set(haystackTokens);
  const needleSet = new Set(needleTokens);
  const needleInHay = needleTokens.every((t) => haySet.has(t));
  const hayInNeedle = haystackTokens.every((t) => needleSet.has(t));
  return needleInHay || hayInNeedle;
}

export function findKnownInvestor(rawName: string): KnownInvestor | null {
  const normalized = normalizeInvestorName(rawName);
  if (normalized.length === 0) return null;

  // Exact match first — fast-path for canonical / well-formed inputs.
  for (const entry of NORMALIZED_INDEX) {
    if (entry.key === normalized) return entry.investor;
  }

  // Token-subset match in either direction. Whole-token comparison
  // prevents accidents like "vision" (alias of SoftBank's "vision fund")
  // matching the unrelated word "visionaries". NORMALIZED_INDEX is sorted
  // longest-first so multi-word aliases beat their single-word prefixes.
  if (normalized.length < 3) return null;
  const nTokens = tokensOf(normalized);
  for (const entry of NORMALIZED_INDEX) {
    if (entry.key.length < 3) continue;
    const eTokens = tokensOf(entry.key);
    if (tokenSubsetMatch(nTokens, eTokens)) return entry.investor;
  }
  return null;
}

export function enrichInvestors(rawNames: readonly string[]): InvestorEnriched[] {
  const out: InvestorEnriched[] = [];
  const seen = new Set<string>(); // dedupe by canonical-or-raw name

  for (const raw of rawNames) {
    const trimmed = (raw ?? '').trim();
    if (!trimmed) continue;

    const known = findKnownInvestor(trimmed);
    if (known) {
      const dedupeKey = `known:${known.name.toLowerCase()}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      const logoUrl = buildInvestorLogoUrl(known);
      const enriched: InvestorEnriched = {
        name: known.name,
        isKnown: true,
        confidence: 'high',
      };
      if (logoUrl) enriched.logoUrl = logoUrl;
      out.push(enriched);
    } else {
      const dedupeKey = `raw:${trimmed.toLowerCase()}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      out.push({
        name: trimmed,
        isKnown: false,
        confidence: 'low',
      });
    }
  }

  return out;
}

// Re-export the database for callers that need it (e.g. the page-side card
// renderer that wants the logo for every known investor it shows).
export { KNOWN_INVESTORS, type KnownInvestor };
