import "server-only";

import { randomUUID } from "node:crypto";

import { getDerivedRepoByFullName } from "@/lib/derived-repos";
import { AdminRecoverableError } from "@/lib/errors";
import {
  appendSubmission,
  getSubmissionById as storeGetSubmissionById,
  readAllSubmissions,
  updateSubmissionById,
} from "@/lib/repo-submissions-store";

import { recordDropEvent } from "./drop-events";

import {
  REPO_SUBMISSION_CATEGORIES,
  REPO_SUBMISSION_TAGS,
  type PublicRepoSubmission,
  type RepoSubmissionCategory,
  type RepoSubmissionInput,
  type RepoSubmissionQueueSummary,
  type RepoSubmissionRecord,
  type RepoSubmissionResult,
  type RepoSubmissionStats,
  type RepoSubmissionStatus,
  type RepoSubmissionTag,
  type ScanChannelVerdict,
} from "./repo-submissions-types";

// Re-export types + constants for back-compat with existing consumers
// (admin routes, drop-events, revenue-submissions, the worker side via
// repo-intake). New code should import from repo-submissions-types directly.
export {
  REPO_SUBMISSION_CATEGORIES,
  REPO_SUBMISSION_TAGS,
};
export type {
  PublicRepoSubmission,
  RepoSubmissionCategory,
  RepoSubmissionInput,
  RepoSubmissionQueueSummary,
  RepoSubmissionRecord,
  RepoSubmissionResult,
  RepoSubmissionStats,
  RepoSubmissionStatus,
  RepoSubmissionTag,
  ScanChannelVerdict,
};

const MAX_REASON_LENGTH = 600;
const MAX_CONTACT_LENGTH = 160;
const MAX_SHARE_URL_LENGTH = 300;
const MAX_RELEASE_URL_LENGTH = 500;
const MAX_DEMO_URL_LENGTH = 500;
const MAX_TAGS = 4;

const TAG_SET: ReadonlySet<string> = new Set<string>(REPO_SUBMISSION_TAGS);

