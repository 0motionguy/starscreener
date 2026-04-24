// Pure query parser + matcher + sort/page helpers for /api/search.
//
// Split out from the route so the contract can be unit-tested without booting
// Next / the pipeline singletons. The route is responsible for:
//   1) calling `parseSearchQuery(url)` and short-circuiting on a 400
//   2) building a `MatchContext` (revenue + funding lookups) once per request
//   3) feeding `matchesQuery` + `sortAndPage` over the derived repo list
//
// Design notes:
//   - Every filter is optional. An absent param must not narrow the result
//     set — existing `?q=...` callers are the baseline and must keep working.
//   - Language + topic matching is case-insensitive, substring-free for
//     languages (exact match after lowercasing) and substring-based for
//     topics (so `topic=ai` matches `artificial-intelligence`).
//   - Repeatable params accept either `?language=ts&language=py` or
//     `?language=ts,py` (comma-delimited). Empty entries are dropped.
//   - Numeric params must be finite numbers. Bad coercions return a 400
//     with `invalid_param` + the offending key in the error body.
//   - Pagination caps: limit 1..200, offset 0..Infinity. Defaults 30 / 0.
//   - Unknown query params are IGNORED (not rejected) — the spec explicitly
//     calls out that `?foo=bar` should return 200, not 400.

import type { MovementStatus, Repo, RevenueTier } from "./types";

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

export type SearchSort = "momentum" | "stars" | "delta7d" | "delta24h";
export type SearchOrder = "asc" | "desc";

/** Subset of RevenueTier that the API exposes as a filter. */
export type SearchRevenueTier = "verified" | "self_reported";

/** Mapping from the public API tier name → the stored RevenueOverlay.tier. */
export function matchesOverlayTier(
  overlayTier: RevenueTier,
  filter: SearchRevenueTier,
): boolean {
  if (filter === "verified") {
    // "verified" in the public API narrows to the two tiers the UI renders
    // as verified numbers: the live TrustMRR match and a moderator-approved
    // TrustMRR claim pointer. "estimated" and "self_reported" are excluded.
    return overlayTier === "verified_trustmrr" || overlayTier === "trustmrr_claim";
  }
  return overlayTier === "self_reported";
}

export interface SearchQuery {
  q: string | null;
  languages: string[];
  movements: MovementStatus[];
  minStars: number | null;
  maxStars: number | null;
  minMomentum: number | null;
  maxMomentum: number | null;
  hasRevenue: boolean | null;
  revenueTier: SearchRevenueTier | null;
  hasFunding: boolean | null;
  hasTwitter: boolean | null;
  topics: string[];
  sort: SearchSort;
  order: SearchOrder;
  limit: number;
  offset: number;
}

export interface MatchContext {
  hasRevenue: (fullName: string) => boolean;
  getRevenueTier: (fullName: string) => RevenueTier | null;
  hasFunding: (fullName: string) => boolean;
}

export type ParseResult =
  | { ok: true; query: SearchQuery }
  | { ok: false; error: string; code: string; param?: string };

// ---------------------------------------------------------------------------
// Constants / enum guards
// ---------------------------------------------------------------------------

const MOVEMENT_VALUES: readonly MovementStatus[] = [
  "hot",
  "breakout",
  "quiet_killer",
  "rising",
  "stable",
  "cooling",
  "declining",
];

const SORT_VALUES: readonly SearchSort[] = [
  "momentum",
  "stars",
  "delta7d",
  "delta24h",
];

const ORDER_VALUES: readonly SearchOrder[] = ["asc", "desc"];

const REVENUE_TIER_VALUES: readonly SearchRevenueTier[] = [
  "verified",
  "self_reported",
];

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 200;
const MIN_LIMIT = 1;

// ---------------------------------------------------------------------------
// Parser helpers
// ---------------------------------------------------------------------------

