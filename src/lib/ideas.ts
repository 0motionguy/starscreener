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

import { AdminRecoverableError } from "@/lib/errors";
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

// IdeaRecord extensions (workspace facts) — three optional, author-set
// metadata fields surfaced on the /ideas/[id] side rail. All three are
// optional / nullable: pre-existing JSONL rows that lack them render as
// em-dash via the consumer. Authors set them at create/edit time; values
// outside the enum are rejected by validateIdeaInput.
//
// `saved` is intentionally NOT on this list — it is per-user state and
// belongs on a future `saved_ideas` join keyed by (userId, ideaId). See
// IdeaSideStack for the TODO.

const IDEA_DIFFICULTIES = ["low", "medium", "high"] as const;
export type IdeaDifficulty = (typeof IDEA_DIFFICULTIES)[number];

const IDEA_MVP_ESTIMATES = ["weekend", "1-2 weeks", "month+"] as const;
export type IdeaMvpEstimate = (typeof IDEA_MVP_ESTIMATES)[number];

const IDEA_LAUNCH_POTENTIALS = ["low", "medium", "high"] as const;
export type IdeaLaunchPotential = (typeof IDEA_LAUNCH_POTENTIALS)[number];

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

export function isIdeaDifficulty(value: unknown): value is IdeaDifficulty {
  return (
    typeof value === "string" &&
    (IDEA_DIFFICULTIES as readonly string[]).includes(value)
  );
}

export function isIdeaMvpEstimate(value: unknown): value is IdeaMvpEstimate {
  return (
    typeof value === "string" &&
    (IDEA_MVP_ESTIMATES as readonly string[]).includes(value)
  );
}

