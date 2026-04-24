// Client-safe shape exports for builder reactions.
//
// This module intentionally has ZERO node:* imports so it can be imported
// from `"use client"` components (RepoReactions.tsx) without dragging
// file-persistence / node:fs into the client bundle. The server-side IO
// functions live in `src/lib/reactions.ts` which re-exports these shapes
// for backward compat with existing server callers.

export const REACTION_TYPES = ["build", "use", "buy", "invest"] as const;
export type ReactionType = (typeof REACTION_TYPES)[number];

export const HIGH_COMMITMENT_REACTIONS: ReadonlySet<ReactionType> = new Set([
  "buy",
  "invest",
]);

export const REACTION_OBJECT_TYPES = ["repo", "idea"] as const;
export type ReactionObjectType = (typeof REACTION_OBJECT_TYPES)[number];

export interface ReactionRecord {
  id: string;
  userId: string;
  objectType: ReactionObjectType;
  objectId: string;
  reactionType: ReactionType;
  createdAt: string;
}

export type ReactionCounts = Record<ReactionType, number>;

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

export interface UserReactionState {
  build: boolean;
  use: boolean;
  buy: boolean;
  invest: boolean;
}
