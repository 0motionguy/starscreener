"use client";

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

function useReferralUnsafeMetadata(): ClerkReferralUnsafeMetadata | undefined {
  const [metadata, setMetadata] = useState<
    ClerkReferralUnsafeMetadata | undefined
  >(undefined);

  useEffect(() => {
    const raw = window.localStorage.getItem(AUTH_REFERRAL_STORAGE_KEY);
    const parsed = parseClerkReferralUnsafeMetadata(raw);
    if (raw && !parsed) {
      window.localStorage.removeItem(AUTH_REFERRAL_STORAGE_KEY);
    }
    setMetadata(parsed);
  }, []);

  return metadata;
}

export function ClerkAuthForm({
  mode,
  fallbackRedirectUrl,
  signInUrl,
  signUpUrl,
}: ClerkAuthFormProps) {
  const unsafeMetadata = useReferralUnsafeMetadata();

  if (mode === "sign-up") {
    return (
      <SignUp
        signInUrl={signInUrl}
        fallbackRedirectUrl={fallbackRedirectUrl}
        unsafeMetadata={unsafeMetadata}
      />
    );
  }

  return (
    <SignIn
      signUpUrl={signUpUrl}
      fallbackRedirectUrl={fallbackRedirectUrl}
      unsafeMetadata={unsafeMetadata}
      withSignUp
    />
  );
}
