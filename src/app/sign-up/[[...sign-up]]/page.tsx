// Clerk hosted sign-up page — minimal stub during UI v4 teardown.
//
// Referral handoff still works: <ClerkRefHandoff /> in root layout reads
// the signed `tr_ref` cookie and stores it in localStorage as `trRef`.
// To restore unsafe_metadata referral threading, the rebuild needs to
// reintroduce the wrapper that reads localStorage and passes it into
// Clerk's `unsafeMetadata` prop (this stub does NOT thread the referral
// into Clerk — direct webhook will still credit if user_metadata is set
// via Clerk webhook by other means).

import { SignUp } from "@clerk/nextjs";
import { getClerkPublishableKey } from "@/lib/auth/clerk-config";
import {
  buildAuthHref,
  getAuthRedirectFromSearchParams,
  type AuthSearchParams,
} from "@/lib/auth/redirect-url";

export const metadata = {
  title: "Sign up",
  description: "Sign up to TrendingRepo: track agents, MCPs, repos",
};

interface SignUpPageProps {
  searchParams?: Promise<AuthSearchParams>;
}

export default async function Page({ searchParams }: SignUpPageProps) {
  const clerkPublishableKey = getClerkPublishableKey();
  const params = searchParams ? await searchParams : undefined;
  const redirectUrl = getAuthRedirectFromSearchParams(params);
  const signInUrl = buildAuthHref("/sign-in", redirectUrl);

  if (!clerkPublishableKey) {
    return (
      <div
        style={{
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 48,
          color: "#e6e6e6",
          textAlign: "center",
        }}
      >
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>
            Sign-up unavailable
          </h1>
          <p style={{ opacity: 0.6 }}>
            Authentication is temporarily disabled. Please try again later.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 48,
      }}
    >
      <SignUp signInUrl={signInUrl} fallbackRedirectUrl={redirectUrl} />
    </div>
  );
}
