// Clerk publishable key resolver shared between layout, middleware, and
// sign-in / sign-up pages. Returns undefined when the env var is unset or
// blank, so callers can render a degraded "Auth unavailable" surface
// instead of throwing during build (CI / local without Clerk keys).

export function getClerkPublishableKey(): string | undefined {
  const key = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim();
  return key ? key : undefined;
}
