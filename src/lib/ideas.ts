// Idea entity — user-submitted "what should be built." The new content
// type that anchors the social layer.
//
// Storage: .data/ideas.jsonl, atomic via mutateJsonlFile so concurrent
// posts and concurrent moderation rewrites cannot drop or duplicate rows.
//
// Approval gate: an author's first 5 ideas land in `pending_moderation`.
// Once 5 are approved, subsequent posts auto-publish. This bounds the
// review workload while still pre-screening every brand-new account.
//
// Identity: callers must pre-resolve authorId via verifyUserAuth — this
// module never trusts a body-supplied authorId (the API route enforces
// that contract by overwriting any body field). authorHandle is the
// userId stub for now; once a real users table is populated, the intake
// can do a lookup.
//
// CLIENT BOUNDARY: pulls in node:crypto + file-persistence (node:fs).
// Client components must use `import type` for IdeaRecord / PublicIdea /
// IdeaBuildStatus so the runtime module is never bundled. Once the
// `server-only` package is added to deps, an explicit guard belongs at
// the top of this module.

import { randomBytes } from "node:crypto";

import {
  mutateJsonlFile,
  readJsonlFile,
} from "@/lib/pipeline/storage/file-persistence";
import { normalizeRepoReference } from "@/lib/repo-submissions";
import { autoPostIdeaIfEligible } from "@/lib/twitter/outbound/idea-publisher";

export const IDEAS_FILE = "ideas.jsonl";

// Once an author has APPROVAL_GATE_THRESHOLD approved ideas, subsequent
// posts skip the moderation queue. Tunable here; the value is captured
// on each row (`approved_automatically`) so a later threshold change is
// auditable.
export const APPROVAL_GATE_THRESHOLD = 5;

// Hot-score weights, mirrored in the strategy doc. "buy" and "invest"
// outweigh casual reactions because they imply higher commitment. If
// these change, update src/lib/__tests__/ideas.test.ts ranking math.
export const HOT_SCORE_WEIGHTS = {
  build: 3,
  use: 1,
  buy: 5,
  invest: 8,
  comment: 2,
} as const;

// Recency decay half-life (in hours). At 48h the decay factor halves; at
// 96h it quarters. Keeps the feed fresh without burying still-engaging
// older posts entirely.
export const RECENCY_HALF_LIFE_HOURS = 48;

const MAX_TITLE = 80;
const MIN_TITLE = 8;
const MAX_PITCH = 280;
const MIN_PITCH = 20;
const MAX_BODY = 2000;
const MAX_TARGET_REPOS = 5;
const MAX_TAGS = 6;
const MAX_TAG_LENGTH = 30;
const MAX_HANDLE = 64;

const IDEA_BUILD_STATUSES = [
  "exploring",
  "scoping",
  "building",
  "shipped",
  "abandoned",
] as const;
export type IdeaBuildStatus = (typeof IDEA_BUILD_STATUSES)[number];

const IDEA_STATUSES = [
  "pending_moderation",
  "published",
  "rejected",
  "shipped",
  "archived",
] as const;
export type IdeaStatus = (typeof IDEA_STATUSES)[number];

export function isIdeaBuildStatus(value: unknown): value is IdeaBuildStatus {
  return (
    typeof value === "string" &&
    (IDEA_BUILD_STATUSES as readonly string[]).includes(value)
  );
}

export function isIdeaStatus(value: unknown): value is IdeaStatus {
  return (
    typeof value === "string" &&
    (IDEA_STATUSES as readonly string[]).includes(value)
  );
}

export interface IdeaRecord {
  id: string;
  authorId: string;
  authorHandle: string;
  title: string;
  pitch: string;
  body: string | null;
  status: IdeaStatus;
  buildStatus: IdeaBuildStatus;
  shippedRepoUrl: string | null;
  targetRepos: string[];
  category: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  moderatedAt: string | null;
  moderationNote: string | null;
  approvedAutomatically: boolean;
}

