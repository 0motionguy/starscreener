// Clerk hosted sign-up page — full-page, branded.
//
// Catch-all route: covers /sign-up, /sign-up/verify-email-address, etc.
// Required by Clerk's <SignUp /> component when used as a hosted page.
//
// Referral handoff:
//   The <ClerkRefHandoff /> mounted in root layout already fetches the
//   signed `tr_ref` cookie from /api/referrals/intake on every page mount
//   and stores it in localStorage as `trRef`. The Clerk webhook handler
//   at src/app/api/webhooks/clerk/route.ts reads it via the user.created
//   event's `unsafe_metadata.trRef` and credits the referrer.
//
//   The hosted form is rendered through <ClerkAuthForm />, which reads
//   the verified localStorage handoff and passes it into Clerk's
//   `unsafeMetadata` prop. The webhook then credits the signup from
//   `unsafe_metadata.trRef`.

import { ClerkProvider } from "@clerk/nextjs";
import { ClerkAuthForm } from "@/components/auth/ClerkAuthForm";
import { clerkAppearance } from "@/lib/auth/clerk-appearance";
import { getClerkPublishableKey } from "@/lib/auth/clerk-config";
import {
  buildAuthHref,
  getAuthRedirectFromSearchParams,
  type AuthSearchParams,
} from "@/lib/auth/redirect-url";

export const metadata = {
  title: "Sign up",
  description: "Sign up to TrendingRepo — track agents, MCPs, repos",
};

interface SignUpPageProps {
  searchParams?: Promise<AuthSearchParams>;
}

export default async function Page({ searchParams }: SignUpPageProps) {
  const clerkPublishableKey = getClerkPublishableKey();
  const params = searchParams ? await searchParams : undefined;
  const redirectUrl = getAuthRedirectFromSearchParams(params);
  const signInUrl = buildAuthHref("/sign-in", redirectUrl);

  return (
    <div className="flex min-h-[calc(100vh-64px)] items-center justify-center px-4 py-12">
      {clerkPublishableKey ? (
        <ClerkProvider
          publishableKey={clerkPublishableKey}
          appearance={clerkAppearance}
        >
          <ClerkAuthForm
            mode="sign-up"
            signInUrl={signInUrl}
            fallbackRedirectUrl={redirectUrl}
          />
        </ClerkProvider>
      ) : (
        <AuthUnavailable action="sign up" />
      )}
    </div>
  );
}

function AuthUnavailable({ action }: { action: string }) {
  return (
    <div className="max-w-md rounded border border-white/10 bg-black/30 p-6 text-center">
      <h1 className="text-lg font-semibold">Auth unavailable</h1>
      <p className="mt-2 text-sm text-white/70">
        Clerk is not configured for this environment, so {action} is disabled.
      </p>
    </div>
  );
}
