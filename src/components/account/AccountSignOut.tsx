"use client";

// AccountSignOut — coordinated sign-out for the account identity hero.
//
// Clerk's <SignOutButton> (a render-wrapper component, NOT a Clerk hook, so it
// stays off the auth-provider hook allow-list) clears Clerk's own cookies and
// redirects home. We ALSO clear the app's `ss_user` session cookie in the same
// gesture so a tier-carrying identity can't linger after sign-out. The DELETE
// uses `keepalive: true` so it completes even as Clerk navigates away — the
// redirect would otherwise cancel an in-flight fetch, which is exactly the
// race that left the stale cookie behind before.
//
// Defense-in-depth: the real authorization boundary is server-side. Paid /
// user-scoped routes re-verify the live Clerk session for cookie principals
// via `resolveUserPrincipal`, so a stale `ss_user` cookie is inert for
// authorization regardless of whether this clear lands. This just avoids
// leaving an orphaned cookie in the browser.
//
// Only ever rendered inside /account/*, which is Clerk-gated, so the provider
// is always mounted.

import { SignOutButton } from "@clerk/nextjs";
import { Icon } from "@/lib/icons";

function clearSessionCookieBestEffort(): void {
  void fetch("/api/auth/session", {
    method: "DELETE",
    credentials: "include",
    keepalive: true,
  }).catch(() => {
    // Best-effort; the server-side guard is the real boundary (see header).
  });
}

export function AccountSignOut() {
  return (
    <SignOutButton redirectUrl="/">
      <button
        type="button"
        className="btn ghost"
        aria-label="Sign out"
        onClick={clearSessionCookieBestEffort}
      >
        <Icon name="external" size="md" />
        Sign out
      </button>
    </SignOutButton>
  );
}