interface NormalizedRepoReference {
  fullName: string;
  normalizedFullName: string;
  repoUrl: string;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeMultiline(value: string): string {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

function stripDotGit(value: string): string {
  return value.endsWith(".git") ? value.slice(0, -4) : value;
}

function isValidRepoPart(value: string): boolean {
  return /^[A-Za-z0-9_.-]+$/.test(value);
}

export function normalizeRepoReference(
  raw: string,
): NormalizedRepoReference | null {
  const input = raw.trim();
  if (!input) return null;

  const bareMatch = input.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
  if (bareMatch) {
    const owner = bareMatch[1] ?? "";
    const name = stripDotGit(bareMatch[2] ?? "");
    if (!owner || !name || !isValidRepoPart(owner) || !isValidRepoPart(name)) {
      return null;
    }
    const fullName = `${owner}/${name}`;
    return {
      fullName,
      normalizedFullName: fullName.toLowerCase(),
      repoUrl: `https://github.com/${owner}/${name}`,
    };
  }

  const withProtocol = /^https?:\/\//i.test(input)
    ? input
    : `https://${input}`;

  let parsed: URL;
  try {
    parsed = new URL(withProtocol);
  } catch {
    return null;
  }

  const host = parsed.hostname.toLowerCase();
  if (host !== "github.com" && host !== "www.github.com") {
    return null;
  }

  const segments = parsed.pathname
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (segments.length < 2) return null;

  const owner = segments[0] ?? "";
  const name = stripDotGit(segments[1] ?? "");
  if (!owner || !name || !isValidRepoPart(owner) || !isValidRepoPart(name)) {
    return null;
  }

  const fullName = `${owner}/${name}`;
  return {
    fullName,
    normalizedFullName: fullName.toLowerCase(),
    repoUrl: `https://github.com/${owner}/${name}`,
  };
}

export function normalizeShareUrl(raw: string): string | null {
  const input = raw.trim();
  if (!input) return null;

  const withProtocol = /^https?:\/\//i.test(input)
    ? input
    : `https://${input}`;

  let parsed: URL;
  try {
    parsed = new URL(withProtocol);
  } catch {
    throw new AdminRecoverableError("shareUrl must be a valid URL");
  }

  const host = parsed.hostname.toLowerCase();
  const validHost =
    host === "x.com" ||
    host === "www.x.com" ||
    host === "twitter.com" ||
    host === "www.twitter.com";
  if (!validHost) {
    throw new AdminRecoverableError("shareUrl must be an x.com or twitter.com URL");
  }

  if (!parsed.pathname || parsed.pathname === "/") {
    throw new AdminRecoverableError("shareUrl must point to a post");
  }

  const normalized = parsed.toString();
  if (normalized.length > MAX_SHARE_URL_LENGTH) {
    throw new AdminRecoverableError(`shareUrl must be <= ${MAX_SHARE_URL_LENGTH} characters`);
  }

  return normalized;
}

export function validateRepoSubmissionInput(
  raw: unknown,
): { ok: true; value: RepoSubmissionInput } | { ok: false; error: string } {
  if (raw === null || typeof raw !== "object") {
    return { ok: false, error: "body must be a JSON object" };
  }

  const body = raw as Record<string, unknown>;
  if (typeof body.repo !== "string") {
    return { ok: false, error: "repo is required" };
  }

  const repo = body.repo.trim();
  if (!repo) {
    return { ok: false, error: "repo is required" };
  }

  const whyNow =
    typeof body.whyNow === "string"
      ? normalizeMultiline(body.whyNow)
      : body.whyNow == null
        ? ""
        : null;
  if (whyNow === null) {
    return { ok: false, error: "whyNow must be a string" };
  }
  if (whyNow.length > MAX_REASON_LENGTH) {
    return {
      ok: false,
      error: `whyNow must be <= ${MAX_REASON_LENGTH} characters`,
    };
  }

  const contact =
    typeof body.contact === "string"
      ? normalizeWhitespace(body.contact)
      : body.contact == null
        ? ""
        : null;
  if (contact === null) {
    return { ok: false, error: "contact must be a string" };
  }
  if (contact.length > MAX_CONTACT_LENGTH) {
    return {
      ok: false,
      error: `contact must be <= ${MAX_CONTACT_LENGTH} characters`,
    };
  }

  const shareRaw =
    typeof body.shareUrl === "string"
      ? body.shareUrl.trim()
      : body.shareUrl == null
        ? ""
        : null;
  if (shareRaw === null) {
    return { ok: false, error: "shareUrl must be a string" };
  }

  // ---- 2026-05-16 mockup-extension fields (all optional, schema-gated)
  let category: RepoSubmissionCategory | null = null;
  if (body.category !== undefined && body.category !== null && body.category !== "") {
    if (
      typeof body.category !== "string" ||
      !REPO_SUBMISSION_CATEGORIES.includes(
        body.category as RepoSubmissionCategory,
      )
    ) {
      return {
        ok: false,
        error: `category must be one of ${REPO_SUBMISSION_CATEGORIES.join(", ")}`,
      };
    }
    category = body.category as RepoSubmissionCategory;
  }

  const tags: RepoSubmissionTag[] = [];
  if (body.tags !== undefined && body.tags !== null) {
    if (!Array.isArray(body.tags)) {
      return { ok: false, error: "tags must be an array" };
    }
    if (body.tags.length > MAX_TAGS) {
      return {
        ok: false,
        error: `tags must contain at most ${MAX_TAGS} entries`,
      };
    }
    const seen = new Set<string>();
    for (const t of body.tags) {
      if (typeof t !== "string" || !TAG_SET.has(t)) {
        return {
          ok: false,
          error: `tags must be from the known set (${REPO_SUBMISSION_TAGS.join(", ")})`,
        };
      }
      if (seen.has(t)) continue;
      seen.add(t);
      tags.push(t as RepoSubmissionTag);
    }
  }

  const releaseRaw =
    typeof body.releaseUrl === "string"
      ? body.releaseUrl.trim()
      : body.releaseUrl == null
        ? ""
        : null;
  if (releaseRaw === null) {
    return { ok: false, error: "releaseUrl must be a string" };
  }
  if (releaseRaw.length > MAX_RELEASE_URL_LENGTH) {
    return {
      ok: false,
      error: `releaseUrl must be <= ${MAX_RELEASE_URL_LENGTH} characters`,
    };
  }
  let releaseUrl: string | null = null;
  if (releaseRaw) {
    try {
      const parsed = new URL(releaseRaw);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        return { ok: false, error: "releaseUrl must be http(s)" };
      }
      releaseUrl = parsed.toString();
    } catch {
      return { ok: false, error: "releaseUrl must be a valid URL" };
    }
  }

  const demoRaw =
    typeof body.demoUrl === "string"
      ? body.demoUrl.trim()
      : body.demoUrl == null
        ? ""
        : null;
  if (demoRaw === null) {
    return { ok: false, error: "demoUrl must be a string" };
  }
  if (demoRaw.length > MAX_DEMO_URL_LENGTH) {
    return {
      ok: false,
      error: `demoUrl must be <= ${MAX_DEMO_URL_LENGTH} characters`,
    };
  }
  let demoUrl: string | null = null;
  if (demoRaw) {
    try {
      const parsed = new URL(demoRaw);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        return { ok: false, error: "demoUrl must be http(s)" };
      }
      demoUrl = parsed.toString();
    } catch {
      return { ok: false, error: "demoUrl must be a valid URL" };
    }
  }

