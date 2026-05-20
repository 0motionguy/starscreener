// /account — Account / Profile. Phase 3B of the UI v6 rebuild.
//
// Clerk-gated. Anonymous visitors are redirected to /sign-in with a
// redirect_url back here. Per-user data, no ISR.
//
// Wires:
//   getUser()                        — Clerk session + profile JOIN
//   getUserTier / getUserTierRecord  — plan card
//   getPrivateWatchlist              — watchlist preview rows
//   readRecentDropEvents             — drops queue (filtered by repo if
//                                       we ever record submitter; today the
//                                       JSONL log is global, so we surface
//                                       a recent-drops list and label it)
//   deriveCode                        — referral link string
//   getProfile(handle)                — ideas + reactions activity feed
//
// URL contract: ?tab=overview|watchlist|alerts|referrals|billing|api-keys|drops|settings
//   Default: overview.

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { getUser } from "@/lib/auth/server";
import {
  getUserTier,
  getUserTierRecord,
} from "@/lib/pricing/user-tiers";
import { tierFor } from "@/lib/pricing/tiers";
import { getPrivateWatchlist } from "@/lib/watchlist/private-store";
import { readRecentDropEvents } from "@/lib/drop-events";
import { deriveCode } from "@/lib/referrals/code";
import { getProfile } from "@/lib/profile";
import { refreshTrendingFromStore } from "@/lib/trending";
import { getDerivedRepoByFullName } from "@/lib/derived-repos";

import { AccountIdentityHero } from "@/components/account/AccountIdentityHero";
import { AccountYouStats } from "@/components/account/AccountYouStats";
import {
  AccountSubnav,
  ACCOUNT_TABS,
  type AccountTab,
} from "@/components/account/AccountSubnav";
import {
  AccountWatchlistPreview,
  type AccountWatchlistRow,
} from "@/components/account/AccountWatchlistPreview";
import { AccountAlertInbox } from "@/components/account/AccountAlertInbox";
import { AccountReferralsCard } from "@/components/account/AccountReferralsCard";
import { AccountApiKeys } from "@/components/account/AccountApiKeys";
import { AccountDropsQueue } from "@/components/account/AccountDropsQueue";
import { AccountActivityTimeline } from "@/components/account/AccountActivityTimeline";
import { AccountSettingsPanel } from "@/components/account/AccountSettingsPanel";
import { AccountBillingPanel } from "@/components/account/AccountBillingPanel";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Account",
  description:
    "Your profile, watchlist, alerts, referrals, billing, API keys and drop queue on TrendingRepo.",
  robots: { index: false, follow: false },
};

interface Props {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  return fn().catch((err) => {
    console.warn("[account/page] safe() recovered:", err);
    return fallback;
  });
}

function normalizeTab(raw: string | undefined): AccountTab {
  if (!raw) return "overview";
  const match = ACCOUNT_TABS.find((t) => t.id === raw);
  return match ? match.id : "overview";
}