export function isIdeaLaunchPotential(
  value: unknown,
): value is IdeaLaunchPotential {
  return (
    typeof value === "string" &&
    (IDEA_LAUNCH_POTENTIALS as readonly string[]).includes(value)
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
  /**
   * Claim ownership (Phase 4C). Optional/back-compatible — pre-existing
   * rows have undefined for both. Set by `claimIdea` when a signed-in
   * user picks the idea up; `buildStatus` flips from "exploring" →
   * "scoping" at the same moment so the public surface reflects that
   * someone is actively scoping it.
   */
  claimedBy?: string;
  claimedAt?: string;
  /**
   * Workspace-facts extensions. All three are optional/back-compatible —
   * pre-existing JSONL rows render em-dash via the side-rail consumer.
   * Author-set at create/edit time; enum values enforced by validation.
   */
  difficulty?: IdeaDifficulty;
  mvpEstimate?: IdeaMvpEstimate;
  launchPotential?: IdeaLaunchPotential;
  /**
   * Persisted brief markdown (Phase 4C). Set by `saveIdeaBrief` once a
   * claimer (or admin) commits an edited brief. Optional/back-compatible
   * — pre-existing rows have undefined here and the UI falls back to the
   * static template in `IdeaBriefTab.blocksFor()`.
   *
   * `briefVersion` is a monotonically-increasing integer used for
   * optimistic concurrency: the client sends the version it last read,
   * the writer rejects (returns `stale`) if the stored version is
   * higher. Starts at 1 on first save.
   */
  briefMarkdown?: string;
  briefSavedAt?: string;
  briefSavedBy?: string;
  briefVersion?: number;
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
  /** Claim ownership exposed to the public surface (Phase 4C). */
  claimedBy?: string;
  claimedAt?: string;
  /** Workspace-facts extensions — mirrors IdeaRecord. */
  difficulty?: IdeaDifficulty;
  mvpEstimate?: IdeaMvpEstimate;
  launchPotential?: IdeaLaunchPotential;
  /**
   * Persisted brief mirror — see IdeaRecord. Exposed publicly because the
   * brief is the rendered content of the idea's primary surface; the
   * `briefSavedBy` user-id is the same shape as `claimedBy` (Clerk id),
   * which is already public on PublicIdea, so no extra disclosure surface.
   */
  briefMarkdown?: string;
  briefSavedAt?: string;
  briefSavedBy?: string;
  briefVersion?: number;
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
  difficulty?: IdeaDifficulty;
  mvpEstimate?: IdeaMvpEstimate;
  launchPotential?: IdeaLaunchPotential;
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

  // Workspace-facts extensions — all three are optional. Reject unknown
  // enum values; absent fields stay undefined and surface as em-dash.
  let difficulty: IdeaDifficulty | undefined;
  if (body.difficulty !== undefined && body.difficulty !== null) {
    if (!isIdeaDifficulty(body.difficulty)) {
      errors.push({
        field: "difficulty",
        message: `difficulty must be one of: ${IDEA_DIFFICULTIES.join(", ")}`,
      });
    } else {
      difficulty = body.difficulty;
    }
  }

  let mvpEstimate: IdeaMvpEstimate | undefined;
  if (body.mvpEstimate !== undefined && body.mvpEstimate !== null) {
    if (!isIdeaMvpEstimate(body.mvpEstimate)) {
      errors.push({
        field: "mvpEstimate",
        message: `mvpEstimate must be one of: ${IDEA_MVP_ESTIMATES.join(", ")}`,
      });
    } else {
      mvpEstimate = body.mvpEstimate;
    }
  }

  let launchPotential: IdeaLaunchPotential | undefined;
  if (body.launchPotential !== undefined && body.launchPotential !== null) {
    if (!isIdeaLaunchPotential(body.launchPotential)) {
      errors.push({
        field: "launchPotential",
        message: `launchPotential must be one of: ${IDEA_LAUNCH_POTENTIALS.join(", ")}`,
      });
    } else {
      launchPotential = body.launchPotential;
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
      ...(difficulty !== undefined ? { difficulty } : {}),
      ...(mvpEstimate !== undefined ? { mvpEstimate } : {}),
      ...(launchPotential !== undefined ? { launchPotential } : {}),
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
    ...(record.claimedBy !== undefined ? { claimedBy: record.claimedBy } : {}),
    ...(record.claimedAt !== undefined ? { claimedAt: record.claimedAt } : {}),
    ...(record.difficulty !== undefined
      ? { difficulty: record.difficulty }
      : {}),
    ...(record.mvpEstimate !== undefined
      ? { mvpEstimate: record.mvpEstimate }
      : {}),
    ...(record.launchPotential !== undefined
      ? { launchPotential: record.launchPotential }
      : {}),
    ...(record.briefMarkdown !== undefined
      ? { briefMarkdown: record.briefMarkdown }
      : {}),
    ...(record.briefSavedAt !== undefined
      ? { briefSavedAt: record.briefSavedAt }
      : {}),
    ...(record.briefSavedBy !== undefined
      ? { briefSavedBy: record.briefSavedBy }
      : {}),
    ...(record.briefVersion !== undefined
      ? { briefVersion: record.briefVersion }
      : {}),
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
    throw new AdminRecoverableError("authorHandle must be a non-empty string");
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
      ...(input.difficulty !== undefined
        ? { difficulty: input.difficulty }
        : {}),
      ...(input.mvpEstimate !== undefined
        ? { mvpEstimate: input.mvpEstimate }
        : {}),
      ...(input.launchPotential !== undefined
        ? { launchPotential: input.launchPotential }
        : {}),
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
      throw new AdminRecoverableError(`idea not found: ${input.id}`, { id: input.id });
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
    throw new AdminRecoverableError(`moderateIdea returned no updated row for ${input.id}`, { id: input.id });
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
      throw new AdminRecoverableError(`idea not found: ${input.id}`, { id: input.id });
    }
    const before = current[idx]!;
    if (before.authorId !== input.authorId) {
      throw new AdminRecoverableError(`idea not owned by ${input.authorId}`, { authorId: input.authorId });
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

/**
 * Outcome class for `claimIdea`. The route maps these directly to HTTP:
 *   - "claimed"          → 200 (first-time claim by this user)
 *   - "already-by-self"  → 200 (idempotent re-claim by same user)
 *   - "already-by-other" → 409 (someone else owns it)
 *   - "not-found"        → 404
 *   - "not-claimable"    → 409 (idea was rejected / shipped / archived)
 */
export type ClaimIdeaOutcome =
  | { kind: "claimed"; record: IdeaRecord }
  | { kind: "already-by-self"; record: IdeaRecord }
  | { kind: "already-by-other"; record: IdeaRecord }
  | { kind: "not-found" }
  | { kind: "not-claimable"; reason: string };

/**
 * Claim ownership of an idea (Phase 4C).
 *
 * Sets `claimedBy` + `claimedAt` and flips `buildStatus` from
 * "exploring" → "scoping" so the public lifecycle reflects that someone
 * is actively scoping the work. If the idea is already past "scoping"
 * (e.g. building/shipped), the buildStatus is left untouched and only
 * the claim metadata is recorded.
 *
 * Idempotent for the same user. If a different user has already
 * claimed, returns `already-by-other` so the route can 409 without
 * overwriting the existing owner.
 */
export async function claimIdea(
  ideaId: string,
  userId: string,
): Promise<ClaimIdeaOutcome> {
  const holder: { value: ClaimIdeaOutcome | null } = { value: null };
  const now = new Date().toISOString();

  await mutateJsonlFile<IdeaRecord>(IDEAS_FILE, (current) => {
    const idx = current.findIndex((r) => r.id === ideaId);
    if (idx === -1) {
      holder.value = { kind: "not-found" };
      return current;
    }
    const before = current[idx]!;

    // Rejected / shipped / archived ideas are not claimable. "shipped"
    // is owned-by-history; "archived" is closed; "rejected" is private.
    if (
      before.status === "rejected" ||
      before.status === "shipped" ||
      before.status === "archived"
    ) {
      holder.value = {
        kind: "not-claimable",
        reason: `idea is ${before.status}`,
      };
      return current;
    }

    if (before.claimedBy && before.claimedBy === userId) {
      // Same-user re-claim is a no-op apart from the response shape.
      holder.value = { kind: "already-by-self", record: before };
      return current;
    }
    if (before.claimedBy && before.claimedBy !== userId) {
      holder.value = { kind: "already-by-other", record: before };
      return current;
    }

    // Flip "exploring" → "scoping" on first claim. Leave any further-along
    // status (building/shipped/abandoned) untouched — claiming an idea
    // that's mid-build shouldn't regress its lifecycle.
    const nextBuildStatus: IdeaBuildStatus =
      before.buildStatus === "exploring" ? "scoping" : before.buildStatus;

    const updated: IdeaRecord = {
      ...before,
      claimedBy: userId,
      claimedAt: now,
      buildStatus: nextBuildStatus,
      updatedAt: now,
    };
    const next = [...current];
    next[idx] = updated;
    holder.value = { kind: "claimed", record: updated };
    return next;
  });

  if (!holder.value) {
    throw new Error("claimIdea transaction did not produce a result");
  }
  return holder.value;
}

// ---------------------------------------------------------------------------
// Repo attachment (Phase 4D)
// ---------------------------------------------------------------------------

/**
 * Outcome class for repo-attachment writers. Mirrors `ClaimIdeaOutcome`
 * so the route layer can switch over `kind` and map to HTTP status.
 *
 *   - "attached"          → 200 (primary slot now points at fullName)
 *   - "appended"          → 200 (fullName added to related repos)
 *   - "already-attached"  → 409 (slot 0 already holds this repo)
 *   - "already-related"   → 409 (related list already contains this repo)
 *   - "limit-reached"     → 409 (targetRepos at MAX_TARGET_REPOS)
 *   - "not-owner"         → 403 (caller is neither author nor claimer)
 *   - "not-found"         → 404
 *   - "not-mutable"       → 409 (rejected / archived idea)
 */
export type AttachRepoOutcome =
  | { kind: "attached"; record: IdeaRecord }
  | { kind: "appended"; record: IdeaRecord }
  | { kind: "already-attached"; record: IdeaRecord }
  | { kind: "already-related"; record: IdeaRecord }
  | { kind: "limit-reached"; record: IdeaRecord }
  | { kind: "not-owner" }
  | { kind: "not-found" }
  | { kind: "not-mutable"; reason: string };

/**
 * Returns true when `userId` may mutate the idea's repo attachments —
 * i.e. they're either the original author or the current claimer.
 * Anonymous and other-user callers are rejected at the route layer
 * with `not-owner`. Admin override is a separate auth surface
 * (`verifyAdminAuth`) and lives outside Clerk-protected user routes.
 */
function canEditAttachments(record: IdeaRecord, userId: string): boolean {
  return (
    record.authorId === userId ||
    (record.claimedBy !== undefined && record.claimedBy === userId)
  );
}

/**
 * Validate a free-form repo reference (owner/name OR a full GitHub URL)
 * and return the canonical `owner/name`. Surface-level wrapper around
 * `normalizeRepoReference` so the route layer can stay schema-light.
 */
export function normalizeAttachableRepo(raw: string): string | null {
  const normalized = normalizeRepoReference(raw);
  return normalized ? normalized.fullName : null;
}

/**
 * Attach `fullName` as the PRIMARY repo for an idea (index 0 of
 * `targetRepos`). If the repo is already in the list at a non-zero
 * index, it's promoted to slot 0 (without inflating the list past
 * MAX_TARGET_REPOS). If it's already at slot 0, returns
 * `already-attached` (route maps to 409) so the caller can distinguish
 * a no-op from a successful write.
 */
export async function attachRepoToIdea(
  ideaId: string,
  userId: string,
  fullName: string,
): Promise<AttachRepoOutcome> {
  const holder: { value: AttachRepoOutcome | null } = { value: null };
  const now = new Date().toISOString();

  await mutateJsonlFile<IdeaRecord>(IDEAS_FILE, (current) => {
    const idx = current.findIndex((r) => r.id === ideaId);
    if (idx === -1) {
      holder.value = { kind: "not-found" };
      return current;
    }
    const before = current[idx]!;

    if (before.status === "rejected" || before.status === "archived") {
      holder.value = { kind: "not-mutable", reason: `idea is ${before.status}` };
      return current;
    }

    if (!canEditAttachments(before, userId)) {
      holder.value = { kind: "not-owner" };
      return current;
    }

    const existing = before.targetRepos;
    if (existing[0] === fullName) {
      holder.value = { kind: "already-attached", record: before };
      return current;
    }

    // Promote-or-prepend: strip any existing occurrence to avoid
    // duplicates, then put fullName at index 0. Trim to MAX_TARGET_REPOS.
    const without = existing.filter((entry) => entry !== fullName);
    const nextRepos = [fullName, ...without].slice(0, MAX_TARGET_REPOS);

    const updated: IdeaRecord = {
      ...before,
      targetRepos: nextRepos,
      updatedAt: now,
    };
    const next = [...current];
    next[idx] = updated;
    holder.value = { kind: "attached", record: updated };
    return next;
  });

  if (!holder.value) {
    throw new Error("attachRepoToIdea transaction did not produce a result");
  }
  return holder.value;
}

/**
 * Append `fullName` to the related-repos list (indices 1..). Refuses
 * to clobber the primary slot — if `targetRepos[0]` already holds
 * `fullName`, returns `already-attached`. If it appears anywhere
 * else in the list, returns `already-related`. Refuses to grow the
 * list past MAX_TARGET_REPOS with `limit-reached`.
 */
export async function addRelatedRepoToIdea(
  ideaId: string,
  userId: string,
  fullName: string,
): Promise<AttachRepoOutcome> {
  const holder: { value: AttachRepoOutcome | null } = { value: null };
  const now = new Date().toISOString();

  await mutateJsonlFile<IdeaRecord>(IDEAS_FILE, (current) => {
    const idx = current.findIndex((r) => r.id === ideaId);
    if (idx === -1) {
      holder.value = { kind: "not-found" };
      return current;
    }
    const before = current[idx]!;

    if (before.status === "rejected" || before.status === "archived") {
      holder.value = { kind: "not-mutable", reason: `idea is ${before.status}` };
      return current;
    }

    if (!canEditAttachments(before, userId)) {
      holder.value = { kind: "not-owner" };
      return current;
    }

    const existing = before.targetRepos;
    if (existing[0] === fullName) {
      holder.value = { kind: "already-attached", record: before };
      return current;
    }
    if (existing.includes(fullName)) {
      holder.value = { kind: "already-related", record: before };
      return current;
    }
    if (existing.length >= MAX_TARGET_REPOS) {
      holder.value = { kind: "limit-reached", record: before };
      return current;
    }

    const updated: IdeaRecord = {
      ...before,
      targetRepos: [...existing, fullName],
      updatedAt: now,
    };
    const next = [...current];
    next[idx] = updated;
    holder.value = { kind: "appended", record: updated };
    return next;
  });

  if (!holder.value) {
    throw new Error("addRelatedRepoToIdea transaction did not produce a result");
  }
  return holder.value;
}

// ---------------------------------------------------------------------------
// Brief — persisted markdown body of the idea's primary surface
// ---------------------------------------------------------------------------

/**
 * Hard cap on persisted brief markdown. ~50KB matches the task spec; in
 * practice authored briefs are 1-4KB, so the cap is generous-but-bounded
 * to keep the JSONL row size sane and the in-memory snapshot cheap.
 */
export const MAX_BRIEF_MARKDOWN = 50_000;

/**
 * Outcome class for `saveIdeaBrief`. Route mapping mirrors `claimIdea`:
 *   - "saved"     → 200 (write committed)
 *   - "not-found" → 404
 *   - "forbidden" → 403 (caller is not the claimer and not an admin)
 *   - "stale"     → 409 (optimistic-concurrency conflict)
 */
export type SaveIdeaBriefOutcome =
  | { kind: "saved"; record: IdeaRecord }
  | { kind: "not-found" }
  | { kind: "forbidden"; reason: string }
  | { kind: "stale"; currentVersion: number };

export interface SaveIdeaBriefInput {
  ideaId: string;
  /** Clerk user-id of the caller (already verified by the route). */
  userId: string;
  /** Whether the caller's profile.role is 'admin' (admin bypasses ownership). */
  isAdmin: boolean;
  /** Validated markdown — length-checked by the route before calling. */
  briefMarkdown: string;
  /**
   * Optional optimistic-concurrency token. If supplied, the writer rejects
   * with `stale` when the stored briefVersion is strictly greater. Omit on
   * first-ever save (record has no version yet) or to opt out of the check.
   */
  expectedVersion?: number;
}

/**
 * Persist an edited brief on an idea. Ownership rule:
 *   - the idea's `claimedBy` matches `userId`, OR
 *   - `isAdmin` is true.
 *
 * Otherwise returns `forbidden`. The version field is bumped atomically
 * inside the same `mutateJsonlFile` transaction that writes the markdown,
 * so two concurrent saves can't both see version N and both write N+1.
 */
export async function saveIdeaBrief(
  input: SaveIdeaBriefInput,
): Promise<SaveIdeaBriefOutcome> {
  const holder: { value: SaveIdeaBriefOutcome | null } = { value: null };
  const now = new Date().toISOString();

  await mutateJsonlFile<IdeaRecord>(IDEAS_FILE, (current) => {
    const idx = current.findIndex((r) => r.id === input.ideaId);
    if (idx === -1) {
      holder.value = { kind: "not-found" };
      return current;
    }
    const before = current[idx]!;

    // Ownership: claimer or admin. Author-without-claim cannot edit —
    // mirrors the Phase 4C model where the claimer "owns" build work.
    const isClaimer = !!before.claimedBy && before.claimedBy === input.userId;
    if (!isClaimer && !input.isAdmin) {
      holder.value = {
        kind: "forbidden",
        reason: before.claimedBy
          ? "idea is claimed by another user"
          : "claim the idea before saving its brief",
      };
      return current;
    }

    const storedVersion = before.briefVersion ?? 0;
    if (
      input.expectedVersion !== undefined &&
      input.expectedVersion < storedVersion
    ) {
      holder.value = { kind: "stale", currentVersion: storedVersion };
      return current;
    }

    const updated: IdeaRecord = {
      ...before,
      briefMarkdown: input.briefMarkdown,
      briefSavedAt: now,
      briefSavedBy: input.userId,
      briefVersion: storedVersion + 1,
      updatedAt: now,
    };
    const next = [...current];
    next[idx] = updated;
    holder.value = { kind: "saved", record: updated };
    return next;
  });

  if (!holder.value) {
    throw new Error("saveIdeaBrief transaction did not produce a result");
  }
  return holder.value;
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
