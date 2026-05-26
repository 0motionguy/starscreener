// Repo likes — append-only JSONL store for the LIKE button on
// /repo/[owner]/[name] profile pages.
//
// Storage: .data/repo-likes.jsonl, append-only via the same
// file-persistence helpers used by ideas / contributions. Toggles are
// expressed as new "like" / "unlike" rows; the latest row per
// (repoFullName, clerkUserId) decides the user's current state. Counts
// are the cardinality of the like-set computed from that latest-row scan.
//
// Identity: callers must pre-resolve clerkUserId; this module never trusts
// a body-supplied userId. The /api/repos/[owner]/[name]/like route enforces
// that by sourcing clerkUserId from Clerk's auth() session.
//
// CLIENT BOUNDARY: pulls in file-persistence (node:fs). Client components
// must `import type { RepoLikeRow, RepoLikeStatus }` so the runtime module
// is never bundled.

import {
  appendJsonlFile,
  readJsonlFile,
} from "@/lib/pipeline/storage/file-persistence";

export const REPO_LIKES_FILE = "repo-likes.jsonl";

export interface RepoLikeRow {
  repoFullName: string;
  clerkUserId: string;
  action: "like" | "unlike";
  createdAt: string;
}

export interface RepoLikeStatus {
  /** Number of UNIQUE users whose latest row for the repo is a "like". */
  count: number;
  /** Whether the given user's latest row is a "like" (false for anon). */
  liked: boolean;
}

/**
 * Walk every row for the repo and compute the current like-set: for each
 * (repoFullName, clerkUserId) pair, the latest row by createdAt decides
 * whether the user is currently liking. The like-set's cardinality is
 * `count`; membership-of-clerkUserId is `liked` (false when null).
 *
 * Returns { count: 0, liked: false } when the file is missing or the repo
 * has no rows yet.
 */
export async function getLikeStatus(
  repoFullName: string,
  clerkUserId: string | null,
): Promise<RepoLikeStatus> {
  const records = await readJsonlFile<RepoLikeRow>(REPO_LIKES_FILE);

  // Per-user latest row. We can't assume the file is ordered by createdAt
  // because two appends in the same millisecond can land out of order on
  // a future writer; compare timestamps explicitly.
  const latest = new Map<string, RepoLikeRow>();
  for (const row of records) {
    if (row.repoFullName !== repoFullName) continue;
    const prev = latest.get(row.clerkUserId);
    if (!prev || Date.parse(row.createdAt) >= Date.parse(prev.createdAt)) {
      latest.set(row.clerkUserId, row);
    }
  }

  let count = 0;
  let liked = false;
  for (const [userId, row] of latest) {
    if (row.action !== "like") continue;
    count++;
    if (clerkUserId !== null && userId === clerkUserId) {
      liked = true;
    }
  }

  return { count, liked };
}

/**
 * Append a "like" or "unlike" row depending on the user's current state,
 * then return the post-toggle status. The route handler resolves
 * clerkUserId via auth() before calling this — this module never derives
 * identity.
 *
 * Concurrency note: two parallel toggles from the same user can both read
 * the same pre-state and append two same-direction rows. The latest-row
 * resolver in getLikeStatus collapses that to a single end-state, so the
 * worst-case result is one extra "no-op" row in the log — acceptable for
 * an append-only audit trail.
 */
export async function toggleLike(
  repoFullName: string,
  clerkUserId: string,
): Promise<RepoLikeStatus> {
  const current = await getLikeStatus(repoFullName, clerkUserId);
  const row: RepoLikeRow = {
    repoFullName,
    clerkUserId,
    action: current.liked ? "unlike" : "like",
    createdAt: new Date().toISOString(),
  };
  await appendJsonlFile(REPO_LIKES_FILE, row);

  // Recompute post-toggle status from scratch rather than flipping the
  // boolean locally — keeps the function honest if a concurrent writer
  // landed a row between our read and append.
  return getLikeStatus(repoFullName, clerkUserId);
}

/**
 * GDPR cascade — append "unlike" rows for every repo the user is currently
 * liking. Append-only design means we never remove past rows; the latest
 * "unlike" simply takes precedence in the resolver. Returns the number of
 * unlike rows appended so callers can log the cascade size.
 *
 * Called from the Clerk `user.deleted` webhook.
 */
export async function deleteLikesByUser(clerkUserId: string): Promise<number> {
  const records = await readJsonlFile<RepoLikeRow>(REPO_LIKES_FILE);

  // Build the current state per repo the user has touched.
  const latestPerRepo = new Map<string, RepoLikeRow>();
  for (const row of records) {
    if (row.clerkUserId !== clerkUserId) continue;
    const prev = latestPerRepo.get(row.repoFullName);
    if (!prev || Date.parse(row.createdAt) >= Date.parse(prev.createdAt)) {
      latestPerRepo.set(row.repoFullName, row);
    }
  }

  let removed = 0;
  const now = new Date().toISOString();
  for (const [repoFullName, row] of latestPerRepo) {
    if (row.action !== "like") continue;
    await appendJsonlFile(REPO_LIKES_FILE, {
      repoFullName,
      clerkUserId,
      action: "unlike",
      createdAt: now,
    } satisfies RepoLikeRow);
    removed++;
  }
  return removed;
}
