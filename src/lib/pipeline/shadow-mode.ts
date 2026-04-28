// TrendingRepo Pipeline — shadow-mode comparison harness.
//
// Pure module. Computes rank-correlation statistics between two domain
// rankings (production vs shadow) so we can gate weight tuning before
// promoting changes. All math is deterministic and ties-aware.
//
// Used by:
//   - scripts/run-shadow-scoring.mjs (writes a daily report to Redis)
//   - src/app/admin/scoring-shadow/page.tsx (renders the report)
//
// Plan reference: §7 "Migration + shadow mode" of
// trendingrepo-trending-shimmying-bachman.md.

import type { DomainKey } from "./scoring/domain/types";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface RankComparison {
  prodRank: number;
  shadowRank: number;
  /** shadow - prod (negative = item moved up in shadow). */
  delta: number;
  id: string;
  title: string;
  prodMomentum: number;
  shadowMomentum: number;
}

export interface ShadowReportEntry {
  id: string;
  title: string;
  momentum: number;
  rank: number;
}

export interface ShadowReport {
  domainKey: DomainKey;
  prodTop50: ShadowReportEntry[];
  shadowTop50: ShadowReportEntry[];
  /** Spearman rank correlation, -1..1 (1 = identical order). */
  spearmanRho: number;
  /** Kendall's tau, -1..1. */
  kendallTau: number;
  /** Fraction of items in BOTH top-50s, 0..1. */
  setOverlapTop50: number;
  /** Count of items in shadow top-10 not present in prod top-10, 0..10. */
  top10Churn: number;
  /** Top 20 most-changed items (by abs(delta)) intersecting both rankings. */
  rankChanges: RankComparison[];
  generatedAt: string;
  cutoverGatePass: boolean;
  cutoverGateReason: string;
}

// ---------------------------------------------------------------------------
// Pure math: average ranks, Spearman, Kendall
// ---------------------------------------------------------------------------

/**
 * Convert raw values into ranks using the average-rank method for ties.
 * Highest value gets rank 1. NaN/undefined treated as -Infinity.
 */
function averageRanks(values: number[]): number[] {
  const n = values.length;
  if (n === 0) return [];
  const indexed = values.map((v, i) => ({
    v: Number.isFinite(v) ? v : -Infinity,
    i,
  }));
  // Sort descending so rank 1 = highest value.
  indexed.sort((a, b) => b.v - a.v);
  const ranks = new Array<number>(n);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && indexed[j + 1].v === indexed[i].v) j++;
    // Items from i..j are tied. Assign average rank.
    // Rank-positions are 1-based: i+1, i+2, ..., j+1. Average = (i+1 + j+1) / 2.
    const avg = (i + 1 + (j + 1)) / 2;
    for (let k = i; k <= j; k++) {
      ranks[indexed[k].i] = avg;
    }
    i = j + 1;
  }
  return ranks;
}

/**
 * Pearson correlation on two equal-length vectors. Returns 0 when either
 * series has zero variance (degenerate input).
 */
function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n === 0 || n !== ys.length) return 0;
  let meanX = 0;
  let meanY = 0;
  for (let i = 0; i < n; i++) {
    meanX += xs[i];
    meanY += ys[i];
  }
  meanX /= n;
  meanY /= n;
  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  if (denX === 0 || denY === 0) return 0;
  return num / Math.sqrt(denX * denY);
}

/**
 * Spearman rank correlation, ties-aware. Computes Pearson on rank-transformed
 * inputs (the corrected formula valid under ties), not the simplified
 * `1 - 6Σd²/(n(n²-1))` which only works for distinct ranks.
 *
 * Inputs: two parallel arrays of rank values for the same items. Order of
 * items must match between the two arrays (i.e. `prodRanks[i]` and
 * `shadowRanks[i]` describe the same item).
 *
 * Returns 0 for empty / single-element inputs.
 */
export function spearmanRho(
  prodRanks: number[],
  shadowRanks: number[],
): number {
  if (prodRanks.length < 2 || prodRanks.length !== shadowRanks.length) return 0;
  return pearson(prodRanks, shadowRanks);
}

/**
 * Kendall's tau-b (ties-aware). For each pair (i,j) classify as concordant,
 * discordant, or tied; tau = (C - D) / sqrt((P - Tx)(P - Ty)) with the
 * usual tie corrections.
 *
 * Inputs are the same shape as spearmanRho — two rank arrays where index i
 * refers to the same item.
 */
