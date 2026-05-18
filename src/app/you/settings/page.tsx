// /you/settings — account settings landing.
//
// Server component owns the metadata + initial profile fetch via
// `requireUser()`. Interactive form lives in `./SettingsClient.tsx`
// so we can keep the `metadata` export server-side per Next 15.
//
// S5.A.2 — tier + Stripe customer reference are looked up here so the
// client island can render the "Current plan" row + Manage billing /
// Upgrade buttons without a second client-side fetch. user-tiers.jsonl
// is keyed by HMAC(SESSION_SECRET, email) per src/lib/api/session.ts —
// derive the lookup key from the profile email loaded by Clerk.

import type { Metadata } from "next";

import { deriveUserId } from "@/lib/api/session";
import { requireUser } from "@/lib/auth/server";
import { getUserTierRecord } from "@/lib/pricing/user-tiers";

import SettingsClient, { type SettingsInitialProfile } from "./SettingsClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Account settings — TrendingRepo",
  description:
    "Update your display name, avatar, and account preferences.",
  robots: { index: false, follow: false },
};

export default async function YouSettingsPage() {
  const { profile } = await requireUser();

  // Tier lookup. Best-effort — JSONL read failures degrade to "free"
  // (the same default `getUserTier` applies for users with no record).
  const derivedUserId = deriveUserId(profile.email);
  let tier: "free" | "pro" | "team" | "enterprise" = "free";
  let tierExpiresAt: string | null = null;
  let hasStripeCustomer = false;
  try {
    const record = await getUserTierRecord(derivedUserId);
    if (record) {
      // Honor expiry: an expired Pro record reads as free.
      const expired =
        record.expiresAt &&
        Number.isFinite(Date.parse(record.expiresAt)) &&
        Date.parse(record.expiresAt) < Date.now();
      tier = expired ? "free" : record.tier;
      tierExpiresAt = record.expiresAt;
      hasStripeCustomer = Boolean(record.stripeCustomerId);
    }
  } catch {
    // Default-deny: leave tier=free, no Manage button. Same as no record.
  }

  const initialProfile: SettingsInitialProfile = {
    handle: profile.handle,
    email: profile.email,
    displayName: profile.displayName,
    avatarUrl: profile.avatarUrl,
    tier,
    tierExpiresAt,
    hasStripeCustomer,
  };
  return <SettingsClient initialProfile={initialProfile} />;
}
