// StarScreener — `submit_idea` agent write tool.
//
// Agent-native "post an idea" entry point. Requires an INTERNAL_AGENT_
// TOKENS_JSON principal — the principal name becomes the authorId of
// the resulting idea so the row is attributable ("built by agent
// 'claude'") and the existing moderation / rate-limit / per-author
// gate all kick in the same as the web composer.

import {
  createIdea,
  toPublicIdea,
  validateIdeaInput,
  type PublicIdea,
} from "../lib/ideas";
import { AuthError, ParamError } from "./errors";
import type { ToolCallContext } from "./index";

export interface SubmitIdeaResult {
  kind: "queued" | "published" | "duplicate";
  idea: PublicIdea;
}

export async function submitIdeaTool(
  raw: unknown,
  ctx?: ToolCallContext,
): Promise<SubmitIdeaResult> {
  const principal = ctx?.principal;
  if (!principal) {
    throw new AuthError(
      "submit_idea requires an authenticated agent principal (set INTERNAL_AGENT_TOKENS_JSON).",
    );
  }

  const validated = validateIdeaInput(raw);
  if (!validated.ok) {
    const first = validated.errors[0];
    throw new ParamError(
      `${first?.field ?? "_root"}: ${first?.message ?? "validation failed"}`,
    );
  }

  // The principal string maps to BOTH authorId and authorHandle in the
  // v1 identity model. Matches the web route (src/app/api/ideas/route.ts)
  // which also collapses userId → authorHandle.
  const result = await createIdea({
    ...validated.value,
    authorId: principal,
    authorHandle: principal,
  });

  if (result.kind === "duplicate") {
    return { kind: "duplicate", idea: toPublicIdea(result.existing) };
  }
  return {
    kind: result.kind,
    idea: toPublicIdea(result.record),
  };
}

export const SUBMIT_IDEA_PORTAL_PARAMS = {
  title: {
    type: "string",
    required: true,
    description: "Idea title. 8-80 characters.",
  },
  pitch: {
    type: "string",
    required: true,
    description:
      "One-line pitch (20-280 chars, no URLs — use body for links).",
  },
  body: {
    type: "string",
    required: false,
    description: "Optional long-form description, up to 2000 chars.",
  },
  targetRepos: {
    type: "array",
    required: false,
    description:
      "Up to 5 GitHub 'owner/name' references this idea targets or builds on.",
  },
  category: {
    type: "string",
    required: false,
    description: "Category slug (e.g. 'ai', 'devtools').",
  },
  tags: {
    type: "array",
    required: false,
    description: "Up to 6 free-form tags.",
  },
  buildStatus: {
    type: "string",
    required: false,
    description:
      "Author's build status: 'exploring' (default), 'scoping', 'building', 'shipped', 'abandoned'.",
  },
} as const;

export const SUBMIT_IDEA_INPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "pitch"],
  properties: {
    title: { type: "string", minLength: 8, maxLength: 80 },
    pitch: { type: "string", minLength: 20, maxLength: 280 },
    body: { type: "string", maxLength: 2000 },
    targetRepos: {
      type: "array",
      items: { type: "string" },
      maxItems: 5,
    },
    category: { type: "string" },
    tags: {
      type: "array",
      items: { type: "string", maxLength: 30 },
      maxItems: 6,
    },
    buildStatus: {
      type: "string",
      enum: [
        "exploring",
        "scoping",
        "building",
        "shipped",
        "abandoned",
      ],
    },
  },
} as const;

export const SUBMIT_IDEA_DESCRIPTION =
  "Post a new idea as the authenticated agent. Mirrors the web composer: the first 5 ideas from a fresh principal land in the moderation queue; subsequent posts auto-publish. Returns 'duplicate' when the same principal has already posted an active idea with this title.";
