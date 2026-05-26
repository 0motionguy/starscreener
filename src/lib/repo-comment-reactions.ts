// Named reactions on repo profile comments (heart / unicorn / bookmark).
//
// Storage shape: `repo-comment-reactions.jsonl` under `currentDataDir()`.
// Append-only event log where each line is either:
//   - an `add` event   — { commentId, clerkUserId, reaction, createdAt }
//   - a `remove` event — same row with `removedAt` set
//
// The active set is computed by walking the log and tracking the latest
// `(commentId, clerkUserId, reaction)` triple: if its latest row has no
// `removedAt` the reaction is live. This costs O(rows) per read but the
// log stays small per comment, and the JSONL is the truth-of-record same
// as repo-comments.jsonl.
//
// Toggle semantics (per task spec):
//   - same reaction again      → soft-remove (the row is appended with `removedAt`)
//   - different reaction       → remove the old (append `removedAt`) + add the new
//   - none currently active    → add the new
//
// Reaction whitelist enforced here AND at the route boundary — defence in
// depth. Anything off-list is rejected before it touches storage.
//
// Legacy compatibility: rows persisted under the previous 5-emoji schema
// used an `emoji` field. On read we accept the old field for backward
// compatibility, but only `❤️` (red heart) maps cleanly onto the new
// `heart` reaction; the four other legacy emojis (🚀 🔥 💯 👀) have no
// home in the new vocabulary so we drop them silently on replay.
//
// CLIENT BOUNDARY: pulls in file-persistence (node:fs). Client components
// must import via `type` only.

import {
  appendJsonlFile,
  readJsonlFile,
} from "@/lib/pipeline/storage/file-persistence";

export const REPO_COMMENT_REACTIONS_FILE = "repo-comment-reactions.jsonl";

/**
 * Named reactions surfaced on the profile-page comment UI. Three is the
 * sweet spot — appreciation (heart), excitement (unicorn), save-for-later
 * (bookmark) — without sprawling into an emoji picker.
 */
export const ALLOWED_REACTIONS = ["heart", "unicorn", "bookmark"] as const;
export type Reaction = (typeof ALLOWED_REACTIONS)[number];

const ALLOWED_SET = new Set<Reaction>(ALLOWED_REACTIONS);

export function isAllowedReaction(value: unknown): value is Reaction {
  return typeof value === "string" && ALLOWED_SET.has(value as Reaction);
}

export interface CommentReaction {
  commentId: string;
  clerkUserId: string;
  reaction: Reaction;
  createdAt: string;
  /** ISO timestamp — present on rows that retract an earlier reaction. */
  removedAt?: string;
}

export interface ReactionAggregate {
  /** reaction → count of distinct users currently reacting with it */
  counts: Record<Reaction, number>;
  /** the calling user's currently-active reaction on this comment, or null */
  userReaction: Reaction | null;
}

// ---------------------------------------------------------------------------
// Legacy compatibility shim
// ---------------------------------------------------------------------------
//
// Rows in the persisted JSONL may use the legacy `emoji` field rather than
// the new `reaction` field. We normalise on read: prefer `reaction` when
// present and valid, otherwise translate `emoji` → `reaction` where the
// mapping is unambiguous (currently only ❤️ → heart). Off-list values
// drop to `null` and are skipped during replay.

const LEGACY_EMOJI_TO_REACTION: Record<string, Reaction> = {
  "❤️": "heart",
};

