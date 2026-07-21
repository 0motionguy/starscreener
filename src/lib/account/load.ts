// Shared account-context loader for /account and its sub-routes.
//
// Wrapped in React `cache()` so the Clerk gate + profile/tier/watchlist reads
// run exactly once per request even though the account layout (identity hero)
// AND the route page both need this context. The strict Clerk gate lives here
// so every /account/* surface inherits the same anon → /sign-in redirect.

import { cache } from "react";
import { auth } from "@clerk/nextjs/server";

import { getUser } from "@/lib/auth/server";
import {
  getTierRecordForClerkUser,
  isTierRecordExpired,
} from "@/lib/pricing/tier-resolve";
import { tierFor, type TierDefinition, type UserTier } from "@/lib/pricing/tiers";
import type { UserTierRecord } from "@/lib/pricing/user-tiers";
import { clerkDerivedUserId } from "@/lib/auth/user-id";
import { getPrivateWatchlist } from "@/lib/watchlist/private-store";

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  return fn().catch((err) => {
    console.warn("[account/load] safe() recovered:", err);
    return fallback;
  });
}

export interface AccountContext {
  userId: string;
  handle: string;
  displayName: string;
  email: string | null;
  memberSince: Date | string | null;
  profileId: string;
  timezone: string;
  emailDigestEnabled: boolean;
  tier: TierDefinition;
  tierRecord: UserTierRecord | null;
  watchingCount: number;
  watchingCap: number;
  watchlistFullNames: string[];
}

export const loadAccountContext = cache(async (): Promise<AccountContext> => {
  // The gate lives in middleware: src/middleware.ts redirects anonymous
  // traffic on /account(.*) to /sign-in BEFORE this runs, and lets
  // `?preview=1` through for anonymous design review. When there's no Clerk
  // session (preview, or no publishable key), auth() throws or returns null;
  // only those anonymous/no-Clerk cases may degrade to a safe preview shell.
  // If Clerk reports a real userId, profile loading must succeed so signed-in
  // users never see a fake account identity.
  let userId: string | null = null;
  try {
    userId = (await auth()).userId;
  } catch {
    // No Clerk middleware context (preview / no key / CI) — degrade.
  }
  const uid: string = userId ?? "preview-anonymous";

  const loaded = userId ? await getUser() : await safe(() => getUser(), null);
  if (userId && !loaded) {
    throw new Error("[account/load] signed-in profile unavailable");
  }

  const handle = loaded?.profile.handle ?? `user-${uid.slice(-8)}`;
  const displayName =
    loaded?.profile.displayName ?? loaded?.profile.handle ?? "TrendingRepo user";
  const email = loaded?.profile.email ?? null;
  const memberSince = loaded?.profile.createdAt ?? null;
  const profileId = loaded?.profile.id ?? uid;
  const timezone = loaded?.profile.timezone ?? "UTC";
  const emailDigestEnabled = loaded?.profile.emailAlertsCadence !== "off";

  // Entitlements resolve through the CANONICAL Clerk identity
  // (`c_<clerkUserId>`), NEVER the raw Clerk id. Checkout and the Stripe
  // webhook write tier rows under `c_<id>`; reading them under the raw
  // `user_...` id made a paying customer show "Free" — the identity-mismatch
  // P0 fixed here. `getTierRecordForClerkUser` canonicalizes (and
  // forward-migrates a legacy `u_<hmac>` hit) in one place, so `load.ts` no
  // longer bypasses `tier-resolve`. `email` is already resolved above.
  const tierRecord = userId
    ? await safe(() => getTierRecordForClerkUser(userId, email), null)
    : null;
  const tierKey: UserTier =
    tierRecord && !isTierRecordExpired(tierRecord) ? tierRecord.tier : "free";
  const tier = tierFor(tierKey);

  // Private watchlist is owned by the same canonical entitlement key (the
  // /api/watchlist/private route writes under `c_<id>`). Commit 5 moves this
  // read onto the profile-UUID Postgres tables.
  const entitlementKey = userId ? clerkDerivedUserId(userId) : uid;
  const wlist = await safe(() => getPrivateWatchlist(entitlementKey), null);
  const watchlistFullNames = wlist?.repoFullNames ?? [];
  const watchingCount = watchlistFullNames.length;
  const watchingCap = tier.features.maxWatchlistRepos;

  return {
    userId: uid,
    handle,
    displayName,
    email,
    memberSince,
    profileId,
    timezone,
    emailDigestEnabled,
    tier,
    tierRecord,
    watchingCount,
    watchingCap,
    watchlistFullNames,
  };
});
