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

import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { useEffect, useState, type ReactNode } from "react";

interface HeaderAccountLoadedProps {
  fallback: ReactNode;
}

export function HeaderAccountLoaded({ fallback }: HeaderAccountLoadedProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <HeaderAccountLoading />;
  }

  return <HeaderAccountClerkState fallback={fallback} />;
}

function HeaderAccountLoading() {
  return (
    <span
      className="btn-signup"
      aria-label="Loading account"
      aria-busy="true"
    >
      <span>Account</span>
    </span>
  );
}

function HeaderAccountClerkState({ fallback }: HeaderAccountLoadedProps) {
  const { isLoaded, isSignedIn, user } = useUser();

  if (!isLoaded) {
    return <HeaderAccountLoading />;
  }

  if (!isSignedIn || !user) {
    return fallback;
  }

  const label =
    user.fullName ||
    user.username ||
    user.primaryEmailAddress?.emailAddress ||
    user.id;

  return (
    <Link
      href="/you"
      className="profile"
      title="Your account"
      aria-label="Your account"
    >
      <span>{label}</span>
    </Link>
  );
}
