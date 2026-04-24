// Funding → Repo matcher.
//
// Pure, side-effect-free. Given a funding signal and a list of repo candidates
// (derived from repo-metadata + derived-repos), resolves the best repo match
// by domain first, alias second, company_name third, fuzzy last.
//
// No new deps: package.json has no string-similarity lib, so we use a
// normalized-Levenshtein similarity here. TODO: upgrade to Jaro-Winkler once a
// shared impl lands (the 0.92 threshold in the spec targets JW; normalized
// Levenshtein is stricter, so we stay at >= 0.88 to keep recall reasonable).
//
// Used by src/lib/funding/repo-events.ts; tested implicitly by the per-repo
// loader smoke path.
//
// Contract:
//   matchFundingEventToRepo(event, candidates) -> best result, or null.

import type { FundingSignal } from "./types";

export interface RepoCandidate {
  /** "owner/name" — canonical GitHub identifier. */
  fullName: string;
  /** Repo homepage URL. Will be host-normalized before compare. */
  homepage?: string | null;
  /** Alternative names the project ships under (marketing vs repo name). */
  aliases?: string[];
  /** Owner-level domain — e.g. "anthropic.com" for `anthropics/*`. */
  ownerDomain?: string | null;
}

export type FundingMatchReason =
  | "domain"
  | "alias"
  | "company_name_exact"
  | "company_name_fuzzy";

export interface FundingMatchResult {
  repoFullName: string;
  /** 0..1 — higher = stronger. See matchFundingEventToRepo for the bands. */
  confidence: number;
  reason: FundingMatchReason;
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

/**
 * Extract the registrable host from a URL-ish string. Returns `null` when the
 * input is empty, malformed, or not a recognizable host.
 *
 * Rules:
 *   - strips scheme, path, query, fragment, port
 *   - strips leading `www.`
 *   - lowercases
 */
export function normalizeHost(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  let candidate = trimmed;
  // Strip scheme.
  candidate = candidate.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");
  // Strip path/query/fragment.
  candidate = candidate.split("/")[0];
  candidate = candidate.split("?")[0];
  candidate = candidate.split("#")[0];
  // Strip port.
  candidate = candidate.split(":")[0];
  // Lowercase.
  candidate = candidate.toLowerCase();
  // Strip leading www.
  if (candidate.startsWith("www.")) candidate = candidate.slice(4);

  if (!candidate.includes(".")) return null;
  // Reject obvious garbage (spaces, non-host chars).
  if (/[^a-z0-9.\-]/.test(candidate)) return null;
  return candidate;
}

/** Normalize a company / repo name for exact-match compare. */
export function normalizeName(input: string | null | undefined): string {
  if (!input) return "";
  return input
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

// ---------------------------------------------------------------------------
// String similarity — normalized Levenshtein.
// ---------------------------------------------------------------------------

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  // Two-row DP. a = rows, b = cols.
  const prev = new Array<number>(b.length + 1);
  const curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1, // deletion
        curr[j - 1] + 1, // insertion
        prev[j - 1] + cost, // substitution
      );
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }
  return prev[b.length];
}

/**
 * Normalized Levenshtein similarity in [0, 1]. 1 = identical, 0 = fully
 * different. TODO: swap for Jaro-Winkler — its 0.92 cut tolerates transposes
 * better (e.g. "groq" vs "grok"); here we compensate with a tighter 0.88
 * floor on the caller side.
 */
export function stringSimilarity(a: string, b: string): number {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na && !nb) return 1;
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const dist = levenshtein(na, nb);
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return 1;
  return 1 - dist / maxLen;
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

const FUZZY_THRESHOLD = 0.88; // Normalized-Levenshtein floor (see TODO above).

interface Scored {
  result: FundingMatchResult;
  /** Higher = better. Used to break ties deterministically. */
  score: number;
}

