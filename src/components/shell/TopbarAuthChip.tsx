"use client";

// TopbarAuthChip — the single Clerk-aware account slot in the v6 shell topbar.
//
// Dynamic-imported with `ssr:false` by Topbar and only mounted when the root
// layout reports authEnabled (ClerkProvider present). Uses Clerk's render-gate
// components (<SignedIn>/<SignedOut>) rather than Clerk's user hooks, so it
// stays off the auth-provider-policy hook allow-list while still requiring the
// provider to be mounted (guaranteed by the authEnabled gate in Topbar).
//
// Signed out  → one "Sign in" button that opens the Clerk modal in place.
// Signed in   → alerts bell + Clerk <UserButton/> popover (Manage account / Sign out).

import Link from "next/link";
import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/nextjs";

import { Icon } from "@/components/icon/Icon";

export function TopbarAuthChip() {
  return (
    <>
      <SignedOut>
        <SignInButton mode="modal">
          <button type="button" className="btn primary sm" aria-label="Sign in">
            Sign in
          </button>
        </SignInButton>
      </SignedOut>
      <SignedIn>
        <Link className="icon-btn" href="/account/alerts" aria-label="Alerts">
          <Icon name="bell" size="lg" />
        </Link>
        <UserButton
          afterSignOutUrl="/"
          userProfileMode="navigation"
          userProfileUrl="/account"
        />
      </SignedIn>
    </>
  );
}
