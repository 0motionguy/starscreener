"use client";

// AccountSignOut — Clerk sign-out control for the account identity hero.
// Uses Clerk's <SignOutButton> render-wrapper (a component, not a Clerk hook),
// so it stays off the auth-provider-policy hook allow-list. Only ever rendered
// inside /account/*, which is Clerk-gated, so the provider is always mounted.

import { SignOutButton } from "@clerk/nextjs";
import { Icon } from "@/lib/icons";

export function AccountSignOut() {
  return (
    <SignOutButton redirectUrl="/">
      <button type="button" className="btn ghost" aria-label="Sign out">
        <Icon name="external" size="md" />
        Sign out
      </button>
    </SignOutButton>
  );
}
