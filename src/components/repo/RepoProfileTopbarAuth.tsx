"use client";

// RepoProfileTopbarAuth — Clerk-aware sign-in slot for the route-scoped
// topbar. Mirrors src/components/layout/HeaderAccountLoaded.tsx in policy:
// dynamic-imported with `ssr:false` by the parent, then internally gates
// hook execution behind a `mounted` flag so Clerk never touches the DOM
// during the initial hydration tick.
//
// On the auth-provider-policy allow-list as a sanctioned consumer of
// @clerk/nextjs hooks (same justification as HeaderAccountLoaded).

import Link from "next/link";
import { SignInButton, useUser } from "@clerk/nextjs";
import { useEffect, useState } from "react";

import { Icon } from "@/components/icon/Icon";

import styles from "./repoProfileShell.module.css";

function SignInPrimary() {
  return (
    <SignInButton mode="modal">
      <button
        type="button"
        className={`${styles.btn} ${styles.btnPrimary}`}
        aria-label="Sign in"
      >
        <Icon name="user" />
        <span>Sign in</span>
      </button>
    </SignInButton>
  );
}

export function RepoProfileTopbarAuth() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <Link
        href="/sign-in"
        className={`${styles.btn} ${styles.btnPrimary}`}
        aria-busy="true"
      >
        <Icon name="user" />
        <span>Sign in</span>
      </Link>
    );
  }

  return <ClerkState />;
}

function ClerkState() {
  const { isLoaded, isSignedIn, user } = useUser();

  if (!isLoaded) {
    return (
      <Link
        href="/sign-in"
        className={`${styles.btn} ${styles.btnPrimary}`}
        aria-busy="true"
      >
        <Icon name="user" />
        <span>Sign in</span>
      </Link>
    );
  }

  if (!isSignedIn || !user) {
    return <SignInPrimary />;
  }

  const label =
    user.firstName ||
    user.username ||
    user.primaryEmailAddress?.emailAddress?.split("@")[0] ||
    "Account";

  return (
    <Link
      href="/account"
      className={`${styles.btn} ${styles.btnSecondary}`}
      aria-label="Your account"
    >
      <Icon name="user" />
      <span>{label}</span>
    </Link>
  );
}
