// StarScreener — Momentum scoring algorithm

import type { MovementStatus } from "./types";
import { clamp } from "./utils";

// ---------------------------------------------------------------------------
// Normalization helpers
// ---------------------------------------------------------------------------

/** Logarithmic normalization: maps value to 0-100 using log scale with a reference ceiling. */
function logNorm(value: number, ceiling: number): number {
  if (value <= 0) return 0;
  const score = (Math.log10(value + 1) / Math.log10(ceiling + 1)) * 100;
  return clamp(score, 0, 100);
}

/** Linear normalization: maps value from [min, max] to 0-100. */
function linearNorm(value: number, min: number, max: number): number {
  if (max <= min) return 0;
  const score = ((value - min) / (max - min)) * 100;
  return clamp(score, 0, 100);
}

/** Freshness score based on days since a date. */
function freshnessScore(isoDate: string | null): number {
  if (!isoDate) return 0;
  const now = Date.now();
  const then = new Date(isoDate).getTime();
  const daysSince = (now - then) / (1000 * 60 * 60 * 24);

  if (daysSince <= 0) return 100;
  if (daysSince <= 1) return 95;
  if (daysSince <= 3) return 85;
  if (daysSince <= 7) return 70;
  if (daysSince <= 14) return 55;
  if (daysSince <= 30) return 30;
  if (daysSince <= 60) return 15;
  if (daysSince <= 90) return 5;
  return 0;
}

// ---------------------------------------------------------------------------
// Input shape (subset of Repo fields needed for scoring)
// ---------------------------------------------------------------------------

export interface ScoringInput {
  starsDelta24h: number;
  starsDelta7d: number;
  forksDelta7d: number;
  contributorsDelta30d: number;
  openIssues: number;
  lastCommitAt: string;
  lastReleaseAt: string | null;
  socialBuzzScore: number; // 0-100
  stars: number;
  forks: number;
  sparklineData?: number[];
}

// ---------------------------------------------------------------------------
// Weights
// ---------------------------------------------------------------------------

const WEIGHTS = {
  starVelocity24h: 0.2,
  starVelocity7d: 0.15,
  forkVelocity7d: 0.08,
  contributorGrowth30d: 0.1,
  commitFreshness: 0.12,
  releaseFreshness: 0.08,
  socialBuzz: 0.12,
  issueActivity: 0.05,
  communityHealth: 0.05,
  categoryMomentum: 0.05,
} as const;

// ---------------------------------------------------------------------------
// Core scoring function
// ---------------------------------------------------------------------------

/**
 * Compute momentum score (0-100) from raw repo metrics.
 *
 * Weighted composite of 10 signals with 4 modifiers.
 */
export function computeMomentumScore(input: ScoringInput): number {
  // --- Base component scores ---
  const components = {
    starVelocity24h: logNorm(input.starsDelta24h, 500),
    starVelocity7d: logNorm(input.starsDelta7d, 2000),
    forkVelocity7d: logNorm(input.forksDelta7d, 300),
    contributorGrowth30d: linearNorm(input.contributorsDelta30d, 0, 50),
    commitFreshness: freshnessScore(input.lastCommitAt),
    releaseFreshness: freshnessScore(input.lastReleaseAt),
    socialBuzz: clamp(input.socialBuzzScore, 0, 100),
    issueActivity: linearNorm(input.openIssues, 0, 200),
    communityHealth: 50, // fixed for MVP
    categoryMomentum: 50, // fixed for MVP
  };

  // --- Weighted sum ---
  let baseScore = 0;
  for (const [key, weight] of Object.entries(WEIGHTS)) {
    baseScore += components[key as keyof typeof components] * weight;
  }

  // --- Modifiers ---

  // Decay factor: stale repos get penalized (0.3-1.0)
  const commitFresh = freshnessScore(input.lastCommitAt);
  const releaseFresh = freshnessScore(input.lastReleaseAt);
  const avgFreshness = (commitFresh + releaseFresh) / 2;
  const decayFactor = 0.3 + 0.7 * (avgFreshness / 100);

  // Anti-spam dampening: low fork:star ratio AND no social buzz = suspicious (0.3-1.0)
  const forkStarRatio = input.stars > 0 ? input.forks / input.stars : 0;
  const isLowForkRatio = forkStarRatio < 0.02;
  const isNoSocial = input.socialBuzzScore < 10;
  const antiSpamDampening =
    isLowForkRatio && isNoSocial ? 0.3 + 0.7 * forkStarRatio * 50 : 1.0;

  // Breakout multiplier: small repos with explosive growth + social validation (1.0-1.5)
  const breakoutData = detectBreakout(input);
  const breakoutMultiplier = breakoutData.isBreakout
    ? 1.0 + 0.5 * breakoutData.intensity
    : 1.0;

  // Quiet killer bonus: steady growth, no spikes, active maintenance (0-10)
  const quietKillerData = detectQuietKiller(input);
  const quietKillerBonus = quietKillerData.isQuietKiller
    ? quietKillerData.bonus
    : 0;

  // --- Final score ---
  const modifiedScore =
    baseScore * decayFactor * antiSpamDampening * breakoutMultiplier +
    quietKillerBonus;

  return clamp(Math.round(modifiedScore * 10) / 10, 0, 100);
}

