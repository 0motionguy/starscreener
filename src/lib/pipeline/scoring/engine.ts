// StarScreener Pipeline — composite scoring engine.
//
// Ties weights + components + modifiers together into a full RepoScore.
// Also provides convenience functions for scoring a single Repo or a full
// batch (which requires computing per-category averages first).

import type { MovementStatus, Repo } from "../../types";
import type {
  RepoScore,
  ScoreComponents,
  ScoreModifiers,
  ScoreWeights,
} from "../types";
import { clamp } from "../../utils";
import {
  componentCommunityHealth,
  computeAllComponents,
  type ScoringInput,
} from "./components";
import {
  computeAllModifiers,
  detectBreakout,
  detectQuietKiller,
  type ModifierInput,
} from "./modifiers";
import { freshnessScore } from "./normalize";
import { resolveWeights } from "./weights";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const COMPONENT_KEYS: (keyof ScoreComponents)[] = [
  "starVelocity24h",
  "starVelocity7d",
  "forkVelocity7d",
  "contributorGrowth30d",
  "commitFreshness",
  "releaseFreshness",
  "socialBuzz",
  "issueActivity",
  "communityHealth",
  "categoryMomentum",
];

const COMPONENT_LABELS: Record<keyof ScoreComponents, string> = {
  starVelocity24h: "24h star velocity",
  starVelocity7d: "7d star velocity",
  forkVelocity7d: "7d fork velocity",
  contributorGrowth30d: "contributor growth",
  commitFreshness: "commit freshness",
  releaseFreshness: "release freshness",
  socialBuzz: "social buzz",
  issueActivity: "issue activity",
  communityHealth: "community health",
  categoryMomentum: "category momentum",
};

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function weightedSum(
  components: ScoreComponents,
  weights: ScoreWeights,
): number {
  let total = 0;
  for (const key of COMPONENT_KEYS) {
    total += components[key] * weights[key];
  }
  return total;
}

/**
 * Pick the 2-3 strongest weighted contributors to the overall score and
 * build a short, human-readable sentence. Includes notes about any active
 * modifiers (breakout, quiet killer, stale decay, spam dampening).
 */
function buildExplanation(
  overall: number,
  components: ScoreComponents,
  weights: ScoreWeights,
  modifiers: ScoreModifiers,
  input: ScoringInput,
): string {
  // Rank components by their weighted contribution.
  const contributions = COMPONENT_KEYS.map((key) => ({
    key,
    value: components[key] * weights[key],
    raw: components[key],
  })).sort((a, b) => b.value - a.value);

  const topN = contributions.slice(0, 3).filter((c) => c.raw > 0);

  const topPhrases: string[] = [];
  for (const c of topN.slice(0, 2)) {
    const label = COMPONENT_LABELS[c.key];

    // Attach a concrete datum where possible.
    let datum = "";
    if (c.key === "starVelocity24h" && input.starsDelta24h > 0) {
      datum = ` (+${input.starsDelta24h} stars)`;
    } else if (c.key === "starVelocity7d" && input.starsDelta7d > 0) {
      datum = ` (+${input.starsDelta7d} stars/7d)`;
    } else if (c.key === "forkVelocity7d" && input.forksDelta7d > 0) {
      datum = ` (+${input.forksDelta7d} forks/7d)`;
    } else if (c.key === "contributorGrowth30d" && input.contributorsDelta30d > 0) {
      datum = ` (+${input.contributorsDelta30d} contribs/30d)`;
    } else if (c.key === "socialBuzz") {
      datum = ` (${Math.round(input.socialBuzzScore)}/100)`;
    }

    topPhrases.push(`${label}${datum}`);
  }

  const parts: string[] = [];
  parts.push(`Composite ${overall.toFixed(1)}`);
  if (topPhrases.length > 0) {
    parts.push(`from ${topPhrases.join(" and ")}`);
  }

  // Modifier notes — only mention the ones that actually moved the needle.
  const mods: string[] = [];
  if (modifiers.breakoutMultiplier > 1.0) {
    mods.push(`breakout boost x${modifiers.breakoutMultiplier.toFixed(2)}`);
  }
  if (modifiers.quietKillerBonus > 0) {
    mods.push(`quiet-killer +${modifiers.quietKillerBonus.toFixed(1)}`);
  }
  if (modifiers.decayFactor < 0.8) {
    mods.push(`stale-commit decay x${modifiers.decayFactor.toFixed(2)}`);
  }
  if (modifiers.antiSpamDampening < 1.0) {
    mods.push(`spam dampening x${modifiers.antiSpamDampening.toFixed(2)}`);
  }

  let sentence = parts.join(" ");
  if (mods.length > 0) {
    sentence += `; ${mods.join(", ")} applied`;
  }
  return `${sentence}.`;
}

