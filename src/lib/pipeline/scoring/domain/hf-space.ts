// TrendingRepo Pipeline — Hugging Face Space domain scorer.

import { clamp } from "../../../utils";
import { freshnessScore, logNorm } from "../normalize";
import type { DomainItem, DomainScorer, ScoredItem } from "./types";
import {
  normalizeWeights,
  topContributorsExplanation,
  weightedSum,
} from "./types";
import { likesVelocityScore } from "./hf-model";

export interface HfSpaceItem extends DomainItem {
  domainKey: "hf-space";
  apiCalls7d?: number;
  likes?: number;
  likes7dAgo?: number;
  modelCount?: number;
  modelsUsed?: string[];
  avgModelMomentum?: number; // already 0..100
  lastModified?: string;
}

const COMPONENT_LABELS: Record<string, string> = {
  apiCalls7d: "API calls 7d",
  likesVelocity7d: "likes Δ7d",
  modelCount: "models",
  avgModelMomentum: "model momentum",
  recency: "recency",
};

const DEFAULT_WEIGHTS: Readonly<Record<string, number>> = Object.freeze({
  apiCalls7d: 0.35,
  likesVelocity7d: 0.25,
  modelCount: 0.20,
  avgModelMomentum: 0.15,
  recency: 0.05,
});

function computeOne(item: HfSpaceItem): ScoredItem<HfSpaceItem> {
  const components: Record<string, number> = {};
  const activeWeights: Record<string, number> = {};

  // apiCalls7d (0.35)
  components.apiCalls7d = logNorm(item.apiCalls7d ?? 0, 100000);
  activeWeights.apiCalls7d = DEFAULT_WEIGHTS.apiCalls7d;

  // likesVelocity7d (0.25): drop if either input missing
  const lv = likesVelocityScore(item.likes, item.likes7dAgo);
  if (lv !== undefined) {
    components.likesVelocity7d = lv;
    activeWeights.likesVelocity7d = DEFAULT_WEIGHTS.likesVelocity7d;
  }

  // modelCount (0.20)
  components.modelCount = Math.min((item.modelCount ?? 0) / 5, 1) * 100;
  activeWeights.modelCount = DEFAULT_WEIGHTS.modelCount;

  // avgModelMomentum (0.15)
  components.avgModelMomentum = clamp(item.avgModelMomentum ?? 0, 0, 100);
  activeWeights.avgModelMomentum = DEFAULT_WEIGHTS.avgModelMomentum;

  // recency (0.05)
  components.recency = freshnessScore(item.lastModified ?? null);
  activeWeights.recency = DEFAULT_WEIGHTS.recency;

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
      name: "api_calls_7d",
      value: item.apiCalls7d ?? 0,
      label: "API calls",
    },
    explanation,
  };
}

export const hfSpaceScorer: DomainScorer<HfSpaceItem> = {
  domainKey: "hf-space",
  defaultWeights: DEFAULT_WEIGHTS,
  computeRaw(items: HfSpaceItem[]): ScoredItem<HfSpaceItem>[] {
    return items.map(computeOne);
  },
};
