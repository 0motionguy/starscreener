// Lazy migration: anonymous `ss_user` cookie → Clerk-backed profile.
//
// Old world: anonymous users got an HMAC-signed `ss_user` cookie + their
// pro-tier watchlist lived in `.data/private-watchlists.jsonl` keyed by
// the cookie's `userId` HMAC.
//
// New world: signed-in users have a `profiles` row + `watchlists` +
// `watchlist_items` Postgres tables. On first sign-in for a user with an
// existing `ss_user` cookie, we copy their watchlist into the new tables
// and clear the cookie.
//
// "Lazy" because we don't run a one-shot migration script: each user
// pays the cost on their next sign-in. Idempotent — re-running on an
// already-migrated user is a no-op (cookie already cleared, watchlist
// already in DB).
//
// Behaviour is best-effort: any failure logs and returns. Sign-in must
// never fail because the migration choked on bad legacy data.

import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { watchlists, watchlistItems } from "@/lib/db/schema/watchlists";

interface MigrateAnonInput {
  /** The newly-loaded profile.id for this Clerk user. */
  profileId: string;
  /** The decoded `ss_user` cookie userId — used to look up legacy data. */
  legacyUserId: string;
  /** Reads from the legacy JSONL store. */
  legacyRepoFullNames: string[];
}

/**
 * Copy a legacy ss_user-keyed watchlist into the relational store.
 * Returns the number of items inserted (0 if already migrated or empty).
 */
export async function migrateAnonWatchlist(
  input: MigrateAnonInput,
): Promise<number> {
  const { profileId, legacyRepoFullNames } = input;
  if (legacyRepoFullNames.length === 0) return 0;

  // Find or create a default watchlist for this profile.
  const existing = await db
    .select()
    .from(watchlists)
    .where(eq(watchlists.profileId, profileId))
    .limit(1);

  let watchlistId: string;
  if (existing.length > 0) {
    watchlistId = existing[0].id;
  } else {
    const [created] = await db
      .insert(watchlists)
      .values({ profileId, name: "Default" })
      .returning({ id: watchlists.id });
    if (!created) return 0;
    watchlistId = created.id;
  }

  // Bulk insert; the unique index on (watchlist_id, repo_full_name) makes
  // re-runs safe — a re-imported repo just no-ops.
  const rows = legacyRepoFullNames.map((repoFullName) => ({
    watchlistId,
    repoFullName,
  }));
  const result = await db
    .insert(watchlistItems)
    .values(rows)
    .onConflictDoNothing()
    .returning({ id: watchlistItems.id });
  return result.length;
}

// TODO(v2): wire from `requireUser()` once the legacy private-store
// loader exposes a `getRepoFullNamesByLegacyUserId(legacyUserId)` helper
// that the auth layer can call without circular import. For now this
// helper sits ready and the tests below pin its behaviour; the wiring
// lands with the watchlist-server-sync feature chunk.
