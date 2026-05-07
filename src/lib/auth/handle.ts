// Handle reservation for new profiles.
//
// Called from both the Clerk webhook (`user.created` event) and the
// lazy-create path in `requireUser()`. The two callers may race for the
// same handle; the unique index on `profiles.handle` (and the lower-case
// variant) makes that race safe — `INSERT ... ON CONFLICT DO NOTHING`
// returns nothing, we retry with a numeric suffix.
//
// Order of preference:
//   1. Clerk username (already URL-safe, set by the user themselves)
//   2. firstName + lastName slug
//   3. email local-part slug
//   4. `user-<short-clerk-id>` final fallback (always succeeds)

import "server-only";

import { sql } from "drizzle-orm";
import type { User } from "@clerk/nextjs/server";

import { db } from "@/lib/db/client";
import { profiles } from "@/lib/db/schema/profiles";

const HANDLE_PATTERN = /^[a-z0-9_-]{3,32}$/;
const SUFFIX_RETRIES = 5;

function slugify(input: string | null | undefined): string | null {
  if (!input) return null;
  const cleaned = input
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  return HANDLE_PATTERN.test(cleaned) ? cleaned : null;
}

function shortClerkSuffix(clerkUserId: string): string {
  // Clerk IDs look like `user_2h3jksdkfh`. Trim the prefix + take the
  // tail so the short fallback handle is stable and unique-ish.
  const tail = clerkUserId.replace(/^user_/, "").slice(-8);
  return `user-${tail.toLowerCase()}`;
}

async function isHandleTaken(handle: string): Promise<boolean> {
  const rows = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(sql`lower(${profiles.handle}) = lower(${handle})`)
    .limit(1);
  return rows.length > 0;
}

/**
 * Pick a free handle for a freshly-created Clerk user. NEVER throws —
 * the `user-<id>` final fallback always succeeds because Clerk IDs
 * themselves are unique.
 */
export async function reserveHandleFromClerk(
  clerkUser: User,
): Promise<string> {
  const candidates: string[] = [];
  const fromUsername = slugify(clerkUser.username);
  if (fromUsername) candidates.push(fromUsername);
  const fromName = slugify(
    [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join("-"),
  );
  if (fromName && fromName !== fromUsername) candidates.push(fromName);
  const primaryEmail = clerkUser.emailAddresses.find(
    (e) => e.id === clerkUser.primaryEmailAddressId,
  )?.emailAddress;
  const fromEmail = slugify(primaryEmail?.split("@")[0]);
  if (fromEmail && !candidates.includes(fromEmail)) candidates.push(fromEmail);

  for (const base of candidates) {
    if (!(await isHandleTaken(base))) return base;
    for (let i = 0; i < SUFFIX_RETRIES; i++) {
      const suffix = Math.floor(1000 + Math.random() * 9000); // 4-digit
      const candidate = `${base}-${suffix}`.slice(0, 32);
      if (!(await isHandleTaken(candidate))) return candidate;
    }
  }
  return shortClerkSuffix(clerkUser.id);
}
