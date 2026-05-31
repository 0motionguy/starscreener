// Clerk publishable key resolver shared between layout, middleware, and
// sign-in / sign-up pages. Returns undefined when auth is not safe to mount,
// so callers can render a degraded "Auth unavailable" surface instead of
// throwing during build or showing a development auth instance in production.

import "server-only";

function isVercelProduction(): boolean {
  return process.env.VERCEL_ENV === "production";
}

function hasLiveClerkKeyPair(): boolean {
  const publicKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim();
  const secretKey = process.env.CLERK_SECRET_KEY?.trim();
  return Boolean(
    publicKey?.startsWith("pk_live_") && secretKey?.startsWith("sk_live_"),
  );
}

export function getClerkPublishableKey(): string | undefined {
  const key = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim();
  if (!key) return undefined;

  if (isVercelProduction() && !hasLiveClerkKeyPair()) {
    console.warn(
      "[auth] Clerk disabled: Vercel Production requires NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_* and CLERK_SECRET_KEY=sk_live_*.",
    );
    return undefined;
  }

  return key;
}
