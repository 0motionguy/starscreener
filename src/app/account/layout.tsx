// /account/* shared layout — renders the slim identity hero above every
// account surface (overview, alerts, referrals, api-keys, drops, settings).
// The strict Clerk gate lives in loadAccountContext(); it redirects anon
// visitors to /sign-in before any child renders. loadAccountContext() is
// cache()-wrapped so the layout and the child page share one set of reads.

import type { ReactNode } from "react";

import { AccountIdentityHero } from "@/components/account/AccountIdentityHero";
import { loadAccountContext } from "@/lib/account/load";
import { getClerkPublishableKey } from "@/lib/auth/clerk-config";

export const dynamic = "force-dynamic";

export default async function AccountLayout({
  children,
}: {
  children: ReactNode;
}) {
  const ctx = await loadAccountContext();
  // Server-resolved: only render Clerk components (sign-out) when a provider
  // is actually mounted. Mirrors the HeaderAccount authEnabled guard.
  const authEnabled = Boolean(getClerkPublishableKey());

  return (
    <>
      <AccountIdentityHero
        displayName={ctx.displayName}
        handle={ctx.handle}
        email={ctx.email}
        memberSince={ctx.memberSince}
        tier={ctx.tier}
        watchingCount={ctx.watchingCount}
        watchingCap={ctx.watchingCap}
        authEnabled={authEnabled}
      />
      {children}
    </>
  );
}