/**
 * Resolve the single best repo for a given funding signal.
 *
 * Priority (first hit wins — we return the strongest band we can find, then
 * within that band pick the highest similarity / shortest repo name):
 *   1. companyWebsite host === candidate.homepage host     conf 1.00  domain
 *   2. companyName (normalized) in candidate.aliases       conf 0.90  alias
 *   3. companyName matches candidate.owner OR .name        conf 0.85  company_name_exact
 *   4. companyName fuzzy-matches owner|name|alias >= 0.88  conf 0.60+ company_name_fuzzy
 *
 * Returns null when no band matches. The caller (repo-events.ts) applies the
 * confidence >= 0.6 gate and the announced_at sort.
 */
export function matchFundingEventToRepo(
  event: FundingSignal,
  candidates: RepoCandidate[],
): FundingMatchResult | null {
  const extracted = event.extracted;
  if (!extracted) return null;

  const companyName = extracted.companyName;
  const companyWebsite = extracted.companyWebsite;
  const eventHost = normalizeHost(companyWebsite);
  const normCompany = normalizeName(companyName);

  if (!normCompany && !eventHost) return null;

  // Band 1: exact domain match. Deterministic tie-break on fullName length
  // (shorter = less likely to be a monorepo sub-project).
  if (eventHost) {
    const domainHits: RepoCandidate[] = [];
    for (const cand of candidates) {
      const candHost = normalizeHost(cand.homepage);
      if (candHost && candHost === eventHost) {
        domainHits.push(cand);
        continue;
      }
      const ownerHost = normalizeHost(cand.ownerDomain);
      if (ownerHost && ownerHost === eventHost) {
        domainHits.push(cand);
      }
    }
    if (domainHits.length > 0) {
      const pick = domainHits.sort(
        (a, b) => a.fullName.length - b.fullName.length,
      )[0];
      return {
        repoFullName: pick.fullName,
        confidence: 1.0,
        reason: "domain",
      };
    }
  }

  if (!normCompany) return null;

  // Band 2: alias exact match.
  const aliasHits: RepoCandidate[] = [];
  for (const cand of candidates) {
    const aliases = cand.aliases ?? [];
    for (const alias of aliases) {
      if (normalizeName(alias) === normCompany) {
        aliasHits.push(cand);
        break;
      }
    }
  }
  if (aliasHits.length > 0) {
    const pick = aliasHits.sort(
      (a, b) => a.fullName.length - b.fullName.length,
    )[0];
    return {
      repoFullName: pick.fullName,
      confidence: 0.9,
      reason: "alias",
    };
  }

  // Band 3: company_name matches owner or repo name (exact after normalization).
  const exactHits: RepoCandidate[] = [];
  for (const cand of candidates) {
    const [owner, name] = cand.fullName.split("/");
    const ownerNorm = normalizeName(owner ?? "");
    const nameNorm = normalizeName(name ?? "");
    if (ownerNorm === normCompany || nameNorm === normCompany) {
      exactHits.push(cand);
    }
  }
  if (exactHits.length > 0) {
    const pick = exactHits.sort(
      (a, b) => a.fullName.length - b.fullName.length,
    )[0];
    return {
      repoFullName: pick.fullName,
      confidence: 0.85,
      reason: "company_name_exact",
    };
  }

  // Band 4: fuzzy match against owner, name, or any alias.
  let best: Scored | null = null;
  for (const cand of candidates) {
    const [owner, name] = cand.fullName.split("/");
    const pool: string[] = [owner ?? "", name ?? "", ...(cand.aliases ?? [])];
    let bestSimForCand = 0;
    for (const candidate of pool) {
      if (!candidate) continue;
      const sim = stringSimilarity(candidate, normCompany);
      if (sim > bestSimForCand) bestSimForCand = sim;
    }
    if (bestSimForCand < FUZZY_THRESHOLD) continue;
    // Map similarity [0.88..1.0] → confidence [0.6..0.8] (band ceiling).
    const confidence = 0.6 + (bestSimForCand - FUZZY_THRESHOLD) * (0.2 / 0.12);
    const scored: Scored = {
      result: {
        repoFullName: cand.fullName,
        confidence: Math.min(0.8, Math.max(0.6, confidence)),
        reason: "company_name_fuzzy",
      },
      score: bestSimForCand,
    };
    if (!best || scored.score > best.score) best = scored;
  }
  return best?.result ?? null;
}
