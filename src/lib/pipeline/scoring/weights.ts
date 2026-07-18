// StarScreener Pipeline — scoring weights configuration
//
// Tunable weights for the composite momentum score. Defaults sum to exactly
// 1.0. Category-specific overrides adjust a few component weights (e.g. AI
// categories lean harder on social buzz; devtools lean harder on commit +
// release freshness). After merging, the final weight map is always
// re-normalized so it sums to exactly 1.0.

import type { ScoreWeights } from "../types";

// ---------------------------------------------------------------------------
// Defaults — must sum to 1.0 exactly.
// ---------------------------------------------------------------------------

// 2026-07-09 rebalance: `crossSignal` (7-channel fusion — the product's
// differentiator) joins the composite at 0.10. Paid for by trimming
// starVelocity24h (.20→.18), starVelocity7d (.15→.14), contributorGrowth
// (.10→.09), commitFreshness (.12→.11), releaseFreshness (.08→.07),
// socialBuzz (.12→.09 — cross-signal subsumes much of what the
// twitter-baked buzz score measured), categoryMomentum (.05→.04).
export const DEFAULT_WEIGHTS: ScoreWeights = {
  starVelocity24h: 0.18,
  starVelocity7d: 0.14,
  forkVelocity7d: 0.08,
  contributorGrowth30d: 0.09,
  commitFreshness: 0.11,
  releaseFreshness: 0.07,
  socialBuzz: 0.09,
  issueActivity: 0.05,
  communityHealth: 0.05,
  categoryMomentum: 0.04,
  crossSignal: 0.1,
};

// ---------------------------------------------------------------------------
// Category-specific overrides.
// Only the fields that differ from DEFAULT_WEIGHTS need to be supplied.
// ---------------------------------------------------------------------------

export const CATEGORY_WEIGHT_OVERRIDES: Record<string, Partial<ScoreWeights>> = {
  // Hot / fast-moving AI spaces — social validation matters more, daily star
  // velocity a bit higher, commit freshness slightly less important.
  "ai-ml": {
    socialBuzz: 0.18,
    starVelocity24h: 0.15,
    commitFreshness: 0.07,
  },
  "ai-agents": {
    socialBuzz: 0.18,
    starVelocity24h: 0.15,
    commitFreshness: 0.07,
  },
  "local-llm": {
    socialBuzz: 0.18,
    starVelocity24h: 0.15,
    commitFreshness: 0.07,
  },

  // MCP (Model Context Protocol) — the ecosystem is tiny (50-500 stars
  // typical), discovery is X/Discord/Anthropic-blog driven, and forks are
  // the strongest adoption signal because "install an MCP" usually means
  // fork + configure. Under default weights, MCP repos flatline on velocity
  // components; this override boosts social + forks + contributor growth
  // and de-emphasizes 24h star spikes which are pure noise at that scale.
  // crossSignal is boosted too: at MCP scale, corroboration across Reddit/
  // HN/Bluesky is the strongest available breakout signal.
  mcp: {
    socialBuzz: 0.16,
    starVelocity24h: 0.10,
    forkVelocity7d: 0.13,
    contributorGrowth30d: 0.14,
    categoryMomentum: 0.08,
    crossSignal: 0.14,
  },

  // Developer tools — sustained maintenance and frequent releases signal
  // health more than social buzz does.
  devtools: {
    commitFreshness: 0.18,
    releaseFreshness: 0.12,
    socialBuzz: 0.06,
  },

  // Infrastructure / databases — community size and contributor growth are
  // strong trust signals. Social hype is de-emphasized.
  infra: {
    communityHealth: 0.1,
    contributorGrowth30d: 0.15,
    socialBuzz: 0.04,
  },
  databases: {
    communityHealth: 0.1,
    contributorGrowth30d: 0.15,
    socialBuzz: 0.04,
  },

  // Security — fresh patches / releases are paramount.
  security: {
    releaseFreshness: 0.15,
    commitFreshness: 0.15,
  },
};

// ---------------------------------------------------------------------------
// Merge + normalize helpers
// ---------------------------------------------------------------------------

/**
 * Sum every value in a ScoreWeights object.
 */
function sumWeights(w: ScoreWeights): number {
  return (
    w.starVelocity24h +
    w.starVelocity7d +
    w.forkVelocity7d +
    w.contributorGrowth30d +
    w.commitFreshness +
    w.releaseFreshness +
    w.socialBuzz +
    w.issueActivity +
    w.communityHealth +
    w.categoryMomentum +
    w.crossSignal
  );
}

/**
 * Divide every weight by `sum` so the resulting object sums to exactly 1.0.
 * If sum is 0 or non-finite, falls back to DEFAULT_WEIGHTS.
 */
function normalize(w: ScoreWeights): ScoreWeights {
  const total = sumWeights(w);
  if (!Number.isFinite(total) || total <= 0) {
    return { ...DEFAULT_WEIGHTS };
  }
  if (Math.abs(total - 1) < 1e-9) return w;
  return {
    starVelocity24h: w.starVelocity24h / total,
    starVelocity7d: w.starVelocity7d / total,
    forkVelocity7d: w.forkVelocity7d / total,
    contributorGrowth30d: w.contributorGrowth30d / total,
    commitFreshness: w.commitFreshness / total,
    releaseFreshness: w.releaseFreshness / total,
    socialBuzz: w.socialBuzz / total,
    issueActivity: w.issueActivity / total,
    communityHealth: w.communityHealth / total,
    categoryMomentum: w.categoryMomentum / total,
    crossSignal: w.crossSignal / total,
  };
}

/**
 * Resolve the weights for a given category.
 *
 * - If no category or no override registered → returns a copy of DEFAULT_WEIGHTS.
 * - Otherwise merges overrides onto defaults and re-normalizes to sum to 1.0.
 */
export function resolveWeights(categoryId?: string): ScoreWeights {
  if (!categoryId) return { ...DEFAULT_WEIGHTS };
  const override = CATEGORY_WEIGHT_OVERRIDES[categoryId];
  if (!override) return { ...DEFAULT_WEIGHTS };

  const merged: ScoreWeights = {
    ...DEFAULT_WEIGHTS,
    ...override,
  };
  return normalize(merged);
}

/**
 * Validate that a set of weights sums to (approximately) 1.0.
 * Tolerance: 0.001.
 */
export function validateWeights(w: ScoreWeights): boolean {
  const total = sumWeights(w);
  return Number.isFinite(total) && Math.abs(total - 1) <= 0.001;
}
