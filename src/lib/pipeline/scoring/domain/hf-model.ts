// TrendingRepo Pipeline — Hugging Face Model domain scorer.

import { clamp } from "../../../utils";
import { freshnessScore, logNorm } from "../normalize";
import type { DomainItem, DomainScorer, ScoredItem } from "./types";
import {
  normalizeWeights,
  topContributorsExplanation,
  weightedSum,
} from "./types";

export interface HfModelItem extends DomainItem {
  domainKey: "hf-model";
  downloads7d?: number;
  likes?: number;
  likes7dAgo?: number;
  derivativeCount?: number;
  spacesUsingThis?: number;
  lastModified?: string;
}

const COMPONENT_LABELS: Record<string, string> = {
  weeklyDownloadsCapped: "downloads 7d",
  likesVelocity7d: "likes Δ7d",
  derivativeCount: "derivatives",
  spacesUsingThis: "spaces using",
  recency: "recency",
};

const DEFAULT_WEIGHTS: Readonly<Record<string, number>> = Object.freeze({
  weeklyDownloadsCapped: 0.30,
  likesVelocity7d: 0.25,
  derivativeCount: 0.15,
  spacesUsingThis: 0.15,
  recency: 0.15,
});

const DOWNLOADS_CAP = 5_000_000;
const DOWNLOADS_LOG_DENOM = Math.log10(DOWNLOADS_CAP + 1);

function weeklyDownloadsCappedScore(downloads7d: number): number {
  const capped = Math.min(Math.max(downloads7d, 0), DOWNLOADS_CAP);
  const score = (Math.log10(capped + 1) / DOWNLOADS_LOG_DENOM) * 100;
  return clamp(score, 0, 100);
}

export function likesVelocityScore(
  likes: number | undefined,
  likes7dAgo: number | undefined,
): number | undefined {
  if (likes === undefined || likes7dAgo === undefined) return undefined;
  const denom = Math.max(likes7dAgo, 10);
  const pct = ((likes - likes7dAgo) / denom) * 100;
  return clamp(pct, 0, 100);
}

function computeOne(item: HfModelItem): ScoredItem<HfModelItem> {
  const components: Record<string, number> = {};
  const activeWeights: Record<string, number> = {};

  // weeklyDownloadsCapped (0.30): always present (default 0)
  components.weeklyDownloadsCapped = weeklyDownloadsCappedScore(
    item.downloads7d ?? 0,
  );
  activeWeights.weeklyDownloadsCapped = DEFAULT_WEIGHTS.weeklyDownloadsCapped;

  // likesVelocity7d (0.25): drop if either input missing
  const lv = likesVelocityScore(item.likes, item.likes7dAgo);
  if (lv !== undefined) {
    components.likesVelocity7d = lv;
    activeWeights.likesVelocity7d = DEFAULT_WEIGHTS.likesVelocity7d;
  }

  // derivativeCount (0.15)
  components.derivativeCount = logNorm(item.derivativeCount ?? 0, 50);
  activeWeights.derivativeCount = DEFAULT_WEIGHTS.derivativeCount;

  // spacesUsingThis (0.15)
  components.spacesUsingThis = logNorm(item.spacesUsingThis ?? 0, 30);
  activeWeights.spacesUsingThis = DEFAULT_WEIGHTS.spacesUsingThis;

  // recency (0.15)
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
      name: "downloads_7d",
      value: item.downloads7d ?? 0,
      label: "Downloads",
    },
    explanation,
  };
}

export const hfModelScorer: DomainScorer<HfModelItem> = {
  domainKey: "hf-model",
  defaultWeights: DEFAULT_WEIGHTS,
  computeRaw(items: HfModelItem[]): ScoredItem<HfModelItem>[] {
    return items.map(computeOne);
  },
};