// ---------------------------------------------------------------------------
// Breakout detection
// ---------------------------------------------------------------------------

export interface BreakoutResult {
  isBreakout: boolean;
  intensity: number; // 0-1
}

/**
 * Detect breakout: repos < 1k stars with 3x daily acceleration + social validation.
 */
export function detectBreakout(input: ScoringInput): BreakoutResult {
  // Must have <1k stars to qualify for breakout boost
  // (larger repos can still be "hot" but not "breakout")
  if (input.stars > 1000 && input.starsDelta24h < input.stars * 0.01) {
    return { isBreakout: false, intensity: 0 };
  }

  // Check for acceleration: 24h rate should be significantly higher than 7d average daily
  const dailyAvg7d = input.starsDelta7d / 7;
  const acceleration =
    dailyAvg7d > 0 ? input.starsDelta24h / dailyAvg7d : 0;

  // Need at least 3x acceleration
  if (acceleration < 3) {
    return { isBreakout: false, intensity: 0 };
  }

  // Need some social signal
  const hasSocialSignal = input.socialBuzzScore >= 20;
  if (!hasSocialSignal) {
    return { isBreakout: false, intensity: 0 };
  }

  // Need minimum absolute activity
  if (input.starsDelta24h < 10) {
    return { isBreakout: false, intensity: 0 };
  }

  // Intensity scales with acceleration and social buzz
  const intensity = clamp(
    ((acceleration - 3) / 7) * 0.5 + (input.socialBuzzScore / 100) * 0.5,
    0,
    1,
  );

  return { isBreakout: true, intensity };
}

// ---------------------------------------------------------------------------
// Quiet killer detection
// ---------------------------------------------------------------------------

export interface QuietKillerResult {
  isQuietKiller: boolean;
  bonus: number; // 0-10
}

/**
 * Detect quiet killer: steady weekly growth, no spikes, active maintenance.
 */
export function detectQuietKiller(input: ScoringInput): QuietKillerResult {
  // Need steady 7d growth (not explosive, not flat)
  const dailyAvg = input.starsDelta7d / 7;
  const isSteadyGrowth = dailyAvg >= 30 && dailyAvg <= 200;

  // Not spiking (24h should be within 2x of daily avg)
  const notSpiking =
    dailyAvg > 0 ? input.starsDelta24h / dailyAvg < 2 : false;

  // Active maintenance (recent commits)
  const isActiveMaintenance = freshnessScore(input.lastCommitAt) >= 70;

  // Low social buzz (under the radar)
  const isUnderRadar = input.socialBuzzScore < 40;

  if (!isSteadyGrowth || !notSpiking || !isActiveMaintenance || !isUnderRadar) {
    return { isQuietKiller: false, bonus: 0 };
  }

  // Bonus scales with consistency of growth (sparkline variance)
  let consistencyFactor = 0.5; // default if no sparkline
  if (input.sparklineData && input.sparklineData.length >= 7) {
    const recent = input.sparklineData.slice(-7);
    const mean = recent.reduce((a, b) => a + b, 0) / recent.length;
    if (mean > 0) {
      const variance =
        recent.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) /
        recent.length;
      const cv = Math.sqrt(variance) / mean; // coefficient of variation
      consistencyFactor = clamp(1 - cv, 0, 1);
    }
  }

  const bonus = consistencyFactor * 10;
  return { isQuietKiller: true, bonus };
}

// ---------------------------------------------------------------------------
// Movement status classification
// ---------------------------------------------------------------------------

/**
 * Classify a repo's overall movement status based on scoring signals.
 */
export function classifyMovement(input: ScoringInput): MovementStatus {
  const score = computeMomentumScore(input);
  const breakout = detectBreakout(input);
  const quietKiller = detectQuietKiller(input);
  const dailyAvg7d = input.starsDelta7d / 7;

  // Breakout: explosive acceleration with social validation
  if (breakout.isBreakout && breakout.intensity > 0.3) {
    return "breakout";
  }

  // Hot: high momentum score with significant daily stars
  if (score >= 75 && input.starsDelta24h >= 100) {
    return "hot";
  }

  // Quiet killer: steady grower under the radar
  if (quietKiller.isQuietKiller) {
    return "quiet_killer";
  }

  // Cooling: was hot recently but slowing down
  const isDecelerating =
    dailyAvg7d > 50 && input.starsDelta24h < dailyAvg7d * 0.5;
  if (isDecelerating && score >= 40) {
    return "cooling";
  }

  // Rising: moderate upward trend
  if (score >= 45 && input.starsDelta7d > 100) {
    return "rising";
  }

  // Declining: negative momentum
  if (score < 25 || (input.starsDelta7d < 20 && freshnessScore(input.lastCommitAt) < 30)) {
    return "declining";
  }

  // Stable: everything else
  return "stable";
}
