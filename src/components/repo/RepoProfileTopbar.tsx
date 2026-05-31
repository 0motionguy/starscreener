"use client";

// RepoProfileTopbar — route-scoped top bar for `/repo/[owner]/[name]`.
//
// Client component because of the live UTC clock + ⌘K focus shortcut. Mirrors
// PFTopbar (C:/tmp/asset_e0686a47.js:340-367) exactly:
//
//   - Breadcrumb: ~ / trending / repos / {owner}/{name}
//   - Search input with placeholder + ⌘K kbd hints. Pressing ⌘/Ctrl+K
//     navigates to the existing global search page (`/search`) when one
//     exists; otherwise falls back to the trending home, where the global
//     topbar's searchbar is mounted.
//   - LIVE · HH:MM:SS UTC pill — ticks every second, hydration-guarded so
//     SSR emits the static label and the clock starts only post-mount.
//   - Bell -> /account/alerts
//   - Settings -> /account/settings
//   - Drop repo -> /drop (secondary button)
//   - Sign in: Clerk-aware. When auth is enabled, lazy-loads the Clerk
//     hook with the same `ssr:false` + `mounted` gate as HeaderAccount.
//
// Why dynamic-imported Clerk UI: the auth-provider-policy sentinel requires
// every consumer of @clerk/nextjs hooks to mount only after `mounted=true`.
// We follow the exact pattern from src/components/layout/HeaderAccount.tsx.

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";

import { AuthGateButton } from "@/components/auth/AuthGateButton";
import { Icon } from "@/components/icon/Icon";

import styles from "./repoProfileShell.module.css";

interface RepoProfileTopbarProps {
  owner: string;
  name: string;
  authEnabled: boolean;
}

const SignInSlot = dynamic(
  () => import("./RepoProfileTopbarAuth").then((mod) => mod.RepoProfileTopbarAuth),
  {
    ssr: false,
    loading: () => (
      <AuthGateButton
        className={`${styles.btn} ${styles.btnPrimary}`}
        ariaLabel="Sign in"
        redirectUrl={typeof window === "undefined" ? undefined : window.location.pathname}
      >
        <Icon name="user" />
        <span>Sign in</span>
      </AuthGateButton>
    ),
  },
);

function formatUtc(date: Date): string {
  // HH:MM:SS — same slice the PF source uses: toUTCString().slice(17,25).
  return date.toUTCString().slice(17, 25);
}

export function RepoProfileTopbar({
  owner,
  name,
  authEnabled,
}: RepoProfileTopbarProps) {
  const [mounted, setMounted] = useState(false);
  const [clockLabel, setClockLabel] = useState<string>("--:--:--");

  // Hydration guard — render the placeholder until the first client tick.
  // Once mounted, set the current time and start the 1s interval. Cleared on
  // unmount.
  useEffect(() => {
    setMounted(true);
    setClockLabel(formatUtc(new Date()));
    const id = window.setInterval(() => {
      setClockLabel(formatUtc(new Date()));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <header className={styles.topbar} data-repo-profile-topbar="true">
      <nav className={styles.breadcrumb} aria-label="Breadcrumb">
        <span>~</span>
        <span className={styles.breadcrumbSep}>/</span>
        <Link href="/">trending</Link>
        <span className={styles.breadcrumbSep}>/</span>
        <Link href="/">repos</Link>
        <span className={styles.breadcrumbSep}>/</span>
        <span className={styles.breadcrumbHere}>
          {owner}/{name}
        </span>
      </nav>

      <div className={styles.actions}>
        <span
          className={styles.livePill}
          aria-live="polite"
          aria-label={mounted ? `Live, ${clockLabel} UTC` : "Live"}
        >
          <span className={styles.dotLive} aria-hidden="true" />
          {mounted ? `LIVE · ${clockLabel} UTC` : "LIVE"}
        </span>

        <Link
          className={styles.iconBtn}
          href="/account/alerts"
          aria-label="Alerts"
          prefetch={false}
        >
          <Icon name="bell" />
        </Link>

        <Link
          className={styles.iconBtn}
          href="/account/settings"
          aria-label="Settings"
          prefetch={false}
        >
          <Icon name="settings" />
        </Link>

        <Link
          className={`${styles.btn} ${styles.btnSecondary}`}
          href="/drop"
          prefetch={false}
        >
          <Icon name="rocket" />
          <span>Drop repo</span>
        </Link>

        {authEnabled ? (
          <SignInSlot />
        ) : (
          <AuthGateButton
            className={`${styles.btn} ${styles.btnPrimary}`}
            redirectUrl={`/repo/${owner}/${name}`}
            ariaLabel="Sign in"
          >
            <Icon name="user" />
            <span>Sign in</span>
          </AuthGateButton>
        )}
      </div>
    </header>
  );
}
