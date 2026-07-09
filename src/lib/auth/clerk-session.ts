// Clerk session probe for routes that decide their own anonymous-vs-
// signed-in shape (session mint, checkout, billing portal).
//
// Why not import `auth` statically: several of this repo's node:test
// suites import route modules directly; a static `@clerk/nextjs/server`
// import would drag Clerk's runtime into every such test. The dynamic
// import keeps Clerk out of the module graph until a request actually
// needs it, and the try/catch turns every Clerk failure mode — missing
// middleware context, missing keys, network — into "signed out" instead
// of a 500. Routes using this helper MUST be routed through
// `middlewareWithClerk` (see src/middleware.ts isClerkSessionRoute),
// otherwise auth() always reports signed-out.
//
// For UI surfaces that need the full profile row, keep using
// `getUser()/requireUser()` from ./server — this helper is deliberately
// DB-free so the session route can mint cookies without a Postgres
// dependency.

import "server-only";

type ClerkAuthProbe = () => Promise<string | null>;

let probeOverride: ClerkAuthProbe | null = null;
let warnedOnce = false;

/** Test-only: replace the Clerk probe. Pass null to restore. */
export function _setClerkAuthProbeForTests(probe: ClerkAuthProbe | null): void {
  probeOverride = probe;
}

/**
 * The signed-in Clerk userId, or null. Never throws.
 */
export async function getClerkUserIdOptional(): Promise<string | null> {
  if (probeOverride) return probeOverride();
  try {
    const { auth } = await import("@clerk/nextjs/server");
    const { userId } = await auth();
    return userId ?? null;
  } catch (error) {
    // "Clerk can't detect usage of clerkMiddleware" is the expected shape
    // when a route wasn't wrapped (CI, local runs without keys, misrouted
    // matcher).
    // Anything else is still safer degraded to signed-out than thrown —
    // the callers gate money paths on a POSITIVE id, so null only ever
    // downgrades access.
    if (!warnedOnce) {
      warnedOnce = true;
      const message = error instanceof Error ? error.message : String(error);
      console.warn(
        "[auth] Clerk session probe unavailable — treating callers as signed-out",
        { reason: message.slice(0, 160) },
      );
    }
    return null;
  }
}
