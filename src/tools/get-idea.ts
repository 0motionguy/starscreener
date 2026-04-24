// StarScreener — `get_idea` agent tool.
//
// Single-idea fetch by short id. Mirrors GET /api/ideas/[id]:
// 404s on pending_moderation / rejected ideas so draft text can't be
// read via a known id before moderation runs.

import {
  getIdeaById,
  toPublicIdea,
  type PublicIdea,
} from "../lib/ideas";
import {
  countReactions,
  listReactionsForObject,
} from "../lib/reactions";
import type { ReactionCounts } from "../lib/reactions-shape";
import { NotFoundError, ParamError } from "./errors";

export interface GetIdeaParams {
  id: string;
}

export interface GetIdeaResult {
  idea: PublicIdea;
  reaction_counts: ReactionCounts;
}

export function parseGetIdeaParams(raw: unknown): GetIdeaParams {
  if (raw === null || typeof raw !== "object") {
    throw new ParamError("params must be an object");
  }
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || !r.id.trim()) {
    throw new ParamError("id must be a non-empty string");
  }
  return { id: r.id.trim() };
}

export async function getIdeaTool(raw: unknown): Promise<GetIdeaResult> {
  const params = parseGetIdeaParams(raw);
  const record = await getIdeaById(params.id);
  if (
    !record ||
    record.status === "pending_moderation" ||
    record.status === "rejected"
  ) {
    throw new NotFoundError(`idea '${params.id}' not found`);
  }
  const reactions = await listReactionsForObject("idea", record.id);
  return {
    idea: toPublicIdea(record),
    reaction_counts: countReactions(reactions),
  };
}

export const GET_IDEA_PORTAL_PARAMS = {
  id: {
    type: "string",
    required: true,
    description: "Short idea id (e.g. 'LNvuE4-r').",
  },
} as const;

export const GET_IDEA_INPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["id"],
  properties: {
    id: {
      type: "string",
      minLength: 1,
      description: "Short idea id.",
    },
  },
} as const;

export const GET_IDEA_DESCRIPTION =
  "Fetch a single public idea by its short id, with reaction counts attached. Returns NOT_FOUND for ideas that haven't passed moderation.";
