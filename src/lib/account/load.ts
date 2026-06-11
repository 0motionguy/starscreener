// Shared account-context loader for /account and its sub-routes.
//
// Wrapped in React `cache()` so the Clerk gate + profile/tier/watchlist reads
// run exactly once per request even though the account layout (identity hero)
// AND the route page both need this context. The strict Clerk gate lives here
// so every /account/* surface inherits the same anon → /sign-in redirect.

import { cache } from "react";
import { auth } from "@clerk/nextjs/server";

import { getUser } from "@/lib/auth/server";
import { getUserTier, getUserTierRecord } from "@/lib/pricing/user-tiers";
import { tierFor, type TierDefinition } from "@/lib/pricing/tiers";
import type { UserTierRecord } from "@/lib/pricing/user-tiers";
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

  const tierKey = await safe(() => getUserTier(uid), "free" as const);
  const tier = tierFor(tierKey);
  const tierRecord = await safe(() => getUserTierRecord(uid), null);

  const wlist = await safe(() => getPrivateWatchlist(uid), null);
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
