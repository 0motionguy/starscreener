// Onboarding progress helper (S3.F).
//
// Server-only. Computes the three "next step" booleans for the
// `/you` progress widget from a single DB call per source. Cheap
// because all three queries are point selects against indexed
// `profile_id` columns; together they add roughly two extra round-trips
// to the /you page (alerts + referrals; the digest flag rides on the
// already-fetched profile row).
//
// `hasSubmittedRepo` is intentionally omitted — repo submissions still
// live in a JSONL file (see src/lib/repo-submissions.ts) and there's no
// DB-side index keyed on the submitter's profile. Adding it would
// require either a scan-of-file (too expensive on every /you load) or
// a schema change we don't want to land in the same PR. Revisit when
// submissions move to a Drizzle table.

import "server-only";

import { and, eq, isNotNull } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { alertRules } from "@/lib/db/schema/alerts";
import { referrals } from "@/lib/db/schema/referrals";
import type { EmailAlertsCadence } from "@/lib/db/schema/profiles";

export interface OnboardingProgress {
  hasAlert: boolean;
  hasDigest: boolean;
  hasReferralShared: boolean;
  /** True iff every checkpoint above is true. */
  allDone: boolean;
}

interface GetProgressInput {
  profileId: string;
  emailAlertsCadence: EmailAlertsCadence;
}

export async function getOnboardingProgress(
  input: GetProgressInput,
): Promise<OnboardingProgress> {
  const [anyAlert, anyReferralClick] = await Promise.all([
    // hasAlert — at least one rule exists for this profile (active or paused).
    db
      .select({ id: alertRules.id })
      .from(alertRules)
      .where(eq(alertRules.profileId, input.profileId))
      .limit(1)
      .then((rows) => rows.length > 0),
    // hasReferralShared — at least one click on this user's code.
    // referrals.referrerProfileId is set at click time (not signup),
    // so a non-empty row means the code has actually been distributed.
    db
      .select({ id: referrals.id })
      .from(referrals)
      .where(
        and(
          eq(referrals.referrerProfileId, input.profileId),
          // Defensive — we never insert null clickedAt, but be explicit
          // so the index plan stays predictable.
          isNotNull(referrals.clickedAt),
        ),
      )
      .limit(1)
      .then((rows) => rows.length > 0),
  ]);

  const hasDigest = input.emailAlertsCadence !== "off";
  const hasAlert = anyAlert;
  const hasReferralShared = anyReferralClick;

  return {
    hasAlert,
    hasDigest,
    hasReferralShared,
    allDone: hasAlert && hasDigest && hasReferralShared,
  };
}
