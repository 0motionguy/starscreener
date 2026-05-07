// /you/refer — Referral landing page (Chunk G).
//
// Server-side wrapper that:
//   1. Forces sign-in via `requireUser()`.
//   2. Looks up the caller's referral_codes row, lazy-creating it via
//      `deriveCode()` when the Clerk webhook hasn't yet (idempotent).
//   3. Computes the click / signup / qualified counters in parallel.
//   4. Reads the most-recent 10 anonymized referrals.
//   5. Hands the bundle to <ReferClient /> for the interactive surface.
//
// All DB reads happen here so the client never has to wait for an API
// roundtrip on first paint — the user's counters render server-side
// then refresh on demand via /api/referrals/me.

import type { Metadata } from "next";

import { and, count, desc, eq, isNotNull } from "drizzle-orm";

import { requireUser } from "@/lib/auth/server";
import { db } from "@/lib/db/client";
import { profiles } from "@/lib/db/schema/profiles";
import {
  referralCodes,
  referrals,
} from "@/lib/db/schema/referrals";
import { deriveCode } from "@/lib/referrals/code";
import { absoluteUrl, SITE_NAME } from "@/lib/seo";

import ReferClient from "./ReferClient";

// Drizzle DB query — must render at request time. Without DATABASE_URL
// set, prerender throws from db/client.ts.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `Invite friends — ${SITE_NAME}`,
  description:
    "Invite friends to TrendingRepo. Earn badges + early access for every qualified referral — no cash, no spam.",
  alternates: { canonical: absoluteUrl("/you/refer") },
  robots: { index: false, follow: false },
};

interface RecentReferralRow {
  id: string;
  handle: string | null;
  status: "qualified" | "signed_up" | "clicked";
  timestamp: string;
}

function anonymizeHandle(handle: string): string {
  const trimmed = handle.trim();
  if (trimmed.length <= 3) return `${trimmed}***`;
  return `${trimmed.slice(0, 3)}***`;
}

/**
 * Look up the caller's referral code, lazy-create when missing. Same
 * idempotent pattern as `/api/referrals/me`.
 */
async function loadCode(profileId: string, handle: string): Promise<string> {
  const existing = await db
    .select({ code: referralCodes.code })
    .from(referralCodes)
    .where(eq(referralCodes.profileId, profileId))
    .limit(1);
  if (existing.length > 0) return existing[0].code;

  const code = deriveCode(handle, profileId);
  await db
    .insert(referralCodes)
    .values({ profileId, code })
    .onConflictDoNothing();

  const after = await db
    .select({ code: referralCodes.code })
    .from(referralCodes)
    .where(eq(referralCodes.profileId, profileId))
    .limit(1);
  return after[0]?.code ?? code;
}

export default async function ReferPage() {
  const user = await requireUser();
  const profile = user.profile;

  // 1) Code (lazy-created if Clerk webhook lagged).
  // 2-4) Counts in parallel — clicks, signups, qualified.
  // 5) Recent referrals (LEFT JOIN profiles for the anonymized handle).
  const [code, clicksRow, signupsRow, qualifiedRow, recent] = await Promise.all([
    loadCode(profile.id, profile.handle),
    db
      .select({ n: count() })
      .from(referrals)
      .where(eq(referrals.referrerProfileId, profile.id)),
    db
      .select({ n: count() })
      .from(referrals)
      .where(
        and(
          eq(referrals.referrerProfileId, profile.id),
          isNotNull(referrals.signedUpAt),
        ),
      ),
    db
      .select({ n: count() })
      .from(referrals)
      .where(
        and(
          eq(referrals.referrerProfileId, profile.id),
          isNotNull(referrals.qualifiedAt),
        ),
      ),
    db
      .select({
        id: referrals.id,
        signedUpAt: referrals.signedUpAt,
        qualifiedAt: referrals.qualifiedAt,
        clickedAt: referrals.clickedAt,
        handle: profiles.handle,
      })
      .from(referrals)
      .leftJoin(profiles, eq(profiles.id, referrals.referredProfileId))
      .where(eq(referrals.referrerProfileId, profile.id))
      .orderBy(
        desc(referrals.qualifiedAt),
        desc(referrals.signedUpAt),
        desc(referrals.clickedAt),
      )
      .limit(10),
  ]);

  const recentReferrals: RecentReferralRow[] = recent.map((r) => ({
    id: r.id,
    handle: r.handle ? anonymizeHandle(r.handle) : null,
    status: r.qualifiedAt
      ? "qualified"
      : r.signedUpAt
        ? "signed_up"
        : "clicked",
    timestamp: (r.qualifiedAt ?? r.signedUpAt ?? r.clickedAt).toISOString(),
  }));

  return (
    <ReferClient
      handle={profile.handle}
      code={code}
      counts={{
        clicks: Number(clicksRow[0]?.n ?? 0),
        signups: Number(signupsRow[0]?.n ?? 0),
        qualified: Number(qualifiedRow[0]?.n ?? 0),
      }}
      recentReferrals={recentReferrals}
      publicLeaderboardOptin={profile.publicLeaderboardOptin}
      referralCredits={profile.referralCredits}
    />
  );
}
