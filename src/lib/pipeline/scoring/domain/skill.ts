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
  agents: string[];
  inAwesomeLists?: string[];
  commitVelocity30d?: number;
  lastPushedAt?: string;
}

const COMPONENT_LABELS: Record<string, string> = {
  installsDelta7d: "installs Δ7d",
  forkRatio: "fork ratio",
  awesomeListInclusion: "awesome lists",
  commitVelocity30d: "commits 30d",
  crossAgentSupport: "agent support",
  freshness: "freshness",
};

const DEFAULT_WEIGHTS: Readonly<Record<string, number>> = Object.freeze({
  installsDelta7d: 0.30,
  forkRatio: 0.18,
  awesomeListInclusion: 0.15,
  commitVelocity30d: 0.12,
  crossAgentSupport: 0.10,
  freshness: 0.15,
});

function computeOne(item: SkillItem): ScoredItem<SkillItem> {
  const components: Record<string, number> = {};
  const activeWeights: Record<string, number> = {};

  // installsDelta7d (0.30): drop if both fields missing
  if (item.installs7d !== undefined && item.installsPrev7d !== undefined) {
    const delta = item.installs7d - item.installsPrev7d;
    components.installsDelta7d = logNorm(delta, 1000);
    activeWeights.installsDelta7d = DEFAULT_WEIGHTS.installsDelta7d;
  }

  // forkRatio (0.18): requires both forks and stars
  if (item.forks !== undefined && item.stars !== undefined) {
    const ratio = (item.forks / Math.max(item.stars, 1)) * 100;
    components.forkRatio = clamp(ratio, 0, 100);
    activeWeights.forkRatio = DEFAULT_WEIGHTS.forkRatio;
  }

  // awesomeListInclusion (0.15): always present (defaults to 0)
  const awesomeCount = clamp(item.inAwesomeLists?.length ?? 0, 0, 5);
  components.awesomeListInclusion = awesomeCount * 20;
  activeWeights.awesomeListInclusion = DEFAULT_WEIGHTS.awesomeListInclusion;

  // commitVelocity30d (0.12): always present (defaults to 0)
  components.commitVelocity30d = logNorm(item.commitVelocity30d ?? 0, 30);
  activeWeights.commitVelocity30d = DEFAULT_WEIGHTS.commitVelocity30d;

  // crossAgentSupport (0.10): always present
  components.crossAgentSupport =
    Math.min(item.agents.length / 4, 1) * 100;
  activeWeights.crossAgentSupport = DEFAULT_WEIGHTS.crossAgentSupport;

  // freshness (0.15): default to 50 when undefined
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
