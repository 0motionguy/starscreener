// Server-only referral reader for the /account surface.
//
// Returns the per-profile counters AccountReferralsCard needs:
//   - invites          — total `referrals` rows where this profile is the referrer
//   - paidConversions  — qualified (i.e. credited) referrals
//   - creditBalance    — denormalised `profiles.referral_credits` counter
//
// Degrades gracefully: returns EMPTY_STATS when DATABASE_URL is unset, when
// the lookup throws, or when the profile id can't be found. The /account
// page is a Clerk-gated dynamic route that must keep rendering even in
// local-without-db sessions.

import "server-only";

import { and, count, eq, isNotNull } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { profiles } from "@/lib/db/schema/profiles";
import { referrals } from "@/lib/db/schema/referrals";

export interface ReferralStats {
  invites: number;
  paidConversions: number;
  creditBalance: number;
}

export const EMPTY_REFERRAL_STATS: ReferralStats = {
  invites: 0,
  paidConversions: 0,
  creditBalance: 0,
};

function isDatabaseAvailable(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/**
 * Load the referral counters for `profileId`. `profileId` is the
 * `profiles.id` UUID (NOT the Clerk user id) — callers should pass
 * `loaded.profile.id` from `getUser()`.
 *
 * Never throws. Returns EMPTY_REFERRAL_STATS on any failure path:
 *   - DATABASE_URL not set
 *   - DB connection error
 *   - profile row missing (anonymous-but-signed-in race)
 */
export async function getReferralStats(
  profileId: string,
): Promise<ReferralStats> {
  try {
    if (!isDatabaseAvailable()) return EMPTY_REFERRAL_STATS;
    if (!profileId) return EMPTY_REFERRAL_STATS;

    const [invitesRow, qualifiedRow, profileRow] = await Promise.all([
      // Total referrals authored — both click-only and signed-up rows.
      db
        .select({ n: count() })
        .from(referrals)
        .where(eq(referrals.referrerProfileId, profileId)),
      // Qualified rows = the ones that earned a credit.
      db
        .select({ n: count() })
        .from(referrals)
        .where(
          and(
            eq(referrals.referrerProfileId, profileId),
            isNotNull(referrals.qualifiedAt),
          ),
        ),
      // Denormalised counter — single source of truth for milestone math.
      db
        .select({ credits: profiles.referralCredits })
        .from(profiles)
        .where(eq(profiles.id, profileId))
        .limit(1),
    ]);

    return {
      invites: Number(invitesRow[0]?.n ?? 0),
      paidConversions: Number(qualifiedRow[0]?.n ?? 0),
      creditBalance: profileRow[0]?.credits ?? 0,
    };
  } catch (err) {
    console.warn("[referrals/getReferralStats] degraded:", err);
    return EMPTY_REFERRAL_STATS;
  }
}