function readRepeatable(params: URLSearchParams, key: string): string[] {
  const all = params.getAll(key);
  const out: string[] = [];
  for (const entry of all) {
    if (typeof entry !== "string") continue;
    // Allow comma-delimited too (e.g. `?language=ts,py`).
    for (const piece of entry.split(",")) {
      const trimmed = piece.trim();
      if (trimmed.length === 0) continue;
      out.push(trimmed);
    }
  }
  return out;
}

function parseBooleanParam(
  params: URLSearchParams,
  key: string,
): { ok: true; value: boolean | null } | { ok: false; code: string; param: string } {
  const raw = params.get(key);
  if (raw === null) return { ok: true, value: null };
  const normalized = raw.trim().toLowerCase();
  if (normalized === "") return { ok: true, value: null };
  if (normalized === "true" || normalized === "1") return { ok: true, value: true };
  if (normalized === "false" || normalized === "0") return { ok: true, value: false };
  return { ok: false, code: "invalid_param", param: key };
}

function parseFiniteNumber(
  params: URLSearchParams,
  key: string,
): { ok: true; value: number | null } | { ok: false; code: string; param: string } {
  const raw = params.get(key);
  if (raw === null) return { ok: true, value: null };
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: true, value: null };
  const value = Number(trimmed);
  if (!Number.isFinite(value)) {
    return { ok: false, code: "invalid_param", param: key };
  }
  return { ok: true, value };
}

function parseIntegerInRange(
  params: URLSearchParams,
  key: string,
  min: number,
  max: number,
  fallback: number,
): { ok: true; value: number } | { ok: false; code: string; param: string } {
  const raw = params.get(key);
  if (raw === null) return { ok: true, value: fallback };
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: true, value: fallback };
  const value = Number(trimmed);
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    return { ok: false, code: "invalid_param", param: key };
  }
  if (value < min || value > max) {
    return { ok: false, code: "invalid_param", param: key };
  }
  return { ok: true, value };
}

// ---------------------------------------------------------------------------
// Public parser
// ---------------------------------------------------------------------------