export function kendallTau(
  prodRanks: number[],
  shadowRanks: number[],
): number {
  const n = prodRanks.length;
  if (n < 2 || n !== shadowRanks.length) return 0;
  let concordant = 0;
  let discordant = 0;
  let tiedX = 0;
  let tiedY = 0;
  for (let i = 0; i < n - 1; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = prodRanks[i] - prodRanks[j];
      const dy = shadowRanks[i] - shadowRanks[j];
      if (dx === 0 && dy === 0) {
        tiedX++;
        tiedY++;
      } else if (dx === 0) {
        tiedX++;
      } else if (dy === 0) {
        tiedY++;
      } else if (Math.sign(dx) === Math.sign(dy)) {
        concordant++;
      } else {
        discordant++;
      }
    }
  }
  const totalPairs = (n * (n - 1)) / 2;
  const denX = totalPairs - tiedX;
  const denY = totalPairs - tiedY;
  if (denX <= 0 || denY <= 0) return 0;
  return (concordant - discordant) / Math.sqrt(denX * denY);
}

/**
 * Fraction (0..1) of items present in the top-N of BOTH input arrays. Both
 * arrays are assumed pre-sorted; the first N entries of each are compared.
 *
 * If N exceeds the shorter array length, uses that shorter length. Returns 0
 * when either input is empty.
 */
export function topNOverlap<T>(
  prodTop: T[],
  shadowTop: T[],
  key: (t: T) => string,
  n: number = 50,
): number {
  if (prodTop.length === 0 || shadowTop.length === 0) return 0;
  const limit = Math.min(n, prodTop.length, shadowTop.length);
  if (limit === 0) return 0;
  const prodSet = new Set<string>();
  for (let i = 0; i < limit; i++) prodSet.add(key(prodTop[i]));
  let overlap = 0;
  for (let i = 0; i < limit; i++) {
    if (prodSet.has(key(shadowTop[i]))) overlap++;
  }
  return overlap / limit;
}

// ---------------------------------------------------------------------------
// Report builder
// ---------------------------------------------------------------------------

interface RankingInput {
  id: string;
  title: string;
  momentum: number;
}

const TOP_50 = 50;
const TOP_10 = 10;
const RANK_CHANGES_LIMIT = 20;

/**
 * Build a full shadow vs production comparison report for one domain.
 *
 * Caller supplies both ranking arrays already sorted by momentum desc. We
 * intersect the two by `id` to compute Spearman / Kendall (those metrics
 * require paired observations); items unique to one side are still surfaced
 * in the top-50 view but excluded from the rank-correlation math.
 */
