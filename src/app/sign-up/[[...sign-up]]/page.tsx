// Clerk hosted sign-up page.
//
// Referral handoff is a two-stage pipeline:
//   1. <ClerkRefHandoff /> in the root layout calls /api/referrals/intake,
//      which verifies the HMAC-signed HttpOnly `tr_ref` cookie server-side
//      and returns the {code, urlHash} payload. The result is written to
//      localStorage["trRef"] so client-only surfaces can use it.
//   2. <SignUpWithReferral /> below reads localStorage["trRef"] (with a
//      direct `?ref=<code>` URL fallback for the rare case of a direct
//      landing on this route before the intake fetch settled) and passes
//      the payload to Clerk's <SignUp unsafeMetadata={...} /> prop. The
//      webhook then attributes the referral on user.created.

import { getClerkPublishableKey } from "@/lib/auth/clerk-config";
import { SignUpWithReferral } from "@/components/auth/SignUpWithReferral";
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
      <SignUpWithReferral
        signInUrl={signInUrl}
        fallbackRedirectUrl={redirectUrl}
      />
    </div>
  );
}
