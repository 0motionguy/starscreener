// Clerk hosted sign-in page: full-page, branded.
//
// Catch-all route: covers /sign-in, /sign-in/factor-one, /sign-in/sso-callback, etc.
// Required by Clerk's <SignIn /> component when used as a hosted page (vs modal).
//
// Why a hosted page in addition to the modal:
//   - Better SEO landing experience (Google can index /sign-in)
//   - Cleaner deep-link target for the header CTA: /sign-in?redirect_url=/u/foo
//   - Required for /sign-up to function as a route (paired)
//
// The modal-based <SignInButton mode="modal" /> still works elsewhere; this
// just gives operators a route-based fallback.

import { AuthUnavailable } from "@/components/auth/AuthUnavailable";
import { ClerkAuthForm } from "@/components/auth/ClerkAuthForm";
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

  return (
    <div className="flex min-h-[calc(100vh-64px)] items-center justify-center px-4 py-12">
      {clerkPublishableKey ? (
        <ClerkAuthForm
          mode="sign-in"
          signUpUrl={signUpUrl}
          fallbackRedirectUrl={redirectUrl}
        />
      ) : (
        <AuthUnavailable action="sign in" />
      )}
    </div>
  );
}