  try {
    const shareUrl = shareRaw ? normalizeShareUrl(shareRaw) : null;
    return {
      ok: true,
      value: {
        repo,
        whyNow: whyNow || null,
        contact: contact || null,
        shareUrl,
        category,
        tags: tags.length > 0 ? tags : null,
        releaseUrl,
        demoUrl,
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Compute the public contact disclosure. Emails NEVER appear on the public
 * record — they stay on the private store so we can DM the submitter later.
 * Bare @handles and prefixed handles ARE public (the submitter typed them
 * to be found).
 */
function publicContactFromRaw(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Crude but effective email detection — any local@domain shape is treated
  // as private. We deliberately don't try to be clever about edge cases
  // (e.g., handles with dots): when in doubt, default private.
  const looksLikeEmail =
    !trimmed.startsWith("@") &&
    trimmed.includes("@") &&
    /@[^\s@]+\.[^\s@]+$/.test(trimmed);
  if (looksLikeEmail) return null;
  return trimmed.startsWith("@") ? trimmed : `@${trimmed}`;
}

export function toPublicRepoSubmission(
  record: RepoSubmissionRecord,
): PublicRepoSubmission {
  return {
    id: record.id,
    fullName: record.fullName,
    repoUrl: record.repoUrl,
    whyNow: record.whyNow,
    shareUrl: record.shareUrl,
    boostedByShare: record.boostedByShare,
    status: record.status,
    submittedAt: record.submittedAt,
    intakeTriggeredAt: record.intakeTriggeredAt ?? null,
    lastScanAt: record.lastScanAt ?? null,
    lastScanError: record.lastScanError ?? null,
    matchesFound: record.matchesFound ?? 0,
    repoPath: record.repoPath ?? null,
    category: record.category ?? null,
    tags: record.tags ?? [],
    releaseUrl: record.releaseUrl ?? null,
    demoUrl: record.demoUrl ?? null,
    scanChannels: record.scanChannels ?? [],
    publicContact: publicContactFromRaw(record.contact),
  };
}

export async function listRepoSubmissions(): Promise<RepoSubmissionRecord[]> {
  return readAllSubmissions();
}

// Synthetic test/smoke submissions (e2e probes + manual QA drops like
// `dorp-email-smoke-*`, `test-repo-*`) live in the same store as real drops.
// Hide them from public surfaces — the live queue and the hero stats — while
// keeping them visible to admin tooling for debugging.
const SYNTHETIC_SUBMISSION_PATTERN =
  /(?:^|\/)(?:dorp-|test-repo-\d)|-smoke-\d/i;

export function isSyntheticTestSubmission(
  record: Pick<RepoSubmissionRecord, "normalizedFullName">,
): boolean {
  return SYNTHETIC_SUBMISSION_PATTERN.test(record.normalizedFullName);
}

/** Public-facing submission list — excludes synthetic test/smoke entries. */
export async function listPublicRepoSubmissions(): Promise<
  RepoSubmissionRecord[]
> {
  const records = await readAllSubmissions();
  return records.filter((record) => !isSyntheticTestSubmission(record));
}

export function summarizeRepoSubmissionQueue(
  records: RepoSubmissionRecord[],
): RepoSubmissionQueueSummary {
  const active = records.filter(
    (record) =>
      record.status === "pending" ||
      record.status === "queued" ||
      record.status === "scanning" ||
      record.status === "ingested" ||
      record.status === "matched",
  );
  const latestSubmittedAt =
    active
      .map((record) => record.submittedAt)
      .sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;
  return {
    pending: active.length,
    queued: records.filter((record) => record.status === "queued").length,
    scanning: records.filter((record) => record.status === "scanning").length,
    listed: records.filter((record) => record.status === "listed").length,
    failed: records.filter((record) => record.status === "scan_failed").length,
    boosted: active.filter((record) => record.boostedByShare).length,
    latestSubmittedAt,
  };
}

export async function getRepoSubmissionById(
  id: string,
): Promise<RepoSubmissionRecord | null> {
  return storeGetSubmissionById(id);
}

export async function updateRepoSubmissionRecord(
  id: string,
  patch: Partial<
    Pick<
      RepoSubmissionRecord,
      | "status"
      | "intakeTriggeredAt"
      | "lastScanAt"
      | "lastScanError"
      | "matchesFound"
      | "repoPath"
      | "scanChannels"
    >
  >,
): Promise<RepoSubmissionRecord> {
  const updated = await updateSubmissionById(id, patch);
  if (!updated) {
    throw new AdminRecoverableError(`repo submission not found: ${id}`, { id });
  }
  return updated;
}

export async function submitRepoToQueue(
  input: RepoSubmissionInput,
): Promise<RepoSubmissionResult> {
  const normalized = normalizeRepoReference(input.repo);
  if (!normalized) {
    throw new AdminRecoverableError(
      "repo must be a GitHub repo URL or owner/name, for example openai/openai-agents-python",
    );
  }

  const trackedRepo = getDerivedRepoByFullName(normalized.fullName);
  const existing = await readAllSubmissions();
  const queueBefore = summarizeRepoSubmissionQueue(existing);

  if (trackedRepo) {
    try {
      await recordDropEvent({ kind: "already_tracked", fullName: normalized.fullName });
    } catch (err) {
      console.warn("[repo-submissions] recordDropEvent failed:", err);
    }
    return {
      kind: "already_tracked",
      repo: {
        fullName: trackedRepo.fullName,
        repoPath: `/repo/${trackedRepo.owner}/${trackedRepo.name}`,
      },
      queue: queueBefore,
    };
  }

  const duplicate = existing.find(
    (record) => record.normalizedFullName === normalized.normalizedFullName,
  );
  if (duplicate) {
    try {
      await recordDropEvent({ kind: "duplicate", fullName: normalized.fullName });
    } catch (err) {
      console.warn("[repo-submissions] recordDropEvent failed:", err);
    }
    return {
      kind: "duplicate",
      submission: toPublicRepoSubmission(duplicate),
      queue: queueBefore,
    };
  }

  const submission: RepoSubmissionRecord = {
    id: randomUUID(),
    fullName: normalized.fullName,
    normalizedFullName: normalized.normalizedFullName,
    repoUrl: normalized.repoUrl,
    whyNow: input.whyNow ?? null,
    contact: input.contact ?? null,
    shareUrl: input.shareUrl ?? null,
    boostedByShare: Boolean(input.shareUrl),
    source: "web",
    status: "queued",
    submittedAt: new Date().toISOString(),
    intakeTriggeredAt: null,
    lastScanAt: null,
    lastScanError: null,
    matchesFound: 0,
    repoPath: null,
    category: input.category ?? null,
    tags: input.tags ?? null,
    releaseUrl: input.releaseUrl ?? null,
    demoUrl: input.demoUrl ?? null,
    scanChannels: [],
  };

  await appendSubmission(submission);
  const queueAfter = summarizeRepoSubmissionQueue([submission, ...existing]);

  try {
    await recordDropEvent({ kind: "created", fullName: normalized.fullName });
  } catch (err) {
    console.warn("[repo-submissions] recordDropEvent failed:", err);
  }
  return {
    kind: "created",
    submission: toPublicRepoSubmission(submission),
    queue: queueAfter,
  };
}

// ---------------------------------------------------------------------------
// DORP hero stats — Track 6
//
// Computed at request time off the in-Redis submission log. Tiny dataset
// (capped at 1000 records, low-thousands per month worst case) → no caching
// needed; the page is already `force-dynamic`.
// ---------------------------------------------------------------------------

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

function ttlHoursForRecord(record: RepoSubmissionRecord): number | null {
  if (record.status !== "listed" && record.status !== "matched") return null;
  const finishedAtIso = record.lastScanAt ?? record.intakeTriggeredAt;
  if (!finishedAtIso) return null;
  const startedAt = Date.parse(record.submittedAt);
  const finishedAt = Date.parse(finishedAtIso);
  if (!Number.isFinite(startedAt) || !Number.isFinite(finishedAt)) return null;
  if (finishedAt < startedAt) return null;
  return (finishedAt - startedAt) / MS_PER_HOUR;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

export async function computeSubmissionStats(): Promise<RepoSubmissionStats> {
  // Public marketing stats — never count synthetic test/smoke entries.
  const records = (await readAllSubmissions()).filter(
    (record) => !isSyntheticTestSubmission(record),
  );
  const now = Date.now();
  const weekAgo = now - 7 * MS_PER_DAY;
  const monthAgo = now - 30 * MS_PER_DAY;

  const droppedThisWeek = records.filter((r) => {
    const submittedMs = Date.parse(r.submittedAt);
    return Number.isFinite(submittedMs) && submittedMs >= weekAgo;
  }).length;

  // % listed under 24h: of submissions that are older than 24h (they had
  // their chance to land), what fraction reached "listed" within 24h.
  const eligible = records.filter((r) => {
    const submittedMs = Date.parse(r.submittedAt);
    return Number.isFinite(submittedMs) && submittedMs <= now - MS_PER_DAY;
  });
  const listedUnder24h = eligible.filter((r) => {
    const ttl = ttlHoursForRecord(r);
    return ttl !== null && ttl <= 24;
  }).length;
  const percentListedUnder24h =
    eligible.length > 0
      ? Math.round((listedUnder24h / eligible.length) * 100)
      : 0;

  // Median TTL over the last 30 days of listed submissions.
  const recentTtls = records
    .filter((r) => {
      const submittedMs = Date.parse(r.submittedAt);
      return Number.isFinite(submittedMs) && submittedMs >= monthAgo;
    })
    .map(ttlHoursForRecord)
    .filter((v): v is number => v !== null);

  const medianTtl = median(recentTtls);

  return {
    droppedThisWeek,
    percentListedUnder24h,
    medianTtlHours: medianTtl !== null ? Math.round(medianTtl * 10) / 10 : null,
  };
}