export interface PublicIdea {
  id: string;
  authorHandle: string;
  title: string;
  pitch: string;
  body: string | null;
  status: IdeaStatus;
  buildStatus: IdeaBuildStatus;
  shippedRepoUrl: string | null;
  targetRepos: string[];
  category: string | null;
  tags: string[];
  createdAt: string;
  publishedAt: string | null;
}

export interface CreateIdeaInput {
  authorId: string;
  authorHandle: string;
  title: string;
  pitch: string;
  body?: string | null;
  targetRepos?: string[];
  category?: string | null;
  tags?: string[];
  buildStatus?: IdeaBuildStatus;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeMultiline(value: string): string {
  return value
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}

export interface IdeaValidationError {
  field: string;
  message: string;
}

export function validateIdeaInput(
  raw: unknown,
):
  | { ok: true; value: Omit<CreateIdeaInput, "authorId" | "authorHandle"> }
  | { ok: false; errors: IdeaValidationError[] } {
  const errors: IdeaValidationError[] = [];
  if (raw === null || typeof raw !== "object") {
    return {
      ok: false,
      errors: [{ field: "_root", message: "body must be a JSON object" }],
    };
  }
  const body = raw as Record<string, unknown>;

  const titleRaw = typeof body.title === "string" ? body.title : "";
  const title = normalizeWhitespace(titleRaw);
  if (title.length < MIN_TITLE || title.length > MAX_TITLE) {
    errors.push({
      field: "title",
      message: `title must be ${MIN_TITLE}-${MAX_TITLE} characters`,
    });
  }

  const pitchRaw = typeof body.pitch === "string" ? body.pitch : "";
  const pitch = normalizeWhitespace(pitchRaw);
  if (pitch.length < MIN_PITCH || pitch.length > MAX_PITCH) {
    errors.push({
      field: "pitch",
      message: `pitch must be ${MIN_PITCH}-${MAX_PITCH} characters`,
    });
  }
  // No URLs in pitch — markdown links only, in body. Stops drive-by spam
  // posts from front-loading a destination.
  if (/https?:\/\//i.test(pitch)) {
    errors.push({
      field: "pitch",
      message: "pitch must not contain URLs (use the body field instead)",
    });
  }

  let body_: string | null = null;
  if (body.body !== undefined && body.body !== null) {
    if (typeof body.body !== "string") {
      errors.push({ field: "body", message: "body must be a string" });
    } else {
      const normalized = normalizeMultiline(body.body);
      if (normalized.length > MAX_BODY) {
        errors.push({
          field: "body",
          message: `body must be <= ${MAX_BODY} characters`,
        });
      } else if (normalized.length > 0) {
        body_ = normalized;
      }
    }
  }

  // targetRepos: array of GitHub fullName strings; normalize via the same
  // helper the repo-submission intake uses so we accept URL or owner/name.
  const targetRepos: string[] = [];
  if (body.targetRepos !== undefined && body.targetRepos !== null) {
    if (!Array.isArray(body.targetRepos)) {
      errors.push({
        field: "targetRepos",
        message: "targetRepos must be an array of strings",
      });
    } else if (body.targetRepos.length > MAX_TARGET_REPOS) {
      errors.push({
        field: "targetRepos",
        message: `targetRepos must contain at most ${MAX_TARGET_REPOS} entries`,
      });
    } else {
      for (const entry of body.targetRepos) {
        if (typeof entry !== "string") {
          errors.push({
            field: "targetRepos",
            message: "every targetRepos entry must be a string",
          });
          continue;
        }
        const normalized = normalizeRepoReference(entry);
        if (!normalized) {
          errors.push({
            field: "targetRepos",
            message: `'${entry}' is not a valid GitHub repo reference`,
          });
          continue;
        }
        if (!targetRepos.includes(normalized.fullName)) {
          targetRepos.push(normalized.fullName);
        }
      }
    }
  }

  let category: string | null = null;
  if (body.category !== undefined && body.category !== null) {
    if (typeof body.category !== "string") {
      errors.push({ field: "category", message: "category must be a string" });
    } else {
      const normalized = body.category.trim().toLowerCase();
      // We don't enforce category against the repos taxonomy here — the
      // category list is data-driven and may evolve. The /api/ideas route
      // can do a stricter check against listCategories() if desired.
      if (normalized.length > 0) category = normalized;
    }
  }

  const tags: string[] = [];
  if (body.tags !== undefined && body.tags !== null) {
    if (!Array.isArray(body.tags)) {
      errors.push({ field: "tags", message: "tags must be an array of strings" });
    } else if (body.tags.length > MAX_TAGS) {
      errors.push({
        field: "tags",
        message: `tags must contain at most ${MAX_TAGS} entries`,
      });
    } else {
      for (const entry of body.tags) {
        if (typeof entry !== "string") {
          errors.push({ field: "tags", message: "every tag must be a string" });
          continue;
        }
        const normalized = entry.trim().toLowerCase();
        if (!normalized) continue;
        if (normalized.length > MAX_TAG_LENGTH) {
          errors.push({
            field: "tags",
            message: `tag '${normalized}' exceeds ${MAX_TAG_LENGTH} characters`,
          });
          continue;
        }
        if (!tags.includes(normalized)) tags.push(normalized);
      }
    }
  }

  let buildStatus: IdeaBuildStatus = "exploring";
  if (body.buildStatus !== undefined && body.buildStatus !== null) {
    if (!isIdeaBuildStatus(body.buildStatus)) {
      errors.push({
        field: "buildStatus",
        message: `buildStatus must be one of: ${IDEA_BUILD_STATUSES.join(", ")}`,
      });
    } else {
      buildStatus = body.buildStatus;
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    value: {
      title,
      pitch,
      body: body_,
      targetRepos,
      category,
      tags,
      buildStatus,
    },
  };
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

/**
 * Generate a short URL-safe id (8 chars from a 6-byte buffer, base64url).
 * Collision probability across 1M ids is ~10^-6, well below sane scale.
 */
function shortId(): string {
  return randomBytes(6).toString("base64url");
}

export async function listIdeas(): Promise<IdeaRecord[]> {
  const records = await readJsonlFile<IdeaRecord>(IDEAS_FILE);
  return records.sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );
}

export async function getIdeaById(id: string): Promise<IdeaRecord | null> {
  const records = await listIdeas();
  return records.find((r) => r.id === id) ?? null;
}

export async function listIdeasByAuthor(
  authorId: string,
): Promise<IdeaRecord[]> {
  const records = await listIdeas();
  return records.filter((r) => r.authorId === authorId);
}

export async function countApprovedByAuthor(authorId: string): Promise<number> {
  const records = await listIdeasByAuthor(authorId);
  // "Approved" for gating purposes = anything that passed moderation,
  // whether currently published, shipped, or archived. Rejected and
  // pending don't count.
  return records.filter(
    (r) =>
      r.status === "published" ||
      r.status === "shipped" ||
      r.status === "archived",
  ).length;
}

export function toPublicIdea(record: IdeaRecord): PublicIdea {
  return {
    id: record.id,
    authorHandle: record.authorHandle,
    title: record.title,
    pitch: record.pitch,
    body: record.body,
    status: record.status,
    buildStatus: record.buildStatus,
    shippedRepoUrl: record.shippedRepoUrl,
    targetRepos: record.targetRepos,
    category: record.category,
    tags: record.tags,
    createdAt: record.createdAt,
    publishedAt: record.publishedAt,
  };
}

export type CreateIdeaResult =
  | { kind: "queued"; record: IdeaRecord }
  | { kind: "published"; record: IdeaRecord }
  | { kind: "duplicate"; existing: IdeaRecord };

/**
 * Create an idea. The author's prior approved-idea count is consulted
 * inside the per-file lock so the gate decision and the write are
 * atomic — two simultaneous posts from the same brand-new author can't
 * both auto-publish by reading a stale "0 approved" snapshot.
 */
export async function createIdea(
  input: CreateIdeaInput,
): Promise<CreateIdeaResult> {
  const handle = normalizeWhitespace(input.authorHandle).slice(0, MAX_HANDLE);
  if (!handle) {
    throw new Error("authorHandle must be a non-empty string");
  }

  // Single-element holder instead of a closure-captured `let`. TS's
  // control-flow narrowing on closure-assigned `let` gets confused
  // after an await; a mutable object reference sidesteps that.
  const holder: { value: CreateIdeaResult | null } = { value: null };
  const now = new Date().toISOString();

  await mutateJsonlFile<IdeaRecord>(IDEAS_FILE, (current) => {
    // Same-title-same-author guard: if this author already has a non-
    // rejected idea with this title, surface the existing row instead of
    // appending a duplicate. Title is matched case-insensitively.
    const lowered = input.title.toLowerCase();
    const duplicate = current.find(
      (r) =>
        r.authorId === input.authorId &&
        r.status !== "rejected" &&
        r.title.toLowerCase() === lowered,
    );
    if (duplicate) {
      holder.value = { kind: "duplicate", existing: duplicate };
      return current;
    }

    const approvedCount = current.filter(
      (r) =>
        r.authorId === input.authorId &&
        (r.status === "published" ||
          r.status === "shipped" ||
          r.status === "archived"),
    ).length;
    const autoApproved = approvedCount >= APPROVAL_GATE_THRESHOLD;
    const status: IdeaStatus = autoApproved ? "published" : "pending_moderation";

    const record: IdeaRecord = {
      id: shortId(),
      authorId: input.authorId,
      authorHandle: handle,
      title: input.title,
      pitch: input.pitch,
      body: input.body ?? null,
      status,
      buildStatus: input.buildStatus ?? "exploring",
      shippedRepoUrl: null,
      targetRepos: input.targetRepos ?? [],
      category: input.category ?? null,
      tags: input.tags ?? [],
      createdAt: now,
      updatedAt: now,
      publishedAt: autoApproved ? now : null,
      moderatedAt: autoApproved ? now : null,
      moderationNote: null,
      approvedAutomatically: autoApproved,
    };

    holder.value = autoApproved
      ? { kind: "published", record }
      : { kind: "queued", record };
    return [...current, record];
  });

  const result = holder.value;
  if (!result) {
    throw new Error("createIdea transaction did not produce a result");
  }

  // If the gate auto-published this idea, fire the auto-post hook
  // outside the transaction. Same failure-isolation rules as
  // moderateIdea — Twitter can't fail a successful post intake.
  if (result.kind === "published") {
    const finalRecord = result.record;
    void autoPostIdeaIfEligible({
      idea: toPublicIdea(finalRecord),
      authorId: finalRecord.authorId,
      beforeStatus: "",
      afterStatus: finalRecord.status,
    }).catch(() => undefined);
  }

  return result;
}

export type ModerateIdeaAction = "approve" | "reject";

/**
 * Apply a moderation decision. Idempotent re-application is allowed
 * (e.g. an admin re-approving a published idea is a no-op apart from
 * a refreshed moderatedAt). The transition rejected→approved is
 * deliberately allowed so reviewers can correct mistakes.
 *
 * Fires the idea-published auto-post hook AFTER the storage mutation
 * commits. The hook is failure-isolated (never throws back here) and
 * idempotent (re-approves don't re-post). See
 * src/lib/twitter/outbound/idea-publisher.ts.
 */
export async function moderateIdea(input: {
  id: string;
  action: ModerateIdeaAction;
  moderationNote?: string | null;
}): Promise<IdeaRecord> {
  let updated: IdeaRecord | null = null;
  let beforeStatus: IdeaStatus | null = null;
  const now = new Date().toISOString();

  await mutateJsonlFile<IdeaRecord>(IDEAS_FILE, (current) => {
    const idx = current.findIndex((r) => r.id === input.id);
    if (idx === -1) {
      throw new Error(`idea not found: ${input.id}`);
    }
    const before = current[idx]!;
    beforeStatus = before.status;
    const status: IdeaStatus =
      input.action === "approve" ? "published" : "rejected";
    updated = {
      ...before,
      status,
      moderatedAt: now,
      moderationNote: input.moderationNote ?? null,
      publishedAt:
        status === "published" ? before.publishedAt ?? now : before.publishedAt,
      updatedAt: now,
    };
    const next = [...current];
    next[idx] = updated;
    return next;
  });

  if (!updated || !beforeStatus) {
    throw new Error(`moderateIdea returned no updated row for ${input.id}`);
  }

  // Fire-and-forget auto-post. Failures in Twitter (or a missing
  // token in prod) MUST NOT surface to the admin as a moderation
  // error — the moderation decision already persisted above. The
  // hook writes its own audit row for observability.
  const finalRecord: IdeaRecord = updated;
  const priorStatus: IdeaStatus = beforeStatus;
  void autoPostIdeaIfEligible({
    idea: toPublicIdea(finalRecord),
    authorId: finalRecord.authorId,
    beforeStatus: priorStatus,
    afterStatus: finalRecord.status,
  }).catch(() => undefined);

  return updated;
}

/**
 * Update lifecycle fields on an idea — buildStatus, shippedRepoUrl —
 * with an ownership check. Only the author can call this.
 */
export async function updateIdeaLifecycle(input: {
  id: string;
  authorId: string;
  buildStatus?: IdeaBuildStatus;
  shippedRepoUrl?: string | null;
}): Promise<IdeaRecord> {
  let updated: IdeaRecord | null = null;
  const now = new Date().toISOString();

  await mutateJsonlFile<IdeaRecord>(IDEAS_FILE, (current) => {
    const idx = current.findIndex((r) => r.id === input.id);
    if (idx === -1) {
      throw new Error(`idea not found: ${input.id}`);
    }
    const before = current[idx]!;
    if (before.authorId !== input.authorId) {
      throw new Error(`idea not owned by ${input.authorId}`);
    }
    const buildStatus = input.buildStatus ?? before.buildStatus;
    // status auto-promotes to "shipped" the first time buildStatus
    // becomes "shipped" — keeps the public idea status surface in sync
    // with the lifecycle field without forcing a separate moderation.
    const status: IdeaStatus =
      buildStatus === "shipped" && before.status !== "rejected"
        ? "shipped"
        : before.status;
    updated = {
      ...before,
      buildStatus,
      shippedRepoUrl:
        input.shippedRepoUrl !== undefined
          ? input.shippedRepoUrl
          : before.shippedRepoUrl,
      status,
      updatedAt: now,
    };
    const next = [...current];
    next[idx] = updated;
    return next;
  });

  if (!updated) {
    throw new Error("updateIdeaLifecycle produced no result");
  }
  return updated;
}

// ---------------------------------------------------------------------------
// Ranking — Hot score
// ---------------------------------------------------------------------------

export interface ReactionTallyForIdea {
  build: number;
  use: number;
  buy: number;
  invest: number;
  comment?: number;
}

/**
 * Compute the Hot-feed score for an idea given its current reaction
 * counts. Pure function — exported so tests can pin the math without
 * touching the storage layer.
 *
 * score = sum(reaction * weight) * exp(-hours_since_post / half_life)
 */
export function hotScore(
  idea: Pick<IdeaRecord, "createdAt">,
  tally: ReactionTallyForIdea,
  now: number = Date.now(),
): number {
  const raw =
    tally.build * HOT_SCORE_WEIGHTS.build +
    tally.use * HOT_SCORE_WEIGHTS.use +
    tally.buy * HOT_SCORE_WEIGHTS.buy +
    tally.invest * HOT_SCORE_WEIGHTS.invest +
    (tally.comment ?? 0) * HOT_SCORE_WEIGHTS.comment;

  const ageHours =
    (now - Date.parse(idea.createdAt)) / (1000 * 60 * 60);
  const decay = Math.exp(-ageHours / RECENCY_HALF_LIFE_HOURS);
  return raw * decay;
}
