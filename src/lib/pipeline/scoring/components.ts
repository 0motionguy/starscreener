// StarScreener Pipeline — individual component scoring functions.
//
// Each component is a pure 0-100 score that can be tested independently.
// `computeAllComponents` ties them together and rounds each to 1 decimal for
// stable snapshotting.

import type { ScoreComponents } from "../types";
import { clamp } from "../../utils";
import { freshnessScore, linearNorm, logNorm } from "./normalize";

// ---------------------------------------------------------------------------
// Scoring input shape.
// ---------------------------------------------------------------------------

export interface ScoringInput {
  repoId: string;
  categoryId: string;

  // Raw metrics
  stars: number;
  forks: number;
  contributors: number;
  openIssues: number;

  // Deltas
  starsDelta24h: number;
  starsDelta7d: number;
  forksDelta7d: number;
  contributorsDelta30d: number;

  // Freshness
  lastCommitAt: string | null;
  lastReleaseAt: string | null;

  // Social
  socialBuzzScore: number;

  // Community health signals (optional binary flags)
  hasReadme?: boolean;
  hasLicense?: boolean;
  hasCI?: boolean;
  hasContributing?: boolean;

  // Category context (filled in by batch scorer)
  categoryAvgStarVelocity7d?: number;
  categoryTopStarVelocity7d?: number;
}

// ---------------------------------------------------------------------------
// Individual components (all 0-100).
// ---------------------------------------------------------------------------

export function componentStarVelocity24h(input: ScoringInput): number {
  return logNorm(input.starsDelta24h, 500);
}

export function componentStarVelocity7d(input: ScoringInput): number {
  return logNorm(input.starsDelta7d, 2000);
}

export function componentForkVelocity7d(input: ScoringInput): number {
  return logNorm(input.forksDelta7d, 300);
}

export function componentContributorGrowth30d(input: ScoringInput): number {
  if (!Number.isFinite(input.contributors) || input.contributors <= 0) return 0;
  const percent = (input.contributorsDelta30d / input.contributors) * 100;
  return linearNorm(percent, 0, 50);
}

export function componentCommitFreshness(input: ScoringInput): number {
  return freshnessScore(input.lastCommitAt);
}

export function componentReleaseFreshness(input: ScoringInput): number {
  return freshnessScore(input.lastReleaseAt);
}

export function componentSocialBuzz(input: ScoringInput): number {
  return clamp(input.socialBuzzScore, 0, 100);
}

export function componentIssueActivity(input: ScoringInput): number {
  return linearNorm(input.openIssues, 0, 200);
}

/**
 * Community health — sum of flags.
 *   hasReadme       → 25
 *   hasLicense      → 20
 *   hasCI           → 30
 *   hasContributing → 25
 *
 * If ALL flags are undefined (unknown), returns a neutral 50 so we don't
 * unfairly penalize repos we haven't audited yet.
 */
export function componentCommunityHealth(input: ScoringInput): number {
  const allUndefined =
    input.hasReadme === undefined &&
    input.hasLicense === undefined &&
    input.hasCI === undefined &&
    input.hasContributing === undefined;
  if (allUndefined) return 50;

  let score = 0;
  if (input.hasReadme) score += 25;
  if (input.hasLicense) score += 20;
  if (input.hasCI) score += 30;
  if (input.hasContributing) score += 25;
  return clamp(score, 0, 100);
}

export function componentCategoryMomentum(input: ScoringInput): number {
  return logNorm(input.categoryAvgStarVelocity7d ?? 0, 100);
}

// ---------------------------------------------------------------------------
// Aggregate + rounding
// ---------------------------------------------------------------------------

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Run every component function over a single ScoringInput and return the
 * full ScoreComponents object, each value rounded to 1 decimal.
 */
export function computeAllComponents(input: ScoringInput): ScoreComponents {
  return {
    starVelocity24h: round1(componentStarVelocity24h(input)),
    starVelocity7d: round1(componentStarVelocity7d(input)),
    forkVelocity7d: round1(componentForkVelocity7d(input)),
    contributorGrowth30d: round1(componentContributorGrowth30d(input)),
    commitFreshness: round1(componentCommitFreshness(input)),
    releaseFreshness: round1(componentReleaseFreshness(input)),
    socialBuzz: round1(componentSocialBuzz(input)),
    issueActivity: round1(componentIssueActivity(input)),
    communityHealth: round1(componentCommunityHealth(input)),
    categoryMomentum: round1(componentCategoryMomentum(input)),
  };
}
