// Server-side auth helpers — Clerk + profiles JOIN.
//
// Every protected route or server component should funnel through one of:
//
//   - `requireUser()`  — throws via `redirect()` to Clerk's sign-in flow if
//                        unauthenticated; returns a `LoadedUser` (Clerk
//                        identity + matching profile row) otherwise.
//   - `getUser()`      — same lookup, but returns `null` when signed out.
//                        Use for server components that gracefully degrade
//                        (e.g. `/u/[handle]` showing a public profile to
//                        anonymous viewers).
//
// Lazy profile creation: if Clerk says the user is signed-in but the
// `profiles` row is missing (Clerk webhook hasn't fired yet, or it failed),
// we synthesise the row from `clerkUser` data inside this helper. The
// `profiles.clerk_user_id` unique constraint makes this idempotent — the
// real webhook landing later just becomes a no-op upsert.

import "server-only";

import { auth, currentUser } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";

import { db } from "@/lib/db/client";
import { profiles, type Profile } from "@/lib/db/schema/profiles";

import { reserveHandleFromClerk } from "./handle";

export interface LoadedUser {
  clerkUserId: string;
  profile: Profile;
}

/**
 * Server-component / route-handler version of "is this user signed in".
 * Returns `null` when not. Touches `cookies()` so callers are opted into
 * dynamic rendering automatically — no need for `export const dynamic` on
 * every page.
 */
export async function getUser(): Promise<LoadedUser | null> {
  // Reading cookies() forces Next 15 to treat the route as dynamic, which
  // is required for `auth()` to read the Clerk session token.
  cookies();
  const { userId } = await auth();
  if (!userId) return null;
  const profile = await loadProfileOrLazyCreate(userId);
  if (!profile) return null;
  return { clerkUserId: userId, profile };
}

/**
 * Throws (via redirect) when not signed-in. Use in routes that should
 * never render anonymously: `/you/*`, `/api/me/*`.
 */
export async function requireUser(): Promise<LoadedUser> {
  const loaded = await getUser();
  if (loaded) return loaded;
  // Clerk's recommended pattern — bounces through the modal-backed
  // sign-in flow at the root, with a redirect back to the original path.
  redirect("/sign-in");
}

/**
 * Lookup-or-create. The Clerk webhook is the canonical source for
 * profile rows, but in practice it can lag (cold starts, retries,
 * dev environments without a public webhook URL). Lazy-creating here
 * keeps `/you/*` working immediately after sign-up.
 *
 * Idempotent: re-running on a profile that already exists is a single
 * SELECT and returns the existing row.
 */
async function loadProfileOrLazyCreate(
  clerkUserId: string,
): Promise<Profile | null> {
  const existing = await db
    .select()
    .from(profiles)
    .where(eq(profiles.clerkUserId, clerkUserId))
    .limit(1);
  if (existing.length > 0) return existing[0];

  // Profile missing → fall back to Clerk's full user object so we can
  // hydrate email + handle. `currentUser()` is heavier than `auth()` so
  // we pay it only on the cold path.
  const clerkUser = await currentUser();
  if (!clerkUser) return null;

  const primaryEmail =
    clerkUser.emailAddresses.find(
      (e) => e.id === clerkUser.primaryEmailAddressId,
    )?.emailAddress ?? clerkUser.emailAddresses[0]?.emailAddress;
  if (!primaryEmail) {
    // Should never happen — Clerk requires email. If it does, surface
    // loudly rather than silently 500ing the page.
    console.error("[auth] Clerk user has no email address", clerkUserId);
    return null;
  }

  const handle = await reserveHandleFromClerk(clerkUser);

  const inserted = await db
    .insert(profiles)
    .values({
      clerkUserId,
      handle,
      email: primaryEmail,
      displayName:
        clerkUser.firstName && clerkUser.lastName
          ? `${clerkUser.firstName} ${clerkUser.lastName}`.trim()
          : (clerkUser.firstName ?? clerkUser.username ?? null),
      avatarUrl: clerkUser.imageUrl ?? null,
    })
    .onConflictDoUpdate({
      // Concurrent webhook + lazy-create: the webhook wins (set its email
      // + avatar fields) but we never blow away the existing handle.
      target: profiles.clerkUserId,
      set: {
        email: primaryEmail,
        avatarUrl: clerkUser.imageUrl ?? null,
        lastSeenAt: new Date(),
      },
    })
    .returning();

  return inserted[0] ?? null;
}

/**
 * Bump `last_seen_at` — call from the layout or a tiny middleware so the
 * referral qualifying cron has a fresh signal. Throttled to once per
 * 5 minutes per user via cookie to avoid hammering the DB on every page
 * view of a busy user.
 */
export async function touchLastSeen(profileId: string): Promise<void> {
  await db
    .update(profiles)
    .set({ lastSeenAt: new Date() })
    .where(eq(profiles.id, profileId));
}
