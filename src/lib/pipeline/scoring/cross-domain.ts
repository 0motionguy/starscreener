// TrendingRepo Pipeline — cross-domain momentum assembler.
//
// Takes the per-domain `ScoredItem[]` arrays (each with rawScore in 0..100)
// and produces a `DomainScore[]` per domain with the post-percentile
// `momentum` field populated. Chunk B is adding a proper bootstrap-aware
// `domainPercentileRank()` to normalize.ts; until then this delegates to
// per-element `percentileRank` so the unit tests still pass.

import type {
  DomainItem,
  DomainKey,
  DomainScore,
  ScoredItem,
} from "./domain/types";
import { percentileRank } from "./normalize";

const DEFAULT_BOOTSTRAP_N = 200;

// Local fallback. Once Chunk B lands `domainPercentileRank` in normalize.ts,
// import + use it instead. Signature kept identical.
function domainPercentileRankFallback(
  rawScores: number[],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _opts?: { bootstrapN?: number },
): number[] {
  return rawScores.map((v) => percentileRank(v, rawScores));
}

export interface CrossDomainOptions {
  bootstrapN?: number;
}

/**
 * Apply per-domain percentile ranking to each domain's raw scores. Output
 * preserves input order within each domain. `momentum` is in 0..100.
 */
export function computeCrossDomainMomentum(
  perDomain: Map<DomainKey, ScoredItem<DomainItem>[]>,
  opts: CrossDomainOptions = {},
): Map<DomainKey, DomainScore[]> {
  const bootstrapN = opts.bootstrapN ?? DEFAULT_BOOTSTRAP_N;
  const out = new Map<DomainKey, DomainScore[]>();

  for (const [domainKey, scoredItems] of perDomain.entries()) {
    if (scoredItems.length === 0) {
      out.set(domainKey, []);
      continue;
    }

    const rawScores = scoredItems.map((s) => s.rawScore);
    const momenta = domainPercentileRankFallback(rawScores, { bootstrapN });

    const domainScores: DomainScore[] = scoredItems.map((s, i) => ({
      item: s.item,
      rawComponents: s.rawComponents,
      weights: s.weights,
      rawScore: s.rawScore,
      momentum: momenta[i],
      primaryMetric: s.primaryMetric,
      explanation: s.explanation,
    }));

    out.set(domainKey, domainScores);
  }

  return out;
}
