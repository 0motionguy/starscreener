"use client";

// Client wrapper around Clerk's <SignUp /> that threads referral
// attribution through `unsafeMetadata.trRef`.
//
// Why this is a separate component from <ClerkRefHandoff />:
//   - <ClerkRefHandoff /> (root layout, idle-mounted) does the
//     cookie → localStorage half of the handoff: it calls
//     /api/referrals/intake which verifies the HMAC-signed HttpOnly
//     `tr_ref` cookie server-side and returns the {code, urlHash} payload.
//     The result is stored in localStorage["trRef"] as JSON.
//   - This component does the localStorage → Clerk half: on mount it
//     reads localStorage["trRef"] (and falls back to a `?ref=<code>` query
//     param for the rare case of a direct landing on /sign-up?ref=...),
//     parses with the shared validator, and passes the result to
//     `<SignUp unsafeMetadata={...} />`.
//
// Splitting the two halves lets the cookie→localStorage write happen
// during browser-idle on any page (eagerly priming attribution before
// the user clicks "sign up"), while the localStorage→Clerk read only
// runs on the sign-up surface itself.
//
// Why not read the cookie directly here:
//   The `tr_ref` cookie is HttpOnly (middleware sets it that way for
//   anti-spoof — see src/middleware.ts:142). document.cookie cannot see
//   it. Any "read the cookie payload" code in a client component would
//   silently return null and look like a bug. The HMAC verification
//   must happen server-side via /api/referrals/intake.
//
// The webhook (src/app/api/webhooks/clerk/route.ts handleUserCreated)
// prefers unsafeMetadata.trRef.code over the cookie when both are
// present, so this client-thread is the authoritative attribution path
// once it succeeds.

import { useEffect, useMemo, useState } from "react";
import { SignUp } from "@clerk/nextjs";

import {
  AUTH_REFERRAL_STORAGE_KEY,
  parseClerkReferralUnsafeMetadata,
  type ClerkReferralUnsafeMetadata,
} from "@/lib/auth/referral-metadata";

// `?ref=` codes must match the same shape middleware enforces, so a
// direct hit on /sign-up?ref=BAD-VALUE doesn't manage to ship an
// untrusted code into Clerk metadata.
const REF_CODE_PATTERN = /^[A-Za-z0-9_-]{3,32}$/;

type SignUpProps = React.ComponentProps<typeof SignUp>;

export function SignUpWithReferral(props: SignUpProps) {
  const [metadata, setMetadata] = useState<
    ClerkReferralUnsafeMetadata | undefined
  >(undefined);

  // Read on mount — never re-runs. Sign-up is a one-shot surface; the
  // referral code is either there at first paint or never gets used.
  useEffect(() => {
    if (typeof window === "undefined") return;

    // 1. Preferred path: <ClerkRefHandoff /> has already verified the
    //    signed cookie via /api/referrals/intake and written it here.
    const stored = window.localStorage.getItem(AUTH_REFERRAL_STORAGE_KEY);
    const fromStorage = parseClerkReferralUnsafeMetadata(stored);
    if (fromStorage) {
      setMetadata(fromStorage);
      return;
    }

    // 2. Fallback: direct landing on /sign-up?ref=<code> before the
    //    intake handoff completed. The middleware will already be
    //    writing the signed cookie on this same request, but its
    //    payload won't be in localStorage until the next page load.
    //    Reading the param here keeps that single click from losing
    //    attribution.
    try {
      const params = new URLSearchParams(window.location.search);
      const ref = params.get("ref");
      if (ref && REF_CODE_PATTERN.test(ref)) {
        setMetadata({ trRef: { code: ref } });
      }
    } catch {
      // URL parsing should never fail, but never break the sign-up
      // surface if the browser hands us something unexpected.
    }
  }, []);

  // Memoise the prop so React doesn't see a fresh object on every
  // render — Clerk's <SignUp /> can re-initialise if unsafeMetadata
  // identity changes mid-flow.
  const unsafeMetadata = useMemo(() => metadata, [metadata]);

  return <SignUp {...props} unsafeMetadata={unsafeMetadata} />;
}
