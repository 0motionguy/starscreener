// Saved ideas — the bookmark list a signed-in user keeps on /account.
//
// Storage: .data/user-saved.jsonl, append-only. Unsaving rewrites the
// file via mutateJsonlFile (filtering the row out) — same atomic
// read-modify-write pattern as src/lib/ideas.ts moderation paths.
//
// Identity: callers must pre-resolve userId; this module never trusts a
// body-supplied userId. The route enforces that contract via requireUser().
//
// CLIENT BOUNDARY: pulls in node:crypto + file-persistence (node:fs).
// Client components must `import type { SavedIdea }`.

import "server-only";

import { randomBytes } from "node:crypto";

import {
  mutateJsonlFile,
  readJsonlFile,
} from "@/lib/pipeline/storage/file-persistence";

export const SAVED_IDEAS_FILE = "user-saved.jsonl";

export interface SavedIdea {
  id: string;
  userId: string;
  ideaId: string;
  savedAt: string;
}

export type SaveIdeaOutcome =
  | { kind: "saved"; record: SavedIdea }
  | { kind: "already-saved"; record: SavedIdea };

export type UnsaveIdeaOutcome =
  | { kind: "removed" }
  | { kind: "not-found" };

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

function shortId(): string {
  return randomBytes(6).toString("base64url");
}

/**
 * List every idea this user has saved, newest first. Returns [] when
 * the file is missing or the user has no saves.
 */
export async function listSavedIdeas(userId: string): Promise<SavedIdea[]> {
  const records = await readJsonlFile<SavedIdea>(SAVED_IDEAS_FILE);
  return records
    .filter((r) => r.userId === userId)
    .sort((a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt));
}

/**
 * Save an idea for the given user. Idempotent — re-saving an already-
 * saved idea returns `{ kind: "already-saved" }` with the existing row,
 * not a new one. Concurrent calls serialise via mutateJsonlFile's
 * per-file lock so two simultaneous saves can't both append.
 */
export async function saveIdea(
  userId: string,
  ideaId: string,
): Promise<SaveIdeaOutcome> {
  const holder: { value: SaveIdeaOutcome | null } = { value: null };
  const now = new Date().toISOString();

  await mutateJsonlFile<SavedIdea>(SAVED_IDEAS_FILE, (current) => {
    const existing = current.find(
      (r) => r.userId === userId && r.ideaId === ideaId,
    );
    if (existing) {
      holder.value = { kind: "already-saved", record: existing };
      return current;
    }
    const record: SavedIdea = {
      id: shortId(),
      userId,
      ideaId,
      savedAt: now,
    };
    holder.value = { kind: "saved", record };
    return [...current, record];
  });

  if (!holder.value) {
    throw new Error("saveIdea transaction did not produce a result");
  }
  return holder.value;
}

/**
 * Remove a save row. Lookup is by ideaId (not the save row's id) so
 * the UI doesn't need to track per-save ids — the user-facing handle
 * is always the idea. The route's DELETE endpoint receives the ideaId
 * as the `[id]` segment.
 */
export async function unsaveIdea(
  userId: string,
  ideaId: string,
): Promise<UnsaveIdeaOutcome> {
  const holder: { value: UnsaveIdeaOutcome | null } = { value: null };

  await mutateJsonlFile<SavedIdea>(SAVED_IDEAS_FILE, (current) => {
    const next = current.filter(
      (r) => !(r.userId === userId && r.ideaId === ideaId),
    );
    holder.value =
      next.length === current.length
        ? { kind: "not-found" }
        : { kind: "removed" };
    return next;
  });

  if (!holder.value) {
    throw new Error("unsaveIdea transaction did not produce a result");
  }
  return holder.value;
}

/**
 * GDPR cascade — wipe every saved-row for a user. Called from the
 * Clerk `user.deleted` webhook so the user-saved store doesn't retain
 * the Clerk userId after the upstream identity is gone. Returns the
 * number of rows removed for telemetry.
 */
export async function deleteAllSavedByUser(userId: string): Promise<number> {
  let removed = 0;
  await mutateJsonlFile<SavedIdea>(SAVED_IDEAS_FILE, (current) => {
    const next = current.filter((r) => r.userId !== userId);
    removed = current.length - next.length;
    return next;
  });
  return removed;
}
