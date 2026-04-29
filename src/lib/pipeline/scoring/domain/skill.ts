// TrendingRepo Pipeline — Skill domain scorer.
//
// Pure function. No I/O. Renormalizes weights when an input field is
// missing so every emitted rawScore is in 0..100.

import { clamp } from "../../../utils";
import { freshnessScore, logNorm } from "../normalize";
import type { DomainItem, DomainScorer, ScoredItem } from "./types";
import {
  normalizeWeights,
  topContributorsExplanation,
  weightedSum,
} from "./types";

export interface SkillItem extends DomainItem {
  domainKey: "skill";
  installs7d?: number;
  installsPrev7d?: number;
  stars?: number;
  forks?: number;
  /** Forks count from a 7-day-old snapshot — used to compute forkVelocity7d. */
  forks7dAgo?: number;
  /** Number of repos referencing this skill's SKILL.md (worker-fetched). */
  derivativeRepoCount?: number;
  agents: string[];
  inAwesomeLists?: string[];
  commitVelocity30d?: number;
  lastPushedAt?: string;
}

const COMPONENT_LABELS: Record<string, string> = {
  installsDelta7d: "installs Δ7d",
  installsAbs: "installs abs",
  forkVelocity7d: "forks Δ7d",
  forksAbs: "forks abs",
  forkRatio: "fork ratio",
  derivativeRepoCount: "derivatives",
  awesomeListInclusion: "awesome lists",
  commitVelocity30d: "commits 30d",
  crossAgentSupport: "agent support",
  freshness: "freshness",
};

// Day-1 deployment defect: with no 7d-ago snapshot, every delta-based
// component drops and the scorer falls back to {freshness, agentSupport}
// only — producing a useless 25-28 spread. The `installsAbs` and
// `forksAbs` fallbacks fire ONLY when their delta counterparts cannot
// (mutually exclusive). Smaller weight than the deltas because absolute
// snapshots are noisier signal.
const DEFAULT_WEIGHTS: Readonly<Record<string, number>> = Object.freeze({
  installsDelta7d: 0.30,
  installsAbs: 0.20,
  forkVelocity7d: 0.10,
  forksAbs: 0.12,
  forkRatio: 0.10,
  derivativeRepoCount: 0.10,
  awesomeListInclusion: 0.15,
  commitVelocity30d: 0.07,
  crossAgentSupport: 0.08,
  freshness: 0.10,
});

function computeOne(item: SkillItem): ScoredItem<SkillItem> {
  const components: Record<string, number> = {};
  const activeWeights: Record<string, number> = {};

  // installsDelta7d (0.30): drop if either field missing
  if (item.installs7d !== undefined && item.installsPrev7d !== undefined) {
    const delta = item.installs7d - item.installsPrev7d;
    components.installsDelta7d = logNorm(delta, 1000);
    activeWeights.installsDelta7d = DEFAULT_WEIGHTS.installsDelta7d;
  } else if (item.installs7d !== undefined && item.installs7d > 0) {
    // installsAbs (0.20): mutually exclusive with installsDelta7d. Fires only
    // when there's no 7d-ago snapshot to subtract (cold-start window).
    components.installsAbs = logNorm(item.installs7d, 50_000);
    activeWeights.installsAbs = DEFAULT_WEIGHTS.installsAbs;
  }

  // forkVelocity7d (0.10): drop if either field missing. Negative deltas
  // (forks deleted) → 0 via logNorm's value<=0 short-circuit.
  if (item.forks !== undefined && item.forks7dAgo !== undefined) {
    const delta = item.forks - item.forks7dAgo;
    components.forkVelocity7d = logNorm(delta, 100);
    activeWeights.forkVelocity7d = DEFAULT_WEIGHTS.forkVelocity7d;
  } else if (item.forks !== undefined && item.forks > 0) {
    // forksAbs (0.12): mutually exclusive with forkVelocity7d. Cold-start
    // fallback so a skill with 12K forks gets meaningful Hotness on day-1.
    components.forksAbs = logNorm(item.forks, 5_000);
    activeWeights.forksAbs = DEFAULT_WEIGHTS.forksAbs;
  }

  // forkRatio (0.10): requires both forks and stars
  if (item.forks !== undefined && item.stars !== undefined) {
    const ratio = (item.forks / Math.max(item.stars, 1)) * 100;
    components.forkRatio = clamp(ratio, 0, 100);
    activeWeights.forkRatio = DEFAULT_WEIGHTS.forkRatio;
  }

  // derivativeRepoCount (0.10): drop if undefined. log-norm against scale 50.
  if (item.derivativeRepoCount !== undefined) {
    components.derivativeRepoCount = logNorm(item.derivativeRepoCount, 50);
    activeWeights.derivativeRepoCount = DEFAULT_WEIGHTS.derivativeRepoCount;
  }

  // awesomeListInclusion (0.15): always present (defaults to 0)
  const awesomeCount = clamp(item.inAwesomeLists?.length ?? 0, 0, 5);
  components.awesomeListInclusion = awesomeCount * 20;
  activeWeights.awesomeListInclusion = DEFAULT_WEIGHTS.awesomeListInclusion;

  // commitVelocity30d (0.07): always present (defaults to 0)
  components.commitVelocity30d = logNorm(item.commitVelocity30d ?? 0, 30);
  activeWeights.commitVelocity30d = DEFAULT_WEIGHTS.commitVelocity30d;

  // crossAgentSupport (0.08): always present
  components.crossAgentSupport =
    Math.min(item.agents.length / 4, 1) * 100;
  activeWeights.crossAgentSupport = DEFAULT_WEIGHTS.crossAgentSupport;

  // freshness (0.10): default to 50 when undefined
  components.freshness = item.lastPushedAt
    ? freshnessScore(item.lastPushedAt)
    : 50;
  activeWeights.freshness = DEFAULT_WEIGHTS.freshness;

  const weights = normalizeWeights(activeWeights);
  const rawScore = clamp(weightedSum(components, weights), 0, 100);

  const explanation = topContributorsExplanation(
    components,
    weights,
    COMPONENT_LABELS,
    rawScore,
  );

  return {
    item,
    rawComponents: components,
    weights,
    rawScore,
    primaryMetric: {
      name: "installs7d",
      value: item.installs7d ?? 0,
      label: "Installs",
    },
    explanation,
  };
}

export const skillScorer: DomainScorer<SkillItem> = {
  domainKey: "skill",
  defaultWeights: DEFAULT_WEIGHTS,
  computeRaw(items: SkillItem[]): ScoredItem<SkillItem>[] {
    return items.map(computeOne);
  },
};
