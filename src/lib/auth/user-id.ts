// Canonical userId scheme — pure helpers, safe to import anywhere
// (client, server, pipeline libs, tests). No Clerk imports here.
//
// Three id families exist in the wild:
//
//   c_<clerkUserId>  — Clerk-verified identity. The ONLY family that may
//                      carry a paid tier going forward. Minted server-side
//                      from a live Clerk session (see lib/auth/clerk-session).
//   a_<random>       — anonymous browser session (alerts/watchlist for
//                      logged-out users). Never carries a tier.
//   u_<hmac(email)>  — LEGACY email-derived ids. Minting these from
//                      client-supplied emails was removed (any visitor could
//                      mint any user's id by knowing their email — takeover).
//                      Existing records keyed this way are still readable via
//                      the tier read-through (lib/pricing/tier-resolve) and
//                      the weekly-digest candidate matching, and migrate
//                      forward to c_ ids on first authenticated touch.

export const CLERK_USER_ID_PREFIX = "c_";
export const ANONYMOUS_USER_ID_PREFIX = "a_";
export const LEGACY_EMAIL_USER_ID_PREFIX = "u_";

/** Canonical userId for a Clerk-verified user. */
export function clerkDerivedUserId(clerkUserId: string): string {
  return `${CLERK_USER_ID_PREFIX}${clerkUserId}`;
}

export function isClerkDerivedUserId(userId: string | null | undefined): boolean {
  return typeof userId === "string" && userId.startsWith(CLERK_USER_ID_PREFIX);
}

export function isAnonymousUserId(userId: string | null | undefined): boolean {
  return typeof userId === "string" && userId.startsWith(ANONYMOUS_USER_ID_PREFIX);
}

export function isLegacyEmailUserId(userId: string | null | undefined): boolean {
  return typeof userId === "string" && userId.startsWith(LEGACY_EMAIL_USER_ID_PREFIX);
}
