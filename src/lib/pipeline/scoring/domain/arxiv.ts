// TrendingRepo Pipeline — arXiv paper domain scorer.
//
// Plan §1 specifies RELATIVE weights here; we normalize them to sum=1.0 once
// and then drop terms whose inputs are missing, renormalizing again.

import { clamp } from "../../../utils";
import { logNorm } from "../normalize";
import type { DomainItem, DomainScorer, ScoredItem } from "./types";
import {
  normalizeWeights,
  topContributorsExplanation,
  weightedSum,
} from "./types";

export interface ArxivPaperItem extends DomainItem {
  domainKey: "arxiv";
  citationVelocity?: number; // citations / 30d
  citationCount?: number;
  linkedRepoMomentum?: number; // 0..100
  socialMentions?: number; // sum of HN+Reddit+Bsky+devto last 7d
  hfAdoptionCount?: number;
  daysSincePublished?: number;
}

const COMPONENT_LABELS: Record<string, string> = {
  citationVelocity: "citation velocity",
  linkedRepoMomentum: "repo momentum",
  socialMentions: "social",
  hfAdoption: "HF adoption",
  coldStartBoost: "cold-start",
};

// Relative weights from plan §1 — normalized to sum to 1.0 below.
const RELATIVE_WEIGHTS: Readonly<Record<string, number>> = Object.freeze({
  citationVelocity: 2.5,
  linkedRepoMomentum: 1.8,
  socialMentions: 1.2,
  hfAdoption: 0.8,
  coldStartBoost: 0.32,
});

const DEFAULT_WEIGHTS: Readonly<Record<string, number>> = Object.freeze(
  normalizeWeights(RELATIVE_WEIGHTS),
);

function computeOne(item: ArxivPaperItem): ScoredItem<ArxivPaperItem> {
  const components: Record<string, number> = {};
  // We start from RELATIVE weights for the components actually present, then
  // a single normalizeWeights() call gives the final post-drop weight bag.
  const activeRelative: Record<string, number> = {};

  // citationVelocity
  components.citationVelocity = logNorm(item.citationVelocity ?? 0, 5);
  activeRelative.citationVelocity = RELATIVE_WEIGHTS.citationVelocity;

  // linkedRepoMomentum: drop if undefined (no GitHub link)
  if (item.linkedRepoMomentum !== undefined) {
    components.linkedRepoMomentum = clamp(item.linkedRepoMomentum, 0, 100);
    activeRelative.linkedRepoMomentum = RELATIVE_WEIGHTS.linkedRepoMomentum;
  }

  // socialMentions
  components.socialMentions = logNorm(item.socialMentions ?? 0, 10);
  activeRelative.socialMentions = RELATIVE_WEIGHTS.socialMentions;

  // hfAdoption
  components.hfAdoption = Math.min((item.hfAdoptionCount ?? 0) / 5, 1) * 100;
  activeRelative.hfAdoption = RELATIVE_WEIGHTS.hfAdoption;

  // coldStartBoost: only if recently published AND we have a linked repo
  if (
    item.daysSincePublished !== undefined &&
    item.daysSincePublished <= 14 &&
    item.linkedRepoMomentum !== undefined
  ) {
    const ageFactor = 1 - item.daysSincePublished / 14;
    components.coldStartBoost = clamp(
      ageFactor * item.linkedRepoMomentum,
      0,
      100,
    );
    activeRelative.coldStartBoost = RELATIVE_WEIGHTS.coldStartBoost;
  } else {
    components.coldStartBoost = 0;
    // Not present in active weight bag → effectively dropped.
  }

  const weights = normalizeWeights(activeRelative);
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
      name: "citationCount",
      value: item.citationCount ?? 0,
      label: "Citations",
    },
    explanation,
  };
}

export const arxivScorer: DomainScorer<ArxivPaperItem> = {
  domainKey: "arxiv",
  defaultWeights: DEFAULT_WEIGHTS,
  computeRaw(items: ArxivPaperItem[]): ScoredItem<ArxivPaperItem>[] {
    return items.map(computeOne);
  },
};