export default async function AccountPage({ searchParams }: Props) {
  // Strict Clerk gate first — keep this exactly as the plan spec'd so the
  // anon → /sign-in?redirect_url=/account flow is verifiable with curl -I.
  // Wrap auth() in try/catch so missing Clerk env vars degrade to the
  // /sign-in "auth unavailable" fallback page instead of 500ing the route.
  let userId: string | null = null;
  try {
    userId = (await auth()).userId;
  } catch {
    redirect("/sign-in?redirect_url=/account");
  }
  if (!userId) redirect("/sign-in?redirect_url=/account");

  const params = (await searchParams) ?? {};
  const tab = normalizeTab(
    typeof params.tab === "string" ? params.tab : undefined,
  );

  // Profile JOIN can fail if DATABASE_URL is missing (local-without-db
  // sessions) — we degrade to a minimal hero rather than 500ing.
  const loaded = await safe(() => getUser(), null);

  const handle = loaded?.profile.handle ?? `user-${userId.slice(-8)}`;
  const displayName =
    loaded?.profile.displayName ?? loaded?.profile.handle ?? "TrendingRepo user";
  const email = loaded?.profile.email ?? null;
  const memberSince = loaded?.profile.createdAt ?? null;
  const profileId = loaded?.profile.id ?? userId;
  const timezone = loaded?.profile.timezone ?? "UTC";

  // Pricing / plan
  const tierKey = await safe(() => getUserTier(userId), "free" as const);
  const tier = tierFor(tierKey);
  const tierRecord = await safe(() => getUserTierRecord(userId), null);

  // Watchlist preview — enrich each fullName with derived repo stats so
  // AccountWatchlistPreview can emit the shell.js spark contract per row.
  const wlist = await safe(() => getPrivateWatchlist(userId), null);
  const watchlistFullNames = wlist?.repoFullNames ?? [];
  await safe(async () => {
    await refreshTrendingFromStore();
  }, undefined);
  const watchlistRepos: AccountWatchlistRow[] = watchlistFullNames.map(
    (fullName) => {
      const [owner = "", name = ""] = fullName.split("/");
      let row: AccountWatchlistRow = { fullName, owner, name };
      try {
        const derived = getDerivedRepoByFullName(fullName);
        if (derived) {
          row = {
            ...row,
            language: derived.language ?? null,
            category: derived.categoryId ?? null,
            stars: derived.stars ?? null,
            starsDelta24h: derived.starsDelta24h ?? null,
            sparklineData: derived.sparklineData ?? null,
          };
        }
      } catch {
        // ignored — keep the bare row so the surface still renders
      }
      return row;
    },
  );

  // Activity feed (public profile = ideas + reactions). Falls back to []
  // when there's no DB or no public activity yet.
  const profile = await safe(
    () => getProfile(handle),
    {
      handle,
      exists: false,
      ideas: [],
      shippedRepos: [],
      reactionsGiven: { build: 0, use: 0, buy: 0, invest: 0, total: 0 },
      recentReactions: [],
    },
  );

  // Drops — global recent (no per-user filter exists yet, so we surface
  // recent 7-day events as the "your drops" preview).
  // When recordDropEvent() learns a userId field this query trivially
  // becomes a filter.
  const recentDrops = await safe(
    () => readRecentDropEvents(7 * 24 * 60 * 60 * 1000),
    [],
  );

  // Referral code (always deterministic).
  const referralCode = deriveCode(handle, profileId);
  const referralUrl = `https://trendingrepo.com/r/${referralCode}`;

  // Computed counts for stats strip + sub-nav badges.
  const watchingCount = watchlistFullNames.length;
  const watchingCap = tier.features.maxWatchlistRepos;
  const referralInvites = loaded?.profile.referralCredits ?? 0;
  const dropsCount = recentDrops.length;
  // Alerts: no per-user inbox aggregator yet, so we render an empty inbox
  // until alerts/dispatcher exposes one. Counts pulled from rule limits.
  const alertsCount = 0;

  return (
    <>
      <AccountIdentityHero
        displayName={displayName}
        handle={handle}
        email={email}
        memberSince={memberSince}
        timezone={timezone}
        tier={tier}
        tierRecord={tierRecord}
        watchingCount={watchingCount}
        watchingCap={watchingCap}
      />

      <AccountYouStats
        watching={watchingCount}
        watchingCap={watchingCap}
        alerts24h={alertsCount}
        referralsPaid={referralInvites}
        reposDropped={dropsCount}
        compareRunsThisWeek={0}
      />

      <div className="acc-grid">
        <AccountSubnav
          active={tab}
          watchlistCount={watchingCount}
          alertsCount={alertsCount}
          referralsCount={referralInvites}
          apiKeysCount={0}
          dropsCount={dropsCount}
        />

        <div className="col gap-4">
          {tab === "overview" && (
            <>
              <AccountWatchlistPreview repos={watchlistRepos} />
              <AccountAlertInbox events={[]} />
            </>
          )}
          {tab === "watchlist" && (
            <AccountWatchlistPreview repos={watchlistRepos} expanded />
          )}
          {tab === "alerts" && <AccountAlertInbox events={[]} />}
          {tab === "referrals" && (
            <AccountReferralsCard
              referralUrl={referralUrl}
              invites={referralInvites}
              paidConversions={0}
              creditBalance={0}
            />
          )}
          {tab === "billing" && (
            <AccountBillingPanel tier={tier} tierRecord={tierRecord} />
          )}
          {tab === "api-keys" && <AccountApiKeys keys={[]} />}
          {tab === "drops" && <AccountDropsQueue drops={recentDrops} />}
          {tab === "settings" && (
            <AccountSettingsPanel
              email={email}
              emailDigestEnabled={loaded?.profile.emailAlertsCadence !== "off"}
            />
          )}

          <AccountActivityTimeline
            ideas={profile.ideas}
            recentReactions={profile.recentReactions}
            drops={recentDrops}
          />
        </div>
      </div>
    </>
  );
}
