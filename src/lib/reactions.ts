// Builder reactions — "would build / would use / would buy / would invest"
// signal capture on a target object (repo today, idea later).
//
// Storage model: one JSONL file (.data/reactions.jsonl), one row per
// active reaction. Toggle semantics — second `react()` for the same
// (user, object, type) deletes the row instead of duplicating it.
//
// Concurrency: every mutation goes through `mutateJsonlFile` so the
// per-file async lock from src/lib/pipeline/storage/file-persistence.ts
// keeps two concurrent reactions on the same target from both inserting
// (or both believing they were the toggle-off and both deleting).
//
// Identity: callers must pre-resolve userId via verifyUserAuth — this
// module has no concept of authentication. Anonymous reactions are not
// supported because the signal would be worthless.

import { randomUUID } from "node:crypto";

import {
  mutateJsonlFile,
  readJsonlFile,
} from "@/lib/pipeline/storage/file-persistence";

export const REACTIONS_FILE = "reactions.jsonl";

// The four canonical reaction types. Adding a fifth requires touching:
//   1. this set
//   2. the buy/invest "high commitment" set below
//   3. the UI button strip in <RepoReactions />
//   4. the ranking weight constants in /api/reactions count consumers
// Keep it intentionally small — every new type dilutes signal density.
export const REACTION_TYPES = ["build", "use", "buy", "invest"] as const;
export type ReactionType = (typeof REACTION_TYPES)[number];

// "buy" and "invest" carry stronger commitment. Callers (the UI) are
// expected to gate them behind a confirm modal; the storage layer does
// not enforce — the rule is a UX one, not a data one.
export const HIGH_COMMITMENT_REACTIONS: ReadonlySet<ReactionType> = new Set([
  "buy",
  "invest",
]);

// The only object kinds we accept today. "idea" is reserved for when the
// idea entity ships — accepting it now would mean an unbounded surface.
export const REACTION_OBJECT_TYPES = ["repo"] as const;
export type ReactionObjectType = (typeof REACTION_OBJECT_TYPES)[number];

export interface ReactionRecord {
  id: string;
  userId: string;
  objectType: ReactionObjectType;
  objectId: string;
  reactionType: ReactionType;
  createdAt: string; // ISO
}

export type ReactionCounts = Record<ReactionType, number>;

/** Initial all-zero counts object. Exported so consumers don't open-code it. */
export function emptyReactionCounts(): ReactionCounts {
  const out = {} as ReactionCounts;
  for (const type of REACTION_TYPES) out[type] = 0;
  return out;
}

export function isReactionType(value: unknown): value is ReactionType {
  return (
    typeof value === "string" &&
    (REACTION_TYPES as readonly string[]).includes(value)
  );
}

export function isReactionObjectType(
  value: unknown,
): value is ReactionObjectType {
  return (
    typeof value === "string" &&
    (REACTION_OBJECT_TYPES as readonly string[]).includes(value)
  );
}

// All reactions (read-only). Sorted by createdAt asc so callers that
// stream this don't need to re-sort. Counts code never iterates the whole
// file in a hot path — it derives counts via small per-target slices.
export async function listReactions(): Promise<ReactionRecord[]> {
  const records = await readJsonlFile<ReactionRecord>(REACTIONS_FILE);
  return records.sort(
    (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
  );
}

export async function listReactionsForObject(
  objectType: ReactionObjectType,
  objectId: string,
): Promise<ReactionRecord[]> {
  const records = await listReactions();
  const targetId = objectId.toLowerCase();
  return records.filter(
    (r) =>
      r.objectType === objectType && r.objectId.toLowerCase() === targetId,
  );
}

export function countReactions(records: ReactionRecord[]): ReactionCounts {
  const out = emptyReactionCounts();
  for (const record of records) {
    if (isReactionType(record.reactionType)) {
      out[record.reactionType] += 1;
    }
  }
  return out;
}

export interface UserReactionState {
  build: boolean;
  use: boolean;
  buy: boolean;
  invest: boolean;
}

export function userReactionsFor(
  userId: string,
  records: ReactionRecord[],
): UserReactionState {
  const state: UserReactionState = {
    build: false,
    use: false,
    buy: false,
    invest: false,
  };
  for (const record of records) {
    if (record.userId !== userId) continue;
    if (isReactionType(record.reactionType)) {
      state[record.reactionType] = true;
    }
  }
  return state;
}

export type ToggleReactionResult =
  | { kind: "added"; record: ReactionRecord }
  | { kind: "removed"; previousId: string };

/**
 * Toggle a reaction. If the (user, object, type) row exists it is removed;
 * otherwise it is created. Atomic: the read-check-write happens inside the
 * per-file lock so concurrent toggles cannot both believe they were the
 * "first" and both insert (or both delete).
 *
 * objectId is normalized via toLowerCase so case-insensitive identifiers
 * (e.g., GitHub fullNames) map to one canonical row.
 */
export async function toggleReaction(input: {
  userId: string;
  objectType: ReactionObjectType;
  objectId: string;
  reactionType: ReactionType;
}): Promise<ToggleReactionResult> {
  const objectId = input.objectId.toLowerCase();
  let result: ToggleReactionResult | null = null;

  await mutateJsonlFile<ReactionRecord>(REACTIONS_FILE, (current) => {
    const matchIdx = current.findIndex(
      (r) =>
        r.userId === input.userId &&
        r.objectType === input.objectType &&
        r.objectId.toLowerCase() === objectId &&
        r.reactionType === input.reactionType,
    );
    if (matchIdx !== -1) {
      const previous = current[matchIdx]!;
      const next = [...current];
      next.splice(matchIdx, 1);
      result = { kind: "removed", previousId: previous.id };
      return next;
    }
    const record: ReactionRecord = {
      id: randomUUID(),
      userId: input.userId,
      objectType: input.objectType,
      objectId,
      reactionType: input.reactionType,
      createdAt: new Date().toISOString(),
    };
    result = { kind: "added", record };
    return [...current, record];
  });

  if (!result) {
    throw new Error("toggleReaction transaction did not produce a result");
  }
  return result;
}
