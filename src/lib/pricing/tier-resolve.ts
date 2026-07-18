// Tier resolution for Clerk-authenticated users, with legacy read-through.
//
// Canonical tier key: `c_<clerkUserId>` (see lib/auth/user-id). Before the
// identity unification, tier records could land under the LEGACY
// `u_<hmac(email)>` id (settings + alert-rules derived it from the profile
// email, and pre-fix checkouts pinned whatever ss_user cookie the browser
// carried). This resolver checks the canonical id first, then the legacy
// email-derived id, and forward-migrates a legacy hit to the canonical id
// so subsequent reads take the fast path.
//
// The legacy derivation needs SESSION_SECRET; when it's unset (fresh local
// checkouts) the legacy probe is skipped silently — canonical-only.

import { deriveUserId } from "@/lib/api/session";
import { clerkDerivedUserId } from "@/lib/auth/user-id";
import {
  getUserTierRecord,
  setUserTier,
  type UserTierRecord,
} from "./user-tiers";

/**
 * Full tier record for a Clerk user, or null when none exists under either
 * the canonical or the legacy id. Never throws.
 */
export async function getTierRecordForClerkUser(
  clerkUserId: string,
  email: string | null | undefined,
): Promise<UserTierRecord | null> {
  const canonicalId = clerkDerivedUserId(clerkUserId);
  try {
    const canonical = await getUserTierRecord(canonicalId);
    if (canonical) return canonical;
  } catch {
    return null;
  }

  if (!email || !email.includes("@")) return null;
  let legacyId: string;
  try {
    legacyId = deriveUserId(email);
  } catch {
    // SESSION_SECRET unset — no legacy ids can exist for this deploy.
    return null;
  }

  try {
    const legacy = await getUserTierRecord(legacyId);
    if (!legacy) return null;
    // Forward-migrate so the canonical id owns the record from now on.
    // Best-effort: a failed write still returns the legacy record so the
    // user sees their tier; the next read retries the migration.
    try {
      const migrated = await setUserTier(canonicalId, legacy.tier, legacy.expiresAt, {
        stripeCustomerId: legacy.stripeCustomerId ?? null,
        stripeSubscriptionId: legacy.stripeSubscriptionId ?? null,
      });
      console.info("[tier] migrated legacy tier record to canonical id", {
        from: legacyId,
        to: canonicalId,
        tier: legacy.tier,
      });
      return migrated;
    } catch {
      return legacy;
    }
  } catch {
    return null;
  }
}

/** True when the record is expired (past its expiresAt). */
export function isTierRecordExpired(record: UserTierRecord): boolean {
  if (!record.expiresAt) return false;
  const expiry = Date.parse(record.expiresAt);
  return Number.isFinite(expiry) && expiry < Date.now();
}

/**
 * Effective tier for a Clerk user — read-through + expiry honored.
 * Returns "free" when no record exists or the record has expired.
 */
export async function getTierForClerkUser(
  clerkUserId: string,
  email: string | null | undefined,
): Promise<UserTierRecord["tier"]> {
  const record = await getTierRecordForClerkUser(clerkUserId, email);
  if (!record) return "free";
  return isTierRecordExpired(record) ? "free" : record.tier;
}
