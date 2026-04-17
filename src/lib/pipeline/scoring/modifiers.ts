// StarScreener Pipeline — post-weighted-sum modifiers.
//
// Modifiers are applied after the weighted component sum. They capture
// effects that don't fit neatly into a single component score:
//
//   - decayFactor        penalizes stale repos (0.3-1.0)
//   - antiSpamDampening  punishes suspicious star spikes (0.3-1.0)
//   - breakoutMultiplier rewards small repos with acceleration (1.0-1.5)
//   - quietKillerBonus   flat bonus for steady growers (0-10)

import type { ScoreModifiers } from "../types";
import { clamp } from "../../utils";
import { freshnessScore } from "./normalize";

// ---------------------------------------------------------------------------
// Modifier input shape.
// ---------------------------------------------------------------------------

export interface ModifierInput {
  stars: number;
  starsDelta24h: number;
  starsDelta7d: number;
  forksDelta24h?: number;
  forksDelta7d: number;
  contributors: number;
  contributorsDelta30d: number;
  socialBuzzScore: number;
  mentionCount24h: number;
  lastCommitAt: string | null;
  lastReleaseAt: string | null;
}

// ---------------------------------------------------------------------------
// Decay factor — stale repos get a lower overall score.
// ---------------------------------------------------------------------------

/**
 * Decay factor in [0.3, 1.0].
 *
 * Combines commit freshness (70%) and release freshness (30%). Fresh repo
 * (both recent) → 1.0. Totally stale → 0.3.
 */
export function computeDecayFactor(input: ModifierInput): number {
  const commitFresh = freshnessScore(input.lastCommitAt);
  const releaseFresh = freshnessScore(input.lastReleaseAt);
  const combined = commitFresh * 0.7 + releaseFresh * 0.3; // 0-100

  const factor = 0.3 + 0.7 * (combined / 100);
  return clamp(factor, 0.3, 1.0);
}

// ---------------------------------------------------------------------------
// Anti-spam dampening — suspicious star spikes.
// ---------------------------------------------------------------------------

/**
 * Anti-spam dampening in [0.3, 1.0].
 *
 * Heuristics (applied multiplicatively, floor at 0.3):
 *   - starsDelta24h > 200 AND forks/stars < 0.005           → * 0.6
 *   - starsDelta24h > 500 AND socialBuzzScore < 10          → * 0.5
 *   - stars > 1000 AND commit freshness < 20 AND <3 contribs → * 0.4
 */
export function computeAntiSpamDampening(input: ModifierInput): number {
  let factor = 1.0;

  const forkStarRatio =
    input.stars > 0 ? (input.forksDelta7d + 0) / input.stars : 0;
  // We use total fork count vs stars, not delta, if available via input.
  // `ModifierInput` doesn't carry absolute forks, so we approximate with the
  // 7d fork delta signal. The threshold `< 0.005` is calibrated for the
  // fork-to-star ratio of a 'real' trending repo; bot spikes show ~0.
  // Callers that have the absolute fork count will see this behave as
  // expected since bot-spiked repos produce ~0 forks regardless of window.

  if (input.starsDelta24h > 200 && forkStarRatio < 0.005) {
    factor *= 0.6;
  }

  if (input.starsDelta24h > 500 && input.socialBuzzScore < 10) {
    factor *= 0.5;
  }

  const commitFresh = freshnessScore(input.lastCommitAt);
  if (
    input.stars > 1000 &&
    commitFresh < 20 &&
    input.contributors < 3
  ) {
    factor *= 0.4;
  }

  return clamp(factor, 0.3, 1.0);
}

// ---------------------------------------------------------------------------
// Breakout detection — small repo, rapid acceleration, social validation.
// ---------------------------------------------------------------------------

export interface BreakoutResult {
  isBreakout: boolean;
  multiplier: number;
  reasons: string[];
}

/**
 * Detect breakout. Only eligible when `stars >= 10` and `stars < 1000`.
 *
 * Criteria (need >= 2 of 3):
 *   1. starsDelta24h > (starsDelta7d / 7) * 3              (3x daily avg)
 *   2. starsDelta24h / stars > 0.05                         (>5% growth / day)
 *   3. socialBuzzScore > 30 AND mentionCount24h >= 3        (social validation)
 *
 * Multiplier ∈ [1.0, 1.5], scaled by the strongest criterion intensity.
 */
