// Idea contributions — comments / evidence / repo / feature / workaround /
// project / would-use / would-build entries attached to an idea.
//
// Storage: .data/idea-contributions.jsonl, append-only via the same
// file-persistence helpers used by ideas.jsonl. Contributions are
// never edited or deleted in v1 — the JSONL is the authoritative log.
//
// Identity: callers must pre-resolve userId; this module never trusts a
// body-supplied userId. The /api/ideas/[id]/contributions route enforces
// that contract by sourcing userId from requireUser().
//
// CLIENT BOUNDARY: pulls in node:crypto + file-persistence (node:fs).
// Client components must `import type { IdeaContribution }` so the
// runtime module is never bundled.

import { randomBytes } from "node:crypto";

import {
  appendJsonlFile,
  readJsonlFile,
} from "@/lib/pipeline/storage/file-persistence";

export const IDEA_CONTRIBUTIONS_FILE = "idea-contributions.jsonl";

const CONTRIBUTION_TYPES = [
  "comment",
  "evidence",
  "repo",
  "feature",
  "workaround",
  "project",
  "would-use",
  "would-build",
] as const;
export type ContributionType = (typeof CONTRIBUTION_TYPES)[number];

export function isContributionType(value: unknown): value is ContributionType {
  return (
    typeof value === "string" &&
    (CONTRIBUTION_TYPES as readonly string[]).includes(value)
  );
}

const MAX_BODY = 2000;
const MIN_BODY = 1;
const MAX_MENTIONS = 10;
const MAX_MENTION_LENGTH = 120;

export interface IdeaContribution {
  id: string;
  ideaId: string;
  userId: string;
  type: ContributionType;
  body: string;
  /** GitHub owner/name strings referenced inside the body. */
  mentionsRepos: string[];
  /** Free-form skill / tag strings (kebab-case, lower-case). */
  mentionsSkills: string[];
  createdAt: string;
}

/**
 * Public projection of a contribution — strips the raw Clerk userId so
 * GET responses don't expose internal identity handles. The contribution
 * id, idea id, type, body, and mentions are safe; the userId is not. A
 * future iteration can replace this with a derived authorHandle once a
 * users table is populated; until then the field is simply omitted.
 *
 * Mirrors the `toPublicIdea` boundary in src/lib/ideas.ts.
 */
export type PublicIdeaContribution = Omit<IdeaContribution, "userId">;

export function toPublicContribution(
  record: IdeaContribution,
): PublicIdeaContribution {
  return {
    id: record.id,
    ideaId: record.ideaId,
    type: record.type,
    body: record.body,
    mentionsRepos: record.mentionsRepos,
    mentionsSkills: record.mentionsSkills,
    createdAt: record.createdAt,
  };
}