// ---------------------------------------------------------------------------
// Movement status classification
// ---------------------------------------------------------------------------

/**
 * Classify movement status based on the overall score, the modifiers, and
 * the raw scoring input.
 *
 * Priority: breakout > quiet_killer > hot > rising > cooling > declining > stable.
 *
 * If `previousStatus` is provided and represents a curated strong signal
 * ("hot", "breakout", "rising"), we give it inertia so a single-pass
 * recompute on synthesized delta data (before real ingestion accumulates
 * history) doesn't wipe the curated distribution.
 */
export function classifyMovement(
  overall: number,
  modifiers: ScoreModifiers,
  input: ScoringInput,
  previousStatus?: MovementStatus,
): MovementStatus {
  if (modifiers.breakoutMultiplier > 1.0) return "breakout";
  if (modifiers.quietKillerBonus > 0) return "quiet_killer";

  // Liberalized thresholds — matches realistic mock + real data ranges.
  if (overall >= 55 && input.starsDelta24h > 25) return "hot";
  if (overall >= 35 && input.starsDelta7d > 50) return "rising";

  // Preserve curated strong signals when scoring is borderline.
  if (previousStatus === "hot" && overall >= 40 && input.starsDelta24h > 10) {
    return "hot";
  }
  if (
    previousStatus === "breakout" &&
    overall >= 30 &&
    input.starsDelta7d > 0
  ) {
    return "breakout";
  }
  if (previousStatus === "rising" && overall >= 30 && input.starsDelta7d > 0) {
    return "rising";
  }
  if (
    previousStatus === "quiet_killer" &&
    overall >= 30 &&
    input.starsDelta7d > 0
  ) {
    return "quiet_killer";
  }

  // Cooling: middling score, 7d was much bigger than 24h*7 (peaked earlier).
  if (
    overall >= 25 &&
    overall < 45 &&
    input.starsDelta7d > input.starsDelta24h * 7
  ) {
    return "cooling";
  }

  if (overall < 20 || input.starsDelta7d < 0) return "declining";

  return "stable";
}

// ---------------------------------------------------------------------------
// Core engine
// ---------------------------------------------------------------------------

/**
 * Compute a full RepoScore from the split ScoringInput / ModifierInput
 * shape. `allInputs` is optional and currently unused — reserved for future
 * relative/percentile scoring without requiring a second pass.
 */
export function computeScore(
  input: ScoringInput,
  modifierInput: ModifierInput,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  allInputs?: ScoringInput[],
  previousStatus?: MovementStatus,
): RepoScore {
  const weights = resolveWeights(input.categoryId);
  const components = computeAllComponents(input);
  const modifiers = computeAllModifiers(modifierInput);

  // Weighted sum of normalized components.
  const baseWeighted = weightedSum(components, weights);

  // Apply modifiers:
  //   final = weighted * decay * antiSpam * breakoutMult + quietKillerBonus
  const afterMultipliers =
    baseWeighted *
    modifiers.decayFactor *
    modifiers.antiSpamDampening *
    modifiers.breakoutMultiplier;
  const rawOverall = afterMultipliers + modifiers.quietKillerBonus;
  const overall = clamp(round1(rawOverall), 0, 100);

  const breakout = detectBreakout(modifierInput);
  const quietKiller = detectQuietKiller(modifierInput);

  const movementStatus = classifyMovement(overall, modifiers, input, previousStatus);
  const explanation = buildExplanation(
    overall,
    components,
    weights,
    modifiers,
    input,
  );

  return {
    repoId: input.repoId,
    computedAt: new Date().toISOString(),
    overall,
    components,
    weights,
    modifiers,
    isBreakout: breakout.isBreakout,
    isQuietKiller: quietKiller.isQuietKiller,
    movementStatus,
    explanation,
  };
}