export function detectBreakout(input: ModifierInput): BreakoutResult {
  if (input.stars < 10 || input.stars >= 1000) {
    return { isBreakout: false, multiplier: 1.0, reasons: [] };
  }

  const reasons: string[] = [];
  const intensities: number[] = [];

  // Criterion 1 — 3x daily acceleration
  const dailyAvg7d = input.starsDelta7d / 7;
  if (dailyAvg7d > 0 && input.starsDelta24h > dailyAvg7d * 3) {
    const accel = input.starsDelta24h / dailyAvg7d; // >3
    reasons.push(`24h star rate is ${accel.toFixed(1)}x the 7d daily average`);
    intensities.push(clamp((accel - 3) / 7, 0, 1)); // 3x=0, 10x=1
  }

  // Criterion 2 — >5% growth in a day (relative to total stars)
  const relDailyGrowth =
    input.stars > 0 ? input.starsDelta24h / input.stars : 0;
  if (relDailyGrowth > 0.05) {
    reasons.push(
      `gained ${(relDailyGrowth * 100).toFixed(1)}% of total stars in 24h`,
    );
    intensities.push(clamp((relDailyGrowth - 0.05) / 0.2, 0, 1)); // 5%=0, 25%=1
  }

  // Criterion 3 — social validation
  if (input.socialBuzzScore > 30 && input.mentionCount24h >= 3) {
    reasons.push(
      `social buzz ${input.socialBuzzScore.toFixed(0)} with ${input.mentionCount24h} mentions in 24h`,
    );
    intensities.push(clamp((input.socialBuzzScore - 30) / 70, 0, 1));
  }

  if (intensities.length < 2) {
    return { isBreakout: false, multiplier: 1.0, reasons: [] };
  }

  const maxIntensity = Math.max(...intensities);
  const multiplier = clamp(1.1 + maxIntensity * 0.4, 1.0, 1.5);

  return { isBreakout: true, multiplier, reasons };
}

// ---------------------------------------------------------------------------
// Quiet killer detection — steady sustained growth, under the radar.
// ---------------------------------------------------------------------------

export interface QuietKillerResult {
  isQuietKiller: boolean;
  bonus: number;
  reasons: string[];
}

/**
 * Detect quiet killer. All of the following must hold:
 *
 *   - stars in [100, 50_000]
 *   - starsDelta7d >= 30
 *   - starsDelta24h < starsDelta7d / 3            (no single-day spike)
 *   - commit freshness > 55                        (committed within ~14d)
 *   - contributors >= 5
 *   - contributorsDelta30d > 0                     (growing team)
 *
 * Bonus = clamp(consistency*5 + growth*5, 0, 10).
 */
export function detectQuietKiller(input: ModifierInput): QuietKillerResult {
  const reasons: string[] = [];

  const inStarBand = input.stars >= 100 && input.stars <= 50_000;
  const weeklyGrowthOk = input.starsDelta7d >= 30;
  const noSpike = input.starsDelta24h < input.starsDelta7d / 3;
  const commitFresh = freshnessScore(input.lastCommitAt);
  const activeMaint = commitFresh > 55;
  const teamOk = input.contributors >= 5;
  const teamGrowing = input.contributorsDelta30d > 0;

  if (
    !inStarBand ||
    !weeklyGrowthOk ||
    !noSpike ||
    !activeMaint ||
    !teamOk ||
    !teamGrowing
  ) {
    return { isQuietKiller: false, bonus: 0, reasons: [] };
  }

  // Consistency factor: how non-spiky the last 24h was vs the weekly average.
  // 1.0 = perfectly flat; closer to 0 as the 24h approaches the full 7d gain.
  const dailyAvg = input.starsDelta7d / 7;
  const consistencyFactor =
    dailyAvg > 0
      ? clamp(1 - Math.abs(input.starsDelta24h - dailyAvg) / dailyAvg, 0, 1)
      : 0.5;

  // Growth factor: scales with contributor growth rate, capped.
  const growthRate =
    input.contributors > 0
      ? input.contributorsDelta30d / input.contributors
      : 0;
  const growthFactor = clamp(growthRate / 0.25, 0, 1); // 25% monthly growth == 1.0

  const bonus = clamp(consistencyFactor * 5 + growthFactor * 5, 0, 10);

  reasons.push(
    `steady +${input.starsDelta7d} stars/7d (no spike), ${input.contributors} contribs (+${input.contributorsDelta30d}/30d)`,
  );

  return { isQuietKiller: true, bonus, reasons };
}

// ---------------------------------------------------------------------------
// Aggregate modifiers
// ---------------------------------------------------------------------------

/**
 * Compute every modifier and return the combined ScoreModifiers object.
 */
export function computeAllModifiers(input: ModifierInput): ScoreModifiers {
  const decay = computeDecayFactor(input);
  const antiSpam = computeAntiSpamDampening(input);
  const breakout = detectBreakout(input);
  const quietKiller = detectQuietKiller(input);

  return {
    decayFactor: Math.round(decay * 1000) / 1000,
    antiSpamDampening: Math.round(antiSpam * 1000) / 1000,
    breakoutMultiplier: Math.round(breakout.multiplier * 1000) / 1000,
    quietKillerBonus: Math.round(quietKiller.bonus * 10) / 10,
  };
}
