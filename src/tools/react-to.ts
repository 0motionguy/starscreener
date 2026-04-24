// StarScreener — `react_to` agent write tool.
//
// Toggles a reaction on a repo or idea. Requires an INTERNAL_AGENT_
// TOKENS_JSON principal — the principal becomes the userId of the
// reaction row, so the same toggle semantics the web UI uses apply
// (a second call with the same principal + target + type removes
// the row).

import {
  countReactions,
  listReactionsForObject,
  toggleReaction,
} from "../lib/reactions";
import {
  isReactionObjectType,
  isReactionType,
  type ReactionCounts,
  type ReactionObjectType,
  type ReactionType,
  type UserReactionState,
} from "../lib/reactions-shape";
import { userReactionsFor } from "../lib/reactions";
import { AuthError, ParamError } from "./errors";
import type { ToolCallContext } from "./index";

export interface ReactToParams {
  objectType: ReactionObjectType;
  objectId: string;
  reactionType: ReactionType;
}

export interface ReactToResult {
  toggled: "added" | "removed";
  object_type: ReactionObjectType;
  object_id: string;
  reaction_type: ReactionType;
  counts: ReactionCounts;
  mine: UserReactionState;
}

export function parseReactToParams(raw: unknown): ReactToParams {
  if (raw === null || typeof raw !== "object") {
    throw new ParamError("params must be an object");
  }
  const r = raw as Record<string, unknown>;
  if (!isReactionObjectType(r.objectType)) {
    throw new ParamError("objectType must be 'repo' or 'idea'");
  }
  if (typeof r.objectId !== "string" || !r.objectId.trim()) {
    throw new ParamError("objectId must be a non-empty string");
  }
  if (!isReactionType(r.reactionType)) {
    throw new ParamError(
      "reactionType must be one of 'build' | 'use' | 'buy' | 'invest'",
    );
  }
  return {
    objectType: r.objectType,
    objectId: r.objectId.trim(),
    reactionType: r.reactionType,
  };
}

export async function reactToTool(
  raw: unknown,
  ctx?: ToolCallContext,
): Promise<ReactToResult> {
  const principal = ctx?.principal;
  if (!principal) {
    throw new AuthError(
      "react_to requires an authenticated agent principal (set INTERNAL_AGENT_TOKENS_JSON).",
    );
  }

  const params = parseReactToParams(raw);
  const result = await toggleReaction({
    userId: principal,
    objectType: params.objectType,
    objectId: params.objectId,
    reactionType: params.reactionType,
  });

  const records = await listReactionsForObject(
    params.objectType,
    params.objectId,
  );
  return {
    toggled: result.kind === "added" ? "added" : "removed",
    object_type: params.objectType,
    object_id: params.objectId,
    reaction_type: params.reactionType,
    counts: countReactions(records),
    mine: userReactionsFor(principal, records),
  };
}

export const REACT_TO_PORTAL_PARAMS = {
  objectType: {
    type: "string",
    required: true,
    description: "Target kind: 'repo' or 'idea'.",
  },
  objectId: {
    type: "string",
    required: true,
    description:
      "For 'repo' the GitHub 'owner/name' (lowercased by the store). For 'idea' the short idea id.",
  },
  reactionType: {
    type: "string",
    required: true,
    description:
      "One of 'build', 'use', 'buy', 'invest'. Toggle: second call with the same trio removes the reaction.",
  },
} as const;

export const REACT_TO_INPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["objectType", "objectId", "reactionType"],
  properties: {
    objectType: { type: "string", enum: ["repo", "idea"] },
    objectId: { type: "string", minLength: 1 },
    reactionType: {
      type: "string",
      enum: ["build", "use", "buy", "invest"],
    },
  },
} as const;

export const REACT_TO_DESCRIPTION =
  "Toggle a builder reaction (build / use / buy / invest) on a repo or idea as the authenticated agent. Returns the post-toggle counts and the principal's per-type state on the target.";