export function buildShadowReport(
  domainKey: DomainKey,
  prodRanking: RankingInput[],
  shadowRanking: RankingInput[],
): ShadowReport {
  const generatedAt = new Date().toISOString();

  const prodTop50: ShadowReportEntry[] = prodRanking.slice(0, TOP_50).map(
    (r, i) => ({ id: r.id, title: r.title, momentum: r.momentum, rank: i + 1 }),
  );
  const shadowTop50: ShadowReportEntry[] = shadowRanking.slice(0, TOP_50).map(
    (r, i) => ({ id: r.id, title: r.title, momentum: r.momentum, rank: i + 1 }),
  );

  // Intersection by id for paired statistics. Use full ranking arrays so the
  // correlation reflects the entire scored set, not just the top-50 slice.
  const prodIndex = new Map<string, { rank: number; momentum: number; title: string }>();
  prodRanking.forEach((r, i) => {
    prodIndex.set(r.id, { rank: i + 1, momentum: r.momentum, title: r.title });
  });
  const shadowIndex = new Map<string, { rank: number; momentum: number; title: string }>();
  shadowRanking.forEach((r, i) => {
    shadowIndex.set(r.id, { rank: i + 1, momentum: r.momentum, title: r.title });
  });

  const sharedIds: string[] = [];
  const prodRanksPaired: number[] = [];
  const shadowRanksPaired: number[] = [];
  for (const [id, prod] of prodIndex.entries()) {
    const shadow = shadowIndex.get(id);
    if (!shadow) continue;
    sharedIds.push(id);
    prodRanksPaired.push(prod.rank);
    shadowRanksPaired.push(shadow.rank);
  }

  // Re-rank within the paired subset using average ranks so ties are handled.
  const prodAvgRanks = averageRanks(prodRanksPaired.map((r) => -r));
  const shadowAvgRanks = averageRanks(shadowRanksPaired.map((r) => -r));
  // Negation: averageRanks gives rank 1 to the HIGHEST value; raw ranks are
  // 1 = best (smallest), so flipping sign aligns the convention.

  const rho = spearmanRho(prodAvgRanks, shadowAvgRanks);
  const tau = kendallTau(prodAvgRanks, shadowAvgRanks);

  const setOverlapTop50 = topNOverlap(prodTop50, shadowTop50, (e) => e.id, TOP_50);

  // top10Churn: items in shadow top-10 NOT in prod top-10.
  const prodTop10Ids = new Set(prodTop50.slice(0, TOP_10).map((e) => e.id));
  let top10Churn = 0;
  for (const e of shadowTop50.slice(0, TOP_10)) {
    if (!prodTop10Ids.has(e.id)) top10Churn++;
  }

  // rankChanges: most-changed paired items, sorted by absolute delta desc.
  const rankChanges: RankComparison[] = sharedIds
    .map((id) => {
      const prod = prodIndex.get(id)!;
      const shadow = shadowIndex.get(id)!;
      return {
        id,
        title: prod.title || shadow.title,
        prodRank: prod.rank,
        shadowRank: shadow.rank,
        delta: shadow.rank - prod.rank,
        prodMomentum: prod.momentum,
        shadowMomentum: shadow.momentum,
      };
    })
    .filter((c) => c.delta !== 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, RANK_CHANGES_LIMIT);

  const partial: ShadowReport = {
    domainKey,
    prodTop50,
    shadowTop50,
    spearmanRho: rho,
    kendallTau: tau,
    setOverlapTop50,
    top10Churn,
    rankChanges,
    generatedAt,
    cutoverGatePass: false,
    cutoverGateReason: "",
  };

  const gate = applyCutoverGate(partial);
  partial.cutoverGatePass = gate.pass;
  partial.cutoverGateReason = gate.reason;

  return partial;
}

// ---------------------------------------------------------------------------
// Cutover gate (plan §7)
// ---------------------------------------------------------------------------

/**
 * Skills/MCP rebuild domains have a production baseline to compare against.
 * HF/arXiv are greenfield — there is no separate v1 ranking, so the gate
 * evaluates trivially-pass (the harness still surfaces stability metrics
 * across sequential runs once we have multi-day history).
 */
const BASELINED_DOMAINS = new Set<DomainKey>(["skill", "mcp", "github-repo"]);

/** Spearman ρ minimum for skills/MCP cutover (plan §7). */
export const CUTOVER_SPEARMAN_MIN = 0.6;
/** Top-10 overlap minimum (count of shared items, out of 10). */
export const CUTOVER_TOP10_OVERLAP_MIN = 5;

export function applyCutoverGate(
  report: ShadowReport,
): { pass: boolean; reason: string } {
  if (!BASELINED_DOMAINS.has(report.domainKey)) {
    return {
      pass: true,
      reason: `domain "${report.domainKey}" is greenfield (no v1 baseline) — gate N/A`,
    };
  }

  // Empty rankings: nothing to gate on. Treat as pass with explanation so the
  // UI doesn't show a misleading red badge on a blank report.
  if (report.prodTop50.length === 0 || report.shadowTop50.length === 0) {
    return {
      pass: true,
      reason: "empty ranking — gate not evaluated",
    };
  }

  const top10Overlap = countTop10Overlap(report);

  if (report.spearmanRho < CUTOVER_SPEARMAN_MIN) {
    return {
      pass: false,
      reason: `Spearman ρ ${report.spearmanRho.toFixed(3)} < ${CUTOVER_SPEARMAN_MIN}`,
    };
  }
  if (top10Overlap < CUTOVER_TOP10_OVERLAP_MIN) {
    return {
      pass: false,
      reason: `top-10 overlap ${top10Overlap} < ${CUTOVER_TOP10_OVERLAP_MIN}`,
    };
  }
  return {
    pass: true,
    reason: `Spearman ρ ${report.spearmanRho.toFixed(3)} ≥ ${CUTOVER_SPEARMAN_MIN}, top-10 overlap ${top10Overlap}/10`,
  };
}

function countTop10Overlap(report: ShadowReport): number {
  const prodIds = new Set(report.prodTop50.slice(0, TOP_10).map((e) => e.id));
  let overlap = 0;
  for (const e of report.shadowTop50.slice(0, TOP_10)) {
    if (prodIds.has(e.id)) overlap++;
  }
  return overlap;
}
