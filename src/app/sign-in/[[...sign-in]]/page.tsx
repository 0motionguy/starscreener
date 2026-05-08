// Clerk hosted sign-in page — full-page, branded.
//
// Catch-all route: covers /sign-in, /sign-in/factor-one, /sign-in/sso-callback, etc.
// Required by Clerk's <SignIn /> component when used as a hosted page (vs modal).
//
// Why a hosted page in addition to the modal:
//   • Better SEO landing experience (Google can index /sign-in)
//   • Cleaner deep-link target for the header CTA — /sign-in?redirect_url=/u/foo
//   • Required for /sign-up to function as a route (paired)
//
// The modal-based <SignInButton mode="modal" /> still works elsewhere; this
// just gives operators a route-based fallback.

import { SignIn } from "@clerk/nextjs";
import { getClerkPublishableKey } from "@/lib/auth/clerk-config";

export const metadata = {
  title: "Sign in",
  description: "Sign in to TrendingRepo",
};

// Clerk's component handles auth flow + theme via ClerkProvider context in
// root layout. No appearance overrides needed; theme inherits from provider.
export default function Page() {
  const clerkPublishableKey = getClerkPublishableKey();

  return (
    <div className="flex min-h-[calc(100vh-64px)] items-center justify-center px-4 py-12">
      {clerkPublishableKey ? <SignIn /> : <AuthUnavailable action="sign in" />}
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
