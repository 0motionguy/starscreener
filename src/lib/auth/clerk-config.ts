// Clerk publishable key resolver shared between layout, middleware, and
// sign-in / sign-up pages. Returns undefined when auth is not safe to mount,
// so callers can render a degraded "Auth unavailable" surface instead of
// throwing during build or showing a development auth instance in production.

// Deploy-agnostic production check. The old gate keyed off
// `VERCEL_ENV === "production"`, which never fires on the actual
// production deploy (HOSTUP Docker tenant behind Cloudflare) — the
// live-key enforcement was dead code there. NODE_ENV covers every
// deploy target; CLERK_ALLOW_TEST_KEYS=1 is the explicit escape hatch
// for staging-style environments that legitimately run production
// builds against a Clerk development instance.
import "server-only";

function isProductionRuntime(): boolean {
  return (
    process.env.NODE_ENV === "production" &&
    process.env.CLERK_ALLOW_TEST_KEYS !== "1"
  );
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

  if (isProductionRuntime() && !hasLiveClerkKeyPair()) {
    console.warn(
      "[auth] Clerk disabled: production requires NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_* and CLERK_SECRET_KEY=sk_live_* (set CLERK_ALLOW_TEST_KEYS=1 to override in staging).",
    );
    return undefined;
  }

  return key;
}
