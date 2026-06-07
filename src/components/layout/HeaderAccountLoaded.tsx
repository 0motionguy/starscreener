"use client";

// HeaderAccountLoaded — V6-compatible policy stub.
//
// Lazy-loaded by HeaderAccount with `ssr: false`. By the time this module
// evaluates, the root auth provider is guaranteed to be mounted
// (HeaderAccount only imports this when authEnabled is true, and
// authEnabled is the server-resolved `Boolean(clerkPublishableKey)` value
// the root layout passes through). The two-pass `mounted` gate prevents
// any Clerk hook from touching the DOM during the initial hydration tick.
//
// This file is on the auth-provider-policy ALLOW_LIST as a sanctioned
// consumer of Clerk's user hook.

import { useUser } from "@clerk/nextjs";
import { SignInButton, UserButton } from "@clerk/nextjs";
import { useEffect, useState } from "react";

export function HeaderAccountLoaded() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <HeaderAccountLoading />;
  }

  return <HeaderAccountClerkState />;
}

function HeaderAccountLoading() {
  return (
    <span
      className="btn-signup"
      aria-label="Loading account"
      aria-busy="true"
    >
      <span>Sign in</span>
    </span>
  );
}

function HeaderAccountClerkState() {
  const { isLoaded, isSignedIn, user } = useUser();

  if (!isLoaded) {
    return <HeaderAccountLoading />;
  }

  if (!isSignedIn || !user) {
    return (
      <SignInButton mode="modal">
        <button
          type="button"
          className="btn-signup"
          aria-label="Sign in"
          title="Sign in"
        >
          <span>Sign in</span>
        </button>
      </SignInButton>
    );
  }

  return (
    <UserButton
      afterSignOutUrl="/"
      userProfileMode="navigation"
      userProfileUrl="/account"
    />
  );
}
