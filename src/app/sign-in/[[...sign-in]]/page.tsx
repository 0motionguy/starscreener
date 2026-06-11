// Clerk hosted sign-in page — minimal stub during UI v4 teardown.
//
// Renders Clerk's <SignIn /> component directly with appearance inherited
// from the auth provider mounted at the root layout. The custom wrappers
// (ClerkAuthForm, AuthUnavailable, FunnelMount) lived in src/components/
// and have been archived. The rebuild can re-introduce funnel tracking +
// custom fallback UI on top of this stub.

import { SignIn } from "@clerk/nextjs";
import { getClerkPublishableKey } from "@/lib/auth/clerk-config";
import {
  buildAuthHref,
  getAuthRedirectFromSearchParams,
  type AuthSearchParams,
} from "@/lib/auth/redirect-url";

export const metadata = {
  title: "Sign in",
  description: "Sign in to TrendingRepo",
};

interface SignInPageProps {
  searchParams?: Promise<AuthSearchParams>;
}

export default async function Page({ searchParams }: SignInPageProps) {
  const clerkPublishableKey = getClerkPublishableKey();
  const params = searchParams ? await searchParams : undefined;
  const redirectUrl = getAuthRedirectFromSearchParams(params);
  const signUpUrl = buildAuthHref("/sign-up", redirectUrl);

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
            Sign-in unavailable
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
      <SignIn
        signUpUrl={signUpUrl}
        fallbackRedirectUrl={redirectUrl}
        signUpFallbackRedirectUrl={redirectUrl}
      />
    </div>
  );
}