export interface CreateContributionInput {
  ideaId: string;
  userId: string;
  type: ContributionType;
  body: string;
  mentionsRepos?: string[];
  mentionsSkills?: string[];
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface ContributionValidationError {
  field: string;
  message: string;
}

function normalizeMultiline(value: string): string {
  return value
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}

/**
 * Validate the user-supplied portion of a contribution. ideaId and
 * userId are resolved server-side (route params + auth) and are not
 * validated here.
 */
export function validateContributionInput(raw: unknown):
  | {
      ok: true;
      value: Omit<CreateContributionInput, "ideaId" | "userId">;
    }
  | { ok: false; errors: ContributionValidationError[] } {
  const errors: ContributionValidationError[] = [];
  if (raw === null || typeof raw !== "object") {
    return {
      ok: false,
      errors: [{ field: "_root", message: "body must be a JSON object" }],
    };
  }
  const body = raw as Record<string, unknown>;

  let type: ContributionType = "comment";
  if (body.type !== undefined && body.type !== null) {
    if (!isContributionType(body.type)) {
      errors.push({
        field: "type",
        message: `type must be one of: ${CONTRIBUTION_TYPES.join(", ")}`,
      });
    } else {
      type = body.type;
    }
  }

  const bodyRaw = typeof body.body === "string" ? body.body : "";
  const normalizedBody = normalizeMultiline(bodyRaw);
  if (
    normalizedBody.length < MIN_BODY ||
    normalizedBody.length > MAX_BODY
  ) {
    errors.push({
      field: "body",
      message: `body must be ${MIN_BODY}-${MAX_BODY} characters`,
    });
  }

  const mentionsRepos: string[] = [];
  if (body.mentionsRepos !== undefined && body.mentionsRepos !== null) {
    if (!Array.isArray(body.mentionsRepos)) {
      errors.push({
        field: "mentionsRepos",
        message: "mentionsRepos must be an array of strings",
      });
    } else if (body.mentionsRepos.length > MAX_MENTIONS) {
      errors.push({
        field: "mentionsRepos",
        message: `mentionsRepos must contain at most ${MAX_MENTIONS} entries`,
      });
    } else {
      for (const entry of body.mentionsRepos) {
        if (typeof entry !== "string") {
          errors.push({
            field: "mentionsRepos",
            message: "every mentionsRepos entry must be a string",
          });
          continue;
        }
        const trimmed = entry.trim();
        if (!trimmed) continue;
        if (trimmed.length > MAX_MENTION_LENGTH) {
          errors.push({
            field: "mentionsRepos",
            message: `mentionsRepos entry '${trimmed.slice(0, 32)}…' exceeds ${MAX_MENTION_LENGTH} chars`,
          });
          continue;
        }
        if (!mentionsRepos.includes(trimmed)) mentionsRepos.push(trimmed);
      }
    }
  }

  const mentionsSkills: string[] = [];
  if (body.mentionsSkills !== undefined && body.mentionsSkills !== null) {
    if (!Array.isArray(body.mentionsSkills)) {
      errors.push({
        field: "mentionsSkills",
        message: "mentionsSkills must be an array of strings",
      });
    } else if (body.mentionsSkills.length > MAX_MENTIONS) {
      errors.push({
        field: "mentionsSkills",
        message: `mentionsSkills must contain at most ${MAX_MENTIONS} entries`,
      });
    } else {
      for (const entry of body.mentionsSkills) {
        if (typeof entry !== "string") {
          errors.push({
            field: "mentionsSkills",
            message: "every mentionsSkills entry must be a string",
          });
          continue;
        }
        const normalized = entry.trim().toLowerCase();
        if (!normalized) continue;
        if (normalized.length > MAX_MENTION_LENGTH) {
          errors.push({
            field: "mentionsSkills",
            message: `mentionsSkills entry exceeds ${MAX_MENTION_LENGTH} chars`,
          });
          continue;
        }
        if (!mentionsSkills.includes(normalized)) mentionsSkills.push(normalized);
      }
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    value: {
      type,
      body: normalizedBody,
      mentionsRepos,
      mentionsSkills,
    },
  };
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

function shortId(): string {
  return randomBytes(6).toString("base64url");
}

/**
 * Read every contribution and return only those attached to the given
 * idea, sorted by createdAt asc (oldest first — comment threads are
 * read top-down). Returns [] when the file is missing or no rows match.
 */
export async function listContributions(
  ideaId: string,
): Promise<IdeaContribution[]> {
  const records = await readJsonlFile<IdeaContribution>(
    IDEA_CONTRIBUTIONS_FILE,
  );
  return records
    .filter((r) => r.ideaId === ideaId)
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
}

/**
 * Append a contribution row. The route handler resolves userId via
 * requireUser() before calling this — this module never derives identity.
 */
export async function appendContribution(
  input: CreateContributionInput,
): Promise<IdeaContribution> {
  const record: IdeaContribution = {
    id: shortId(),
    ideaId: input.ideaId,
    userId: input.userId,
    type: input.type,
    body: input.body,
    mentionsRepos: input.mentionsRepos ?? [],
    mentionsSkills: input.mentionsSkills ?? [],
    createdAt: new Date().toISOString(),
  };
  await appendJsonlFile(IDEA_CONTRIBUTIONS_FILE, record);
  return record;
}