export function parseSearchQuery(url: URL): ParseResult {
  const params = url.searchParams;

  // q — empty string collapses to null so the "no-full-text" branch stays
  // distinct from a whitespace-only input.
  const rawQ = params.get("q");
  const q = rawQ === null ? null : rawQ.trim() === "" ? null : rawQ.trim();

  // language — case-insensitive, deduplicated after lowercasing.
  const rawLanguages = readRepeatable(params, "language");
  const languages = Array.from(
    new Set(rawLanguages.map((s) => s.toLowerCase())),
  );

  // movement — case-insensitive, rejected if any value is outside the enum.
  const rawMovements = readRepeatable(params, "movement");
  const movements: MovementStatus[] = [];
  for (const m of rawMovements) {
    const normalized = m.toLowerCase() as MovementStatus;
    if (!MOVEMENT_VALUES.includes(normalized)) {
      return {
        ok: false,
        code: "invalid_param",
        param: "movement",
        error: `Invalid movement: ${m}`,
      };
    }
    if (!movements.includes(normalized)) movements.push(normalized);
  }

  // Numeric ranges.
  const minStarsResult = parseFiniteNumber(params, "minStars");
  if (!minStarsResult.ok) {
    return { ...minStarsResult, error: `Invalid minStars` };
  }
  const maxStarsResult = parseFiniteNumber(params, "maxStars");
  if (!maxStarsResult.ok) {
    return { ...maxStarsResult, error: `Invalid maxStars` };
  }
  const minMomentumResult = parseFiniteNumber(params, "minMomentum");
  if (!minMomentumResult.ok) {
    return { ...minMomentumResult, error: `Invalid minMomentum` };
  }
  const maxMomentumResult = parseFiniteNumber(params, "maxMomentum");
  if (!maxMomentumResult.ok) {
    return { ...maxMomentumResult, error: `Invalid maxMomentum` };
  }

  // Booleans.
  const hasRevenueResult = parseBooleanParam(params, "hasRevenue");
  if (!hasRevenueResult.ok) {
    return { ...hasRevenueResult, error: `Invalid hasRevenue` };
  }
  const hasFundingResult = parseBooleanParam(params, "hasFunding");
  if (!hasFundingResult.ok) {
    return { ...hasFundingResult, error: `Invalid hasFunding` };
  }
  const hasTwitterResult = parseBooleanParam(params, "hasTwitter");
  if (!hasTwitterResult.ok) {
    return { ...hasTwitterResult, error: `Invalid hasTwitter` };
  }

  // revenueTier — enum, implies hasRevenue=true when set.
  const rawTier = params.get("revenueTier");
  let revenueTier: SearchRevenueTier | null = null;
  if (rawTier !== null && rawTier.trim() !== "") {
    const normalized = rawTier.trim().toLowerCase() as SearchRevenueTier;
    if (!REVENUE_TIER_VALUES.includes(normalized)) {
      return {
        ok: false,
        code: "invalid_param",
        param: "revenueTier",
        error: `Invalid revenueTier: ${rawTier}`,
      };
    }
    revenueTier = normalized;
  }

  // Effective hasRevenue: explicit value wins, otherwise implied by
  // revenueTier. When the caller sets hasRevenue=false AND revenueTier, we
  // prefer the stricter tier gate (tier implies `hasRevenue=true`), which is
  // probably a user mistake but matches the spec's "revenueTier implies
  // hasRevenue=true".
  const hasRevenue: boolean | null =
    revenueTier !== null ? true : hasRevenueResult.value;

  // Topics — case-insensitive substring match.
  const rawTopics = readRepeatable(params, "topic");
  const topics = Array.from(new Set(rawTopics.map((s) => s.toLowerCase())));

  // Sort / order.
  const rawSort = params.get("sort");
  let sort: SearchSort = "momentum";
  if (rawSort !== null && rawSort.trim() !== "") {
    const normalized = rawSort.trim().toLowerCase() as SearchSort;
    if (!SORT_VALUES.includes(normalized)) {
      return {
        ok: false,
        code: "invalid_param",
        param: "sort",
        error: `Invalid sort: ${rawSort}`,
      };
    }
    sort = normalized;
  }

  const rawOrder = params.get("order");
  let order: SearchOrder = "desc";
  if (rawOrder !== null && rawOrder.trim() !== "") {
    const normalized = rawOrder.trim().toLowerCase() as SearchOrder;
    if (!ORDER_VALUES.includes(normalized)) {
      return {
        ok: false,
        code: "invalid_param",
        param: "order",
        error: `Invalid order: ${rawOrder}`,
      };
    }
    order = normalized;
  }

  const limitResult = parseIntegerInRange(
    params,
    "limit",
    MIN_LIMIT,
    MAX_LIMIT,
    DEFAULT_LIMIT,
  );
  if (!limitResult.ok) {
    return { ...limitResult, error: `Invalid limit` };
  }

  const offsetResult = parseIntegerInRange(
    params,
    "offset",
    0,
    Number.MAX_SAFE_INTEGER,
    0,
  );
  if (!offsetResult.ok) {
    return { ...offsetResult, error: `Invalid offset` };
  }

  return {
    ok: true,
    query: {
      q,
      languages,
      movements,
      minStars: minStarsResult.value,
      maxStars: maxStarsResult.value,
      minMomentum: minMomentumResult.value,
      maxMomentum: maxMomentumResult.value,
      hasRevenue,
      revenueTier,
      hasFunding: hasFundingResult.value,
      hasTwitter: hasTwitterResult.value,
      topics,
      sort,
      order,
      limit: limitResult.value,
      offset: offsetResult.value,
    },
  };
}

// ---------------------------------------------------------------------------
// Matcher
// ---------------------------------------------------------------------------

