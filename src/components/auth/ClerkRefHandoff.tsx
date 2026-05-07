"use client";

// Carries the signed `tr_ref` cookie payload across the Clerk sign-up
// modal so the webhook can credit the right referrer at user.created
// time.
//
// Why this exists:
//   The middleware sets `tr_ref` as HttpOnly, which is correct for
//   security (no JS can read or spoof it) but means the Clerk modal —
//   which runs in client JS — can't see the payload. Clerk also doesn't
//   forward arbitrary cookies into webhook events. So we do the handoff
//   ourselves: GET the verified payload from /api/referrals/intake on
//   mount, then write it to localStorage. A small wrapper around the
//   Clerk <SignUp> component reads localStorage and stuffs it into
//   `unsafeMetadata` via `useSignUp().setUnsafeMetadata({ trRef })`
//   right before submission.
//
// Wiring (the user does this in v2 — the wrapper isn't this file):
//   1. Mount <ClerkRefHandoff /> in the root layout (somewhere always-rendered).
//   2. In a custom <SignUp> page, before calling signUp.create(), read
//      window.localStorage.getItem('trRef'), JSON.parse it, and pass
//      `unsafeMetadata: { trRef }` to the create call.
//   3. The Clerk webhook (route.ts user.created handler) prefers
//      `event.data.unsafe_metadata.trRef.code` over the cookie.
//
// We deliberately don't try to attach this to <ClerkProvider> hooks here —
// the client-side `useSignUp()` integration depends on which sign-up
// surface (modal vs hosted page vs custom form) the operator wires up,
// and that's a v2 decision.

import { useEffect } from "react";

const STORAGE_KEY = "trRef";

interface IntakePayload {
  ok: boolean;
  trRef: {
    code: string;
    urlHash: string;
  } | null;
}

export default function ClerkRefHandoff(): null {
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/referrals/intake", {
          credentials: "include",
          cache: "no-store",
        });
        if (!res.ok) return;
        const body = (await res.json()) as IntakePayload;
        if (cancelled) return;

        if (body.trRef) {
          // Store as JSON so the sign-up integration can pass it straight
          // through to Clerk's `unsafeMetadata` without re-parsing.
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(body.trRef));
        } else {
          // No referral cookie present — clear any stale localStorage value
          // from a previous browsing session. Otherwise an old code could
          // attribute a brand-new sign-up incorrectly.
          window.localStorage.removeItem(STORAGE_KEY);
        }
      } catch {
        // Attribution is best-effort. Never block the sign-up flow on a
        // network blip.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
