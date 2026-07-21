// Async user-principal resolver — the authorization boundary for paid and
// user-scoped BROWSER routes.
//
// `verifyUserAuth` (sync, ./auth) authenticates a caller from either a
// configured bearer token (USER_TOKEN / USER_TOKENS_JSON) or the `ss_user`
// HMAC session cookie. That cookie is a 30-day self-signed token: a
// Clerk-derived (`c_<clerkUserId>`) cookie proves the app minted it once, NOT
// that the Clerk session is still alive. A paid route that trusts the cookie
// alone therefore keeps authorizing a user after they sign out of Clerk (or
// after the cookie is exfiltrated) for up to 30 days — the stale-cookie P0.
//
// `resolveUserPrincipal` closes that hole WITHOUT breaking server-to-server
// integrations:
//
//   - header/token principals (source "header") are configured service
//     credentials, not browser sessions — trusted as-is, no Clerk needed;
//   - anonymous (`a_`) and legacy (`u_`) cookie principals carry no tier and
//     assert no Clerk identity — passed through unchanged;
//   - a `c_<clerkUserId>` COOKIE principal must resolve to a LIVE Clerk
//     session for the same id, else it is denied.
//
// It returns the same `UserAuthVerdict` shape as `verifyUserAuth`, so callers
// keep using `userAuthFailureResponse` for the deny path.

import "server-only";

import type { NextRequest } from "next/server";

import { verifyUserAuth, type UserAuthVerdict } from "./auth";
import { getClerkUserIdOptional } from "@/lib/auth/clerk-session";
import { clerkDerivedUserId, isClerkDerivedUserId } from "@/lib/auth/user-id";

export async function resolveUserPrincipal(
  request: NextRequest,
): Promise<UserAuthVerdict> {
  const verdict = verifyUserAuth(request);
  if (verdict.kind !== "ok") return verdict;

  // Configured token / dev-fallback principals are not browser sessions.
  if (verdict.source === "header") return verdict;

  // Cookie principals that don't assert a Clerk identity (anonymous / legacy)
  // have nothing to re-verify.
  if (!isClerkDerivedUserId(verdict.userId)) return verdict;

  // Clerk-derived cookie: require a live Clerk session mapping to the same id.
  // getClerkUserIdOptional never throws — a missing/failed Clerk context
  // returns null, which denies (fail-closed on the money path).
  const liveClerkUserId = await getClerkUserIdOptional();
  if (!liveClerkUserId || clerkDerivedUserId(liveClerkUserId) !== verdict.userId) {
    return { kind: "unauthorized" };
  }
  return verdict;
}