// ---------------------------------------------------------------------------
// Repo-level convenience wrappers
// ---------------------------------------------------------------------------

/**
 * Build a ScoringInput from a full Repo object. Community-health flags are
 * left undefined so `componentCommunityHealth` returns a neutral 50 until
 * the ingestion layer surfaces them.
 */
function toScoringInput(
  repo: Repo,
  categoryAverages?: {
    avgStarVelocity7d: number;
    topStarVelocity7d: number;
  },
): ScoringInput {
  return {
    repoId: repo.id,
    categoryId: repo.categoryId,

    stars: repo.stars,
    forks: repo.forks,
    contributors: repo.contributors,
    openIssues: repo.openIssues,

    starsDelta24h: repo.starsDelta24h,
    starsDelta7d: repo.starsDelta7d,
    forksDelta7d: repo.forksDelta7d,
    contributorsDelta30d: repo.contributorsDelta30d,

    lastCommitAt: repo.lastCommitAt,
    lastReleaseAt: repo.lastReleaseAt,

    socialBuzzScore: repo.socialBuzzScore,

    categoryAvgStarVelocity7d: categoryAverages?.avgStarVelocity7d,
    categoryTopStarVelocity7d: categoryAverages?.topStarVelocity7d,
  };
}

/**
 * Build a ModifierInput from a full Repo object.
 */
function toModifierInput(repo: Repo): ModifierInput {
  return {
    stars: repo.stars,
    starsDelta24h: repo.starsDelta24h,
    starsDelta7d: repo.starsDelta7d,
    forksDelta7d: repo.forksDelta7d,
    contributors: repo.contributors,
    contributorsDelta30d: repo.contributorsDelta30d,
    socialBuzzScore: repo.socialBuzzScore,
    mentionCount24h: repo.mentionCount24h,
    lastCommitAt: repo.lastCommitAt,
    lastReleaseAt: repo.lastReleaseAt,
  };
}

/**
 * Convenience: score a single Repo.
 *
 * Pass `categoryAverages` if you have them (from a batch pre-pass); otherwise
 * `categoryMomentum` will default to 0.
 */
export function scoreRepo(
  repo: Repo,
  categoryAverages?: {
    avgStarVelocity7d: number;
    topStarVelocity7d: number;
  },
): RepoScore {
  const input = toScoringInput(repo, categoryAverages);
  const modifierInput = toModifierInput(repo);
  return computeScore(input, modifierInput, undefined, repo.movementStatus);
}

/**
 * Score a batch of Repos. First computes per-category averages, then scores
 * each repo with its own category context.
 */
export function scoreBatch(repos: Repo[]): RepoScore[] {
  // Compute per-category 7d star-velocity stats.
  const byCategory = new Map<string, number[]>();
  for (const r of repos) {
    const list = byCategory.get(r.categoryId);
    if (list) {
      list.push(r.starsDelta7d);
    } else {
      byCategory.set(r.categoryId, [r.starsDelta7d]);
    }
  }

  const stats = new Map<
    string,
    { avgStarVelocity7d: number; topStarVelocity7d: number }
  >();
  for (const [cat, values] of byCategory.entries()) {
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const top = values.reduce((a, b) => (b > a ? b : a), -Infinity);
    stats.set(cat, {
      avgStarVelocity7d: avg,
      topStarVelocity7d: Number.isFinite(top) ? top : 0,
    });
  }

  const allInputs: ScoringInput[] = repos.map((r) =>
    toScoringInput(r, stats.get(r.categoryId)),
  );

  return repos.map((repo, i) => {
    const modifierInput = toModifierInput(repo);
    return computeScore(allInputs[i], modifierInput, allInputs, repo.movementStatus);
  });
}

// Re-export commonly consumed helpers so callers only need to import from
// ./scoring/engine.
export { componentCommunityHealth, freshnessScore };
