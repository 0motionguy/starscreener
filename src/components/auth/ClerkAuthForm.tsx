"use client";

// ClerkAuthForm — V6-compatible policy stub.
//
// Mounted only on /sign-in and /sign-up, which both live under the
// root layout's <ClerkProvider>. The component reads the referral
// metadata the marketing site stashes in localStorage (so the next
// signup credits the referrer) and waits for a client-only `ready`
// flag before rendering Clerk's hosted form. The skeleton fills the
// first paint so the layout doesn't jump when the real form mounts.
//
// This file is on the auth-provider-policy ALLOW_LIST as a sanctioned
// consumer of `useUser()` / `useAuth()` via Clerk's own components.

import { SignIn, SignUp } from "@clerk/nextjs";
import { useEffect, useState } from "react";

import {
  AUTH_REFERRAL_STORAGE_KEY,
  parseClerkReferralUnsafeMetadata,
  type ClerkReferralUnsafeMetadata,
} from "@/lib/auth/referral-metadata";

interface ClerkAuthFormProps {
  mode: "sign-in" | "sign-up";
  fallbackRedirectUrl: string;
  signInUrl?: string;
  signUpUrl?: string;
}

interface ReferralMetadataState {
  metadata?: ClerkReferralUnsafeMetadata;
  ready: boolean;
}

function useReferralUnsafeMetadata(): ReferralMetadataState {
  const [state, setState] = useState<ReferralMetadataState>({
    ready: false,
  });

  useEffect(() => {
    const raw = window.localStorage.getItem(AUTH_REFERRAL_STORAGE_KEY);
    const parsed = parseClerkReferralUnsafeMetadata(raw);
    if (raw && !parsed) {
      window.localStorage.removeItem(AUTH_REFERRAL_STORAGE_KEY);
    }
    setState({ metadata: parsed, ready: true });
  }, []);

  return state;
}

function ClerkAuthSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading account form"
      className="w-full max-w-md rounded border border-[#222a32] bg-[#0b0d0f] p-8"
    >
      <span className="sr-only">Loading account form</span>
      <div className="mx-auto mb-6 h-6 w-40 rounded bg-[#151a20]" />
      <div className="space-y-3">
        <div className="h-11 rounded border border-[#222a32] bg-[#101418]" />
        <div className="h-11 rounded border border-[#222a32] bg-[#101418]" />
        <div className="h-11 rounded bg-[#ff6b35]/35" />
      </div>
    </div>
  );
}

export function ClerkAuthForm({
  mode,
  fallbackRedirectUrl,
  signInUrl,
  signUpUrl,
}: ClerkAuthFormProps) {
  const { metadata, ready } = useReferralUnsafeMetadata();

  if (!ready) {
    return <ClerkAuthSkeleton />;
  }

  if (mode === "sign-up") {
    return (
      <SignUp
        signInUrl={signInUrl}
        fallbackRedirectUrl={fallbackRedirectUrl}
        unsafeMetadata={metadata}
      />
    );
  }

  return (
    <SignIn
      signUpUrl={signUpUrl}
      fallbackRedirectUrl={fallbackRedirectUrl}
      unsafeMetadata={metadata}
      withSignUp
    />
  );
}
