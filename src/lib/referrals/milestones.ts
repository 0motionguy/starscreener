// Pure milestone evaluator for the referral program.
//
// Run by `/api/cron/referrals/qualify` after each successful credit
// increment. Compares prior credits (before the increment) against new
// credits (after the increment) and reports which milestone thresholds
// were crossed in this single tick.
//
// Decoupled from the DB on purpose: keeps the cron logic testable in
// isolation and lets the qualify route hold the transaction boundary.
//
// Threshold table lives in `@/lib/db/schema/referrals` so the canonical
// values aren't duplicated (1=connector, 5=operator, 25=founder).

import {
  REFERRAL_MILESTONE_THRESHOLDS,
  type ReferralMilestoneKey,
} from "@/lib/db/schema/referrals";

export type MilestoneKey = ReferralMilestoneKey;

export interface MilestoneEvaluation {
  /** Milestones whose threshold was crossed by THIS credit increment. */
  newlyReached: MilestoneKey[];
  /** All milestones the user has reached at the new credit total. */
  allReached: MilestoneKey[];
  /** The next un-reached threshold value, or null if all reached. */
  nextThreshold: number | null;
}

/**
 * Evaluate the milestone state for a credit transition.
 *
 * `newlyReached` is the set whose threshold T satisfies
 *   `T > prevCredits AND T <= newCredits`.
 *
 * Defensive against a stale `prevCredits >= newCredits` call (e.g. an
 * admin rejection that decremented credits) — `newlyReached` is empty in
 * that case but `allReached` still reflects the user's current total.
 *
 * Pure: no DB, no clock, no env. Safe to unit-test directly.
 */
export function evaluateMilestones(
  prevCredits: number,
  newCredits: number,
): MilestoneEvaluation {
  const newlyReached: MilestoneKey[] = [];
  const allReached: MilestoneKey[] = [];

  // Iterate in the schema-declared order so the result preserves the
  // intuitive 1 → 5 → 25 sequence even though the threshold table
  // could in theory be unsorted.
  const sorted = [...REFERRAL_MILESTONE_THRESHOLDS].sort(
    (a, b) => a.threshold - b.threshold,
  );

  for (const { key, threshold } of sorted) {
    if (newCredits >= threshold) {
      allReached.push(key);
      if (threshold > prevCredits) {
        newlyReached.push(key);
      }
    }
  }

  // First threshold strictly greater than newCredits is the next target.
  const next = sorted.find((entry) => entry.threshold > newCredits);
  const nextThreshold = next ? next.threshold : null;

  return { newlyReached, allReached, nextThreshold };
}
