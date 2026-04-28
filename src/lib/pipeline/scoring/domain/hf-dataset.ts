// TrendingRepo Pipeline — Hugging Face Dataset domain scorer.
//
// No `derivativeCount` / `spacesUsingThis` (datasets aren't fine-tuned the
// same way). Adds `citationCount` for arXiv / model-card refs.

import { clamp } from "../../../utils";
import { freshnessScore, logNorm } from "../normalize";
import type { DomainItem, DomainScorer, ScoredItem } from "./types";
import {
  normalizeWeights,
  topContributorsExplanation,
  weightedSum,
} from "./types";
import { likesVelocityScore } from "./hf-model";

export interface HfDatasetItem extends DomainItem {
  domainKey: "hf-dataset";
  downloads7d?: number;
  likes?: number;
  likes7dAgo?: number;
  citationCount?: number;
  lastModified?: string;
}

const COMPONENT_LABELS: Record<string, string> = {
  weeklyDownloadsCapped: "downloads 7d",
  likesVelocity7d: "likes Δ7d",
  recency: "recency",
  citationCount: "citations",
};

const DEFAULT_WEIGHTS: Readonly<Record<string, number>> = Object.freeze({
  weeklyDownloadsCapped: 0.40,
  likesVelocity7d: 0.30,
  recency: 0.20,
  citationCount: 0.10,
});

const DOWNLOADS_CAP = 5_000_000;
const DOWNLOADS_LOG_DENOM = Math.log10(DOWNLOADS_CAP + 1);

function weeklyDownloadsCappedScore(downloads7d: number): number {
  const capped = Math.min(Math.max(downloads7d, 0), DOWNLOADS_CAP);
  const score = (Math.log10(capped + 1) / DOWNLOADS_LOG_DENOM) * 100;
  return clamp(score, 0, 100);
}

function computeOne(item: HfDatasetItem): ScoredItem<HfDatasetItem> {
  const components: Record<string, number> = {};
  const activeWeights: Record<string, number> = {};

  // weeklyDownloadsCapped (0.40)
  components.weeklyDownloadsCapped = weeklyDownloadsCappedScore(
    item.downloads7d ?? 0,
  );
  activeWeights.weeklyDownloadsCapped = DEFAULT_WEIGHTS.weeklyDownloadsCapped;

  // likesVelocity7d (0.30): drop if either input missing
  const lv = likesVelocityScore(item.likes, item.likes7dAgo);
  if (lv !== undefined) {
    components.likesVelocity7d = lv;
    activeWeights.likesVelocity7d = DEFAULT_WEIGHTS.likesVelocity7d;
  }

  // recency (0.20)
  components.recency = freshnessScore(item.lastModified ?? null);
  activeWeights.recency = DEFAULT_WEIGHTS.recency;

  // citationCount (0.10)
  components.citationCount = logNorm(item.citationCount ?? 0, 100);
  activeWeights.citationCount = DEFAULT_WEIGHTS.citationCount;

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
      name: "downloads_7d",
      value: item.downloads7d ?? 0,
      label: "Downloads",
    },
    explanation,
  };
}

export const hfDatasetScorer: DomainScorer<HfDatasetItem> = {
  domainKey: "hf-dataset",
  defaultWeights: DEFAULT_WEIGHTS,
  computeRaw(items: HfDatasetItem[]): ScoredItem<HfDatasetItem>[] {
    return items.map(computeOne);
  },
};
