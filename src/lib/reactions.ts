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
//
// CLIENT BOUNDARY: this module pulls in node:fs via file-persistence and
// node:crypto. Client components MUST import pure shapes from
// `@/lib/reactions-shape` instead — never from here. The re-exports below
// keep every server-side consumer on one import path.

import { randomUUID } from "node:crypto";

import {
  mutateJsonlFile,
  readJsonlFile,
} from "@/lib/pipeline/storage/file-persistence";

export {
  REACTION_TYPES,
  HIGH_COMMITMENT_REACTIONS,
  REACTION_OBJECT_TYPES,
  emptyReactionCounts,
  isReactionType,
  isReactionObjectType,
  type ReactionType,
  type ReactionObjectType,
  type ReactionRecord,
  type ReactionCounts,
  type UserReactionState,
} from "@/lib/reactions-shape";
import {
  emptyReactionCounts,
  isReactionType,
  type ReactionCounts,
  type ReactionObjectType,
  type ReactionRecord,
  type ReactionType,
  type UserReactionState,
} from "@/lib/reactions-shape";

export const REACTIONS_FILE = "reactions.jsonl";

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

/**
 * Batched read for N target objects of the same type. Reads the JSONL
 * once, groups by lowercased objectId, returns a Map keyed on the
 * caller-supplied (un-lowercased) ids so the result is index-friendly.
 *
 * Replaces the N-times-`listReactionsForObject` pattern in
 * /api/ideas — that one read the whole reactions file once per visible
 * idea (APP-08).
 */
export async function listReactionsForObjects(
  objectType: ReactionObjectType,
  objectIds: ReadonlyArray<string>,
): Promise<Map<string, ReactionRecord[]>> {
  const out = new Map<string, ReactionRecord[]>();
  if (objectIds.length === 0) return out;

  const wantedKeys = new Set<string>();
  const idByKey = new Map<string, string>();
  for (const id of objectIds) {
    const key = id.toLowerCase();
    wantedKeys.add(key);
    if (!idByKey.has(key)) idByKey.set(key, id);
    out.set(id, []);
  }

  const records = await listReactions();
  for (const record of records) {
    if (record.objectType !== objectType) continue;
    const key = record.objectId.toLowerCase();
    if (!wantedKeys.has(key)) continue;
    const callerId = idByKey.get(key)!;
    const bucket = out.get(callerId);
    if (bucket) bucket.push(record);
  }
  return out;
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
