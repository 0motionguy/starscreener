"use client";

// Central client-side auth gate.
//
// One place owns the modal-vs-redirect decision so the 14-file
// `signInUrl`/`signInHref` sprawl that the 2026-05-31 auth wave exposed
// stops happening at lint time. Callers do:
//
//   const gate = useAuthGate();
//   const onClick = () => gate.requireAuth(() => doTheThing());
//
// — and never reach for `window.location.assign("/sign-in")` directly.
// The `check-no-direct-signin-redirect` lint enforces it.

import { useCallback } from "react";

import { openSignInModal } from "@/lib/auth/open-sign-in-modal";
import { useClientSession } from "@/lib/hooks/useClientSession";

export interface AuthGate {
  /** Session probe has resolved; safe to inspect `signedIn`. */
  loaded: boolean;
  /** Anonymous-safe: only `true` once the probe confirms a Clerk userId. */
  signedIn: boolean;
  /**
   * Run `fn` if the visitor is signed in; otherwise open the Clerk modal.
   * If the session hasn't resolved yet, neither happens — callers should
   * treat the click as a no-op rather than fall through optimistically.
   *
   * Returns the modal-open result (`true` = modal opened, `false` = fell
   * back to `/sign-in` redirect because Clerk SDK is absent, `null` =
   * session not yet loaded). Most callers can ignore the return value.
   */
  requireAuth(fn: () => void, redirectUrl?: string): boolean | null;
}

export function useAuthGate(): AuthGate {
  const { loaded, userId } = useClientSession();
  const signedIn = Boolean(userId);

  const requireAuth = useCallback(
    (fn: () => void, redirectUrl?: string): boolean | null => {
      if (!loaded) return null;
      if (!userId) return openSignInModal(redirectUrl);
      fn();
      return true;
    },
    [loaded, userId],
  );

  return { loaded, signedIn, requireAuth };
}
