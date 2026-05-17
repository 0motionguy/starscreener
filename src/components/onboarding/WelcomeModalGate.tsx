"use client";

// Cookie-gated mounting point for the post-signup welcome modal.
//
// Lifecycle:
//   1. Mounted from the root layout (always-on, like ClerkRefHandoff).
//   2. On mount, read the `sb_welcomed` cookie. If present → never show.
//   3. Subscribe to Clerk's `useUser()`. When the user is loaded and signed
//      in AND the cookie is absent, set `show=true` once.
//   4. Any dismiss path writes the `sb_welcomed=1` cookie (90 day expiry,
//      path=/, lax, secure-in-prod) so the modal never appears again on
//      this device.
//
// The cookie strategy is per-device (not per-user). A user who signs in
// from a different browser will see the modal again — acceptable for v1.
// If we ever need per-user tracking, swap to a `profiles.onboarded_at`
// timestamp; the component contract stays the same.
//
// Why client-side instead of server-rendering with cookies(): Clerk's
// session cookie is the source of truth for "signed in", and that's
// only reliably reachable client-side without forcing the entire root
// layout to be dynamic. <ClerkRefHandoff /> already established this
// pattern.

import { useUser } from "@clerk/nextjs";
import { useCallback, useEffect, useState } from "react";

import { WelcomeModal } from "./WelcomeModal";

const COOKIE_NAME = "sb_welcomed";
const COOKIE_MAX_AGE_DAYS = 90;

function hasWelcomedCookie(): boolean {
  if (typeof document === "undefined") return false;
  // Cheap substring scan — avoids parsing every cookie pair just to
  // check existence of one key.
  return document.cookie
    .split(";")
    .some((entry) => entry.trim().startsWith(`${COOKIE_NAME}=`));
}

function setWelcomedCookie(): void {
  if (typeof document === "undefined") return;
  const maxAgeSeconds = COOKIE_MAX_AGE_DAYS * 24 * 60 * 60;
  // Secure flag only in production — locally we serve over http://.
  // window.location.protocol is the most reliable signal because
  // NODE_ENV isn't available client-side in standalone builds.
  const isHttps =
    typeof window !== "undefined" && window.location.protocol === "https:";
  const secureFragment = isHttps ? "; Secure" : "";
  document.cookie = `${COOKIE_NAME}=1; Max-Age=${maxAgeSeconds}; Path=/; SameSite=Lax${secureFragment}`;
}

interface WelcomeModalGateProps {
  /**
   * Server-resolved flag mirroring `Boolean(getClerkPublishableKey())`.
   * Required so Clerk hooks below never execute on environments where
   * `<ClerkProvider>` did not mount (Vercel Production with only
   * `pk_test_*` keys; previews with the key disabled). The hook would
   * otherwise throw "useAuth can only be used within the <ClerkProvider />".
   *
   * See `src/lib/__tests__/auth-provider-policy.test.ts` ("only known
   * callers may import Clerk hooks") — this file is on the allow-list
   * because it accepts this prop and short-circuits before invoking
   * `useUser()`.
   */
  authEnabled: boolean;
  // Optional override for the displayed name. When null/omitted the
  // gate pulls from Clerk's `useUser()`. Provided as an escape hatch
  // for the server to seed an SSR-friendly value if we ever need it,
  // but for now the gate is fully client-driven.
  displayName?: string | null;
}

export function WelcomeModalGate({
  authEnabled,
  displayName: displayNameProp,
}: WelcomeModalGateProps) {
  if (!authEnabled) return null;
  return (
    <WelcomeModalGateInner displayName={displayNameProp} />
  );
}

// Inner component isolates the Clerk hook call behind the `authEnabled`
// gate above. Same render contract as the previous monolithic version —
// the split is purely so React only invokes `useUser()` when we know
// ClerkProvider is mounted.
function WelcomeModalGateInner({
  displayName: displayNameProp,
}: {
  displayName?: string | null;
}) {
  const { isLoaded, isSignedIn, user } = useUser();
  const [show, setShow] = useState(false);
  // Track whether we've already evaluated the gate condition for this
  // session. Without this guard, a user dismissing the modal would re-
  // trigger `setShow(true)` on the next render before the cookie write
  // had a chance to propagate.
  const [evaluated, setEvaluated] = useState(false);

  useEffect(() => {
    if (!isLoaded || evaluated) return;
    if (isSignedIn && !hasWelcomedCookie()) {
      setShow(true);
    }
    setEvaluated(true);
  }, [isLoaded, isSignedIn, evaluated]);

  const handleDismiss = useCallback(() => {
    setWelcomedCookie();
    setShow(false);
  }, []);

  if (!show) return null;

  // Pull display name from Clerk if not provided. Mirrors the precedence
  // used in HeaderAccountLoaded.tsx so the modal greets the user with
  // the same string they see on their profile chip.
  const resolvedDisplayName =
    displayNameProp ??
    user?.firstName ??
    user?.fullName ??
    user?.username ??
    null;

  return (
    <WelcomeModal
      displayName={resolvedDisplayName}
      show={show}
      onDismiss={handleDismiss}
    />
  );
}

export default WelcomeModalGate;
