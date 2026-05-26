// Repo profile comments — one append-only JSONL log of every comment ever
// posted on any /repo/[owner]/[name] page, plus tombstone rows for
// soft-deletes.
//
// Storage shape: `repo-comments.jsonl` under `currentDataDir()`. Each line
// is either:
//   - a fresh comment row (no `deletedAt`)
//   - a tombstone for an existing comment (same `id`, `deletedAt` set)
//
// The log is never compacted — readers filter tombstones out on the way
// out. This matches the idea-contributions pattern: the JSONL is the
// authoritative event log, projections are computed.
//
// Identity: callers must pre-resolve `clerkUserId` + `displayName` +
// `avatarUrl` from Clerk. This module never trusts a body-supplied
// identity — the route handler resolves them via `requireUser()` /
// `getUser()` before calling in.
//
// CLIENT BOUNDARY: pulls in node:crypto + file-persistence (node:fs).
// Client components must `import type { RepoComment }` so the runtime
// module never bundles into the browser chunk.

import { randomUUID } from "node:crypto";

import {
  appendJsonlFile,
  readJsonlFile,
} from "@/lib/pipeline/storage/file-persistence";

export const REPO_COMMENTS_FILE = "repo-comments.jsonl";

export interface RepoComment {
  id: string;
  repoFullName: string;
  clerkUserId: string;
  displayName: string;
  avatarUrl: string | null;
  body: string;
  createdAt: string;
  /** ISO timestamp — present only on tombstone rows that retract an earlier comment. */
  deletedAt?: string;
  /**
   * Optional parent comment id when the row is a reply.
   *
   * Rows persisted before this field existed simply have `parentId === undefined`
   * — they project as root comments, which is the correct historical behavior.
   * The route handler currently does not yet accept `parentId` on POST; until
   * it does, replies posted from the UI land at root. The thread component
   * tolerates either state and re-buckets on each read.
   */
  parentId?: string;
}

export interface AppendRepoCommentInput {
  repoFullName: string;
  clerkUserId: string;
  displayName: string;
  avatarUrl: string | null;
  body: string;
  /** Optional parent comment id when this is a reply. */
  parentId?: string;
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/**
 * Read every row in the log, project to the active set for `repoFullName`,
 * and return newest-first. A comment is active when its id has a creation
 * row and no later tombstone row.
 *
 * Returns `[]` when the file is missing or no rows match. Malformed lines
 * are skipped by the shared JSONL reader.
 */
export async function listCommentsForRepo(
  repoFullName: string,
): Promise<RepoComment[]> {
  const rows = await readJsonlFile<RepoComment>(REPO_COMMENTS_FILE);

  // Two passes:
  //   1. Capture the latest non-tombstone row per id (handles the
  //      degenerate case of an id appearing more than once, which
  //      shouldn't happen but we don't want to crash if it does).
  //   2. Mark ids tombstoned if any later row carries `deletedAt`.
  const creations = new Map<string, RepoComment>();
  const tombstoned = new Set<string>();
  for (const row of rows) {
    if (!row || typeof row.id !== "string" || row.repoFullName !== repoFullName) {
      continue;
    }
    if (row.deletedAt) {
      tombstoned.add(row.id);
      continue;
    }
    creations.set(row.id, row);
  }

  const active: RepoComment[] = [];
  for (const [id, row] of creations) {
    if (tombstoned.has(id)) continue;
    active.push(row);
  }

  active.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return active;
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

/**
 * Append a new comment row. The route handler is responsible for
 * resolving identity via Clerk and trimming/normalising the body — this
 * module simply persists what it's given.
 */
export async function appendComment(
  input: AppendRepoCommentInput,
): Promise<RepoComment> {
  const record: RepoComment = {
    id: randomUUID(),
    repoFullName: input.repoFullName,
    clerkUserId: input.clerkUserId,
    displayName: input.displayName,
    avatarUrl: input.avatarUrl,
    body: input.body,
    createdAt: new Date().toISOString(),
    ...(input.parentId ? { parentId: input.parentId } : {}),
  };
  await appendJsonlFile(REPO_COMMENTS_FILE, record);
  return record;
}

/**
 * Soft-delete a single comment by appending a tombstone row. Verifies the
 * comment exists AND belongs to `clerkUserId` before writing — otherwise
 * returns `false` so the route can answer 403 / 404.
 *
 * Note: the tombstone is keyed on `id` + `deletedAt`. We deliberately
 * preserve every other field (display name, body, etc.) so the audit
 * trail is intact — a moderator running `git log` over the JSONL still
 * sees what was said, but `listCommentsForRepo` filters it out.
 */
export async function softDeleteComment(
  commentId: string,
  clerkUserId: string,
): Promise<boolean> {
  const rows = await readJsonlFile<RepoComment>(REPO_COMMENTS_FILE);
  // Pick the latest creation row for this id — tombstones are skipped so
  // we don't authorise a deletion against an already-deleted entry.
  let target: RepoComment | null = null;
  for (const row of rows) {
    if (!row || row.id !== commentId) continue;
    if (row.deletedAt) {
      // Already deleted — refuse to write another tombstone.
      return false;
    }
    target = row;
  }
  if (!target) return false;
  if (target.clerkUserId !== clerkUserId) return false;

  const tombstone: RepoComment = {
    ...target,
    deletedAt: new Date().toISOString(),
  };
  await appendJsonlFile(REPO_COMMENTS_FILE, tombstone);
  return true;
}

/**
 * GDPR cascade — append a tombstone for every active comment authored by
 * `clerkUserId`. Called from the Clerk `user.deleted` webhook so the
 * comments store doesn't keep showing the user's text after the upstream
 * identity is gone. Returns the number of tombstones written.
 *
 * Append-only deletion (vs. mutateJsonlFile rewrite) keeps the JSONL
 * boundary the same for all writers and avoids the global file lock for
 * what's a relatively rare event.
 */
export async function deleteCommentsByUser(
  clerkUserId: string,
): Promise<number> {
  const rows = await readJsonlFile<RepoComment>(REPO_COMMENTS_FILE);

  // Collect the latest creation row per id, drop ids already tombstoned.
  const active = new Map<string, RepoComment>();
  for (const row of rows) {
    if (!row || typeof row.id !== "string") continue;
    if (row.deletedAt) {
      active.delete(row.id);
      continue;
    }
    if (row.clerkUserId === clerkUserId) {
      active.set(row.id, row);
    }
  }

  let count = 0;
  const now = new Date().toISOString();
  for (const row of active.values()) {
    await appendJsonlFile(REPO_COMMENTS_FILE, { ...row, deletedAt: now });
    count++;
  }
  return count;
}
