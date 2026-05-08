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
//   For now, Clerk's stock <SignUp /> component does NOT automatically
//   propagate localStorage trRef into unsafe_metadata. A small client
//   wrapper hooking into useSignUp() will be added in a follow-up; until
//   then, the cookie-based referral path in the webhook handler still
//   works (intake API sets the HttpOnly cookie that the webhook reads
//   server-side).

import { SignUp } from "@clerk/nextjs";
import { getClerkPublishableKey } from "@/lib/auth/clerk-config";

export const metadata = {
  title: "Sign up",
  description: "Sign up to TrendingRepo — track agents, MCPs, repos",
};

export default function Page() {
  const clerkPublishableKey = getClerkPublishableKey();
  return (
    <div className="flex min-h-[calc(100vh-64px)] items-center justify-center px-4 py-12">
      {clerkPublishableKey ? <SignUp /> : <AuthUnavailable action="sign up" />}
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
