// Repo reactions — append-only JSONL store for the reaction buttons on
// /repo/[owner]/[name] profile pages.
//
// Generalizes the same shape used by src/lib/repo-likes.ts (latest-row-wins,
// Clerk-source-of-truth, GDPR cascade) over a `kind` discriminator so new
// reaction types can be added by extending the Zod enum on the route + this
// module's `RepoReactionKind` union. Today only "unicorn" is in use; "fire",
// "rocket", etc. slot in trivially.
//
// Storage: .data/repo-reactions.jsonl, append-only via the same
// file-persistence helpers used by repo-likes / ideas / contributions.
// Toggles are expressed as new "on" / "off" rows; the latest row per
// (repoFullName, clerkUserId, kind) decides the user's current state.
// Counts are the cardinality of the on-set computed from that latest-row
// scan, scoped by kind.
//
// Identity: callers must pre-resolve clerkUserId; this module never trusts
// a body-supplied userId. The /api/repos/[owner]/[name]/reactions route
// enforces that by sourcing clerkUserId from Clerk's auth() session.
//
// CLIENT BOUNDARY: pulls in file-persistence (node:fs). Client components
// must `import type { RepoReactionRow, RepoReactionStatus, RepoReactionKind }`
// so the runtime module is never bundled.

import {
  appendJsonlFile,
  readJsonlFile,
} from "@/lib/pipeline/storage/file-persistence";

export const REPO_REACTIONS_FILE = "repo-reactions.jsonl";

/**
 * Discriminator for reaction-kind. Today: `unicorn` only. Extend by adding
 * the new value here AND in the route's Zod enum + the UI mount point in
 * RepoHeroCard. Keep the union closed; "unknown string" is not a valid
 * reaction.
 */
export type RepoReactionKind = "unicorn";

export interface RepoReactionRow {
  repoFullName: string;
  clerkUserId: string;
  kind: RepoReactionKind;
  action: "on" | "off";
  createdAt: string;
}

export interface RepoReactionStatus {
  /** Number of UNIQUE users whose latest row for (repo, kind) is `on`. */
  count: number;
  /** Whether the given user's latest row for (repo, kind) is `on`. */
  active: boolean;
}

/**
 * Walk every row for the repo+kind pair and compute the current on-set: for
 * each (repoFullName, clerkUserId, kind) triple, the latest row by createdAt
 * decides whether the user is currently reacting. The on-set's cardinality
 * is `count`; membership-of-clerkUserId is `active` (false when null).
 *
 * Returns { count: 0, active: false } when the file is missing or no rows
 * match.
 */
export async function getReactionStatus(
  repoFullName: string,
  kind: RepoReactionKind,
  clerkUserId: string | null,
): Promise<RepoReactionStatus> {
  const records = await readJsonlFile<RepoReactionRow>(REPO_REACTIONS_FILE);

  // Per-user latest row, scoped to (repo, kind). We can't assume the file
  // is ordered by createdAt because two appends in the same millisecond
  // can land out of order on a future writer; compare timestamps explicitly.
  const latest = new Map<string, RepoReactionRow>();
  for (const row of records) {
    if (row.repoFullName !== repoFullName) continue;
    if (row.kind !== kind) continue;
    const prev = latest.get(row.clerkUserId);
    if (!prev || Date.parse(row.createdAt) >= Date.parse(prev.createdAt)) {
      latest.set(row.clerkUserId, row);
    }
  }

  let count = 0;
  let active = false;
  for (const [userId, row] of latest) {
    if (row.action !== "on") continue;
    count++;
    if (clerkUserId !== null && userId === clerkUserId) {
      active = true;
    }
  }

  return { count, active };
}

/**
 * Append an "on" or "off" row depending on the user's current state for
 * (repo, kind), then return the post-toggle status. The route handler
 * resolves clerkUserId via auth() before calling this — this module never
 * derives identity.
 *
 * Concurrency note: two parallel toggles from the same user can both read
 * the same pre-state and append two same-direction rows. The latest-row
 * resolver in getReactionStatus collapses that to a single end-state, so
 * the worst-case result is one extra "no-op" row in the log — acceptable
 * for an append-only audit trail.
 */
export async function toggleReaction(
  repoFullName: string,
  kind: RepoReactionKind,
  clerkUserId: string,
): Promise<RepoReactionStatus> {
  const current = await getReactionStatus(repoFullName, kind, clerkUserId);
  const row: RepoReactionRow = {
    repoFullName,
    clerkUserId,
    kind,
    action: current.active ? "off" : "on",
    createdAt: new Date().toISOString(),
  };
  await appendJsonlFile(REPO_REACTIONS_FILE, row);

  // Recompute post-toggle status from scratch rather than flipping the
  // boolean locally — keeps the function honest if a concurrent writer
  // landed a row between our read and append.
  return getReactionStatus(repoFullName, kind, clerkUserId);
}

/**
 * GDPR cascade — append "off" rows for every (repo, kind) pair the user is
 * currently active on. Append-only design means we never remove past rows;
 * the latest "off" simply takes precedence in the resolver. Returns the
 * number of off rows appended so callers can log the cascade size.
 *
 * Called from the Clerk `user.deleted` webhook.
 */
export async function deleteReactionsByUser(
  clerkUserId: string,
): Promise<number> {
  const records = await readJsonlFile<RepoReactionRow>(REPO_REACTIONS_FILE);

  // Build the current state per (repo, kind) the user has touched.
  const latestPerPair = new Map<string, RepoReactionRow>();
  for (const row of records) {
    if (row.clerkUserId !== clerkUserId) continue;
    const key = `${row.repoFullName}\x1f${row.kind}`;
    const prev = latestPerPair.get(key);
    if (!prev || Date.parse(row.createdAt) >= Date.parse(prev.createdAt)) {
      latestPerPair.set(key, row);
    }
  }

  let removed = 0;
  const now = new Date().toISOString();
  for (const row of latestPerPair.values()) {
    if (row.action !== "on") continue;
    await appendJsonlFile(REPO_REACTIONS_FILE, {
      repoFullName: row.repoFullName,
      clerkUserId,
      kind: row.kind,
      action: "off",
      createdAt: now,
    } satisfies RepoReactionRow);
    removed++;
  }
  return removed;
}