function matchesFullText(repo: Repo, q: string): boolean {
  const needle = q.toLowerCase();
  if (repo.fullName.toLowerCase().includes(needle)) return true;
  if ((repo.description ?? "").toLowerCase().includes(needle)) return true;
  for (const topic of repo.topics ?? []) {
    if (topic.toLowerCase().includes(needle)) return true;
  }
  return false;
}

export function matchesQuery(
  repo: Repo,
  query: SearchQuery,
  ctx: MatchContext,
): boolean {
  // Full-text narrow.
  if (query.q !== null && !matchesFullText(repo, query.q)) return false;

  // Language — OR across provided values, case-insensitive exact match.
  if (query.languages.length > 0) {
    const lang = (repo.language ?? "").toLowerCase();
    if (!lang) return false;
    if (!query.languages.includes(lang)) return false;
  }

  // Movement — OR across provided values.
  if (query.movements.length > 0) {
    if (!query.movements.includes(repo.movementStatus)) return false;
  }

  // Stars range.
  if (query.minStars !== null && repo.stars < query.minStars) return false;
  if (query.maxStars !== null && repo.stars > query.maxStars) return false;

  // Momentum range.
  if (query.minMomentum !== null && repo.momentumScore < query.minMomentum) {
    return false;
  }
  if (query.maxMomentum !== null && repo.momentumScore > query.maxMomentum) {
    return false;
  }

  // Revenue presence + tier.
  if (query.hasRevenue === true) {
    if (!ctx.hasRevenue(repo.fullName)) return false;
  } else if (query.hasRevenue === false) {
    if (ctx.hasRevenue(repo.fullName)) return false;
  }
  if (query.revenueTier !== null) {
    const tier = ctx.getRevenueTier(repo.fullName);
    if (tier === null) return false;
    if (!matchesOverlayTier(tier, query.revenueTier)) return false;
  }

  // Funding presence.
  if (query.hasFunding === true) {
    if (!ctx.hasFunding(repo.fullName)) return false;
  } else if (query.hasFunding === false) {
    if (ctx.hasFunding(repo.fullName)) return false;
  }

  // Twitter panel presence — sourced off the repo itself, no ctx needed.
  if (query.hasTwitter === true) {
    if (!repo.twitter) return false;
  } else if (query.hasTwitter === false) {
    if (repo.twitter) return false;
  }

  // Topic — OR across provided values, each matched as a case-insensitive
  // substring against any repo.topic. Matches the spec's "substring match in
  // repo.topics".
  if (query.topics.length > 0) {
    const topics = (repo.topics ?? []).map((t) => t.toLowerCase());
    let anyHit = false;
    for (const needle of query.topics) {
      for (const t of topics) {
        if (t.includes(needle)) {
          anyHit = true;
          break;
        }
      }
      if (anyHit) break;
    }
    if (!anyHit) return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// Sort + page
// ---------------------------------------------------------------------------

function sortKey(repo: Repo, sort: SearchSort): number {
  switch (sort) {
    case "momentum":
      return repo.momentumScore ?? 0;
    case "stars":
      return repo.stars ?? 0;
    case "delta7d":
      return repo.starsDelta7d ?? 0;
    case "delta24h":
      return repo.starsDelta24h ?? 0;
  }
}

/** Sort + slice. Does not filter — callers must pre-filter via matchesQuery. */
export function sortAndPage(repos: Repo[], query: SearchQuery): Repo[] {
  const dir = query.order === "asc" ? 1 : -1;
  const sorted = [...repos].sort((a, b) => {
    const av = sortKey(a, query.sort);
    const bv = sortKey(b, query.sort);
    if (av === bv) {
      // Deterministic tiebreak on fullName so repeated calls return the same
      // order — otherwise paged traversal can duplicate/skip rows on ties.
      return a.fullName.localeCompare(b.fullName);
    }
    return (av - bv) * dir;
  });
  return sorted.slice(query.offset, query.offset + query.limit);
}
