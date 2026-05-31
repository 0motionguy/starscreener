"use client";

// HeaderAccount — V6-compatible policy stub.
//
// The legacy V4 header chrome was archived during the 2026-05-19 UI rebuild
// (commit 8fdc0af). The v6 shell mounts auth presentation through
// src/components/shell/Topbar.tsx instead. This file exists as the
// canonical client-only auth boundary required by the
// auth-provider-policy test sentinel and as the allow-listed Clerk-hook
// loader entry point. It does NOT render legacy V4 chrome.
//
// Pattern (preserved from V4):
//   - Server-resolved `authEnabled` prop comes from the root layout's
//     getClerkPublishableKey() call. The component never inspects
//     NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY directly — that variable is set
//     even when Clerk fails-closed in production, which would crash any
//     Clerk-hook consumer mounted under it.
//   - When auth is disabled, returns the signed-out CTA link.
//   - When auth is enabled, lazy-loads HeaderAccountLoaded with
//     `ssr: false` so the Clerk hook never executes during prerender.

import dynamic from "next/dynamic";
import { AuthGateButton } from "@/components/auth/AuthGateButton";

interface HeaderAccountProps {
  authEnabled: boolean;
}

function SignedOutAccountLink() {
  return (
    <AuthGateButton
      className="btn-signup"
      title="Sign in"
      ariaLabel="Sign in"
    >
      <span>Sign in</span>
    </AuthGateButton>
  );
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

const HeaderAccountLoaded = dynamic(
  () =>
    import("@/components/layout/HeaderAccountLoaded").then(
      (mod) => mod.HeaderAccountLoaded,
    ),
  { ssr: false, loading: HeaderAccountLoading },
);

export function HeaderAccount({ authEnabled }: HeaderAccountProps) {
  if (!authEnabled) {
    return <SignedOutAccountLink />;
  }

  return <HeaderAccountLoaded fallback={<SignedOutAccountLink />} />;
}