function normalizeRow(raw: unknown): CommentReaction | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (typeof row.commentId !== "string" || typeof row.clerkUserId !== "string") {
    return null;
  }
  if (typeof row.createdAt !== "string") return null;
  const removedAt =
    typeof row.removedAt === "string" ? row.removedAt : undefined;

  // New schema first.
  if (isAllowedReaction(row.reaction)) {
    return {
      commentId: row.commentId,
      clerkUserId: row.clerkUserId,
      reaction: row.reaction,
      createdAt: row.createdAt,
      ...(removedAt ? { removedAt } : {}),
    };
  }

  // Legacy emoji fallback — only the heart maps onto the new vocabulary.
  if (typeof row.emoji === "string") {
    const mapped = LEGACY_EMOJI_TO_REACTION[row.emoji];
    if (mapped) {
      return {
        commentId: row.commentId,
        clerkUserId: row.clerkUserId,
        reaction: mapped,
        createdAt: row.createdAt,
        ...(removedAt ? { removedAt } : {}),
      };
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Internal: replay the log into the active set for a single comment
// ---------------------------------------------------------------------------
//
// activeByUser holds the user's CURRENT reaction selection (null = none).
// "Last write wins" per (commentId, userId, reaction): a remove flips the
// slot to null; an add overwrites whatever was there. Because the toggle
// API always pairs a remove with an add when switching reactions, the
// activeByUser slot accurately reflects the latest intent at any point
// in the log.

function buildActiveMap(
  rows: unknown[],
  commentId: string,
): Map<string, Reaction> {
  const activeByUser = new Map<string, Reaction>();
  for (const raw of rows) {
    const row = normalizeRow(raw);
    if (!row) continue;
    if (row.commentId !== commentId) continue;
    if (row.removedAt) {
      // Only clear if the user's current reaction matches the one being
      // removed. A stray `removedAt` for a reaction the user no longer
      // holds shouldn't wipe a newer add.
      if (activeByUser.get(row.clerkUserId) === row.reaction) {
        activeByUser.delete(row.clerkUserId);
      }
      continue;
    }
    activeByUser.set(row.clerkUserId, row.reaction);
  }
  return activeByUser;
}

function emptyCounts(): Record<Reaction, number> {
  const counts = {} as Record<Reaction, number>;
  for (const r of ALLOWED_REACTIONS) counts[r] = 0;
  return counts;
}

function aggregateFromActiveMap(
  activeByUser: Map<string, Reaction>,
  clerkUserId: string | null,
): ReactionAggregate {
  const counts = emptyCounts();
  let userReaction: Reaction | null = null;
  for (const [userId, reaction] of activeByUser) {
    counts[reaction] = (counts[reaction] ?? 0) + 1;
    if (clerkUserId !== null && userId === clerkUserId) {
      userReaction = reaction;
    }
  }
  return { counts, userReaction };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute the active reaction aggregate for a comment. `clerkUserId` is
 * the calling user — pass `null` for anonymous GETs (the `userReaction`
 * field will be null in that case).
 */
export async function getReactionsForComment(
  commentId: string,
  clerkUserId: string | null,
): Promise<ReactionAggregate> {
  const rows = await readJsonlFile<unknown>(REPO_COMMENT_REACTIONS_FILE);
  const activeByUser = buildActiveMap(rows, commentId);
  return aggregateFromActiveMap(activeByUser, clerkUserId);
}

/**
 * Build a zero-filled aggregate. Useful as a fallback when the underlying
 * JSONL read fails — callers can hand this to the client widgets so they
 * still render the (empty) reaction row instead of nothing.
 */
export function emptyReactionAggregate(): ReactionAggregate {
  return { counts: emptyCounts(), userReaction: null };
}

/**
 * Toggle one user's reaction on one comment.
 *
 * Semantics:
 *   - same reaction already active     → append a removal row, slot clears
 *   - different reaction already active → append removal of old + add of new
 *   - no current reaction              → append add of new
 *
 * Returns the post-toggle aggregate so the caller can respond with the
 * fresh state without re-reading the log.
 *
 * Rejects reactions that aren't on the whitelist by throwing — the route
 * handler is expected to validate first via the Zod schema and never
 * forward an off-list value.
 */
export async function toggleReaction(input: {
  commentId: string;
  clerkUserId: string;
  reaction: Reaction;
}): Promise<ReactionAggregate> {
  const { commentId, clerkUserId, reaction } = input;
  if (!isAllowedReaction(reaction)) {
    throw new Error(
      `reaction ${JSON.stringify(reaction)} is not in the reaction whitelist`,
    );
  }

  const rows = await readJsonlFile<unknown>(REPO_COMMENT_REACTIONS_FILE);
  const activeByUser = buildActiveMap(rows, commentId);
  const current = activeByUser.get(clerkUserId) ?? null;
  const now = new Date().toISOString();

  if (current === reaction) {
    // Toggle off — append the removal row and clear the slot.
    await appendJsonlFile<CommentReaction>(REPO_COMMENT_REACTIONS_FILE, {
      commentId,
      clerkUserId,
      reaction,
      createdAt: now,
      removedAt: now,
    });
    activeByUser.delete(clerkUserId);
  } else {
    // Switching reactions — append the removal of the old (if any) THEN
    // the new add. Append order matters because the replay reads top-down.
    if (current !== null) {
      await appendJsonlFile<CommentReaction>(REPO_COMMENT_REACTIONS_FILE, {
        commentId,
        clerkUserId,
        reaction: current,
        createdAt: now,
        removedAt: now,
      });
    }
    await appendJsonlFile<CommentReaction>(REPO_COMMENT_REACTIONS_FILE, {
      commentId,
      clerkUserId,
      reaction,
      createdAt: now,
    });
    activeByUser.set(clerkUserId, reaction);
  }

  return aggregateFromActiveMap(activeByUser, clerkUserId);
}
