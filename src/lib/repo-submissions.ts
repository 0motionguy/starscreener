import { randomUUID } from "node:crypto";

import { getDerivedRepoByFullName } from "@/lib/derived-repos";
import {
  appendJsonlFile,
  readJsonlFile,
} from "@/lib/pipeline/storage/file-persistence";

export const REPO_SUBMISSIONS_FILE = "repo-submissions.jsonl";

const MAX_REASON_LENGTH = 600;
const MAX_CONTACT_LENGTH = 160;
const MAX_SHARE_URL_LENGTH = 300;

export type RepoSubmissionStatus = "pending";

export interface RepoSubmissionInput {
  repo: string;
  whyNow?: string | null;
  contact?: string | null;
  shareUrl?: string | null;
}

export interface RepoSubmissionRecord {
  id: string;
  fullName: string;
  normalizedFullName: string;
  repoUrl: string;
  whyNow: string | null;
  contact: string | null;
  shareUrl: string | null;
  boostedByShare: boolean;
  source: "web";
  status: RepoSubmissionStatus;
  submittedAt: string;
}

export interface PublicRepoSubmission {
  id: string;
  fullName: string;
  repoUrl: string;
  whyNow: string | null;
  shareUrl: string | null;
  boostedByShare: boolean;
  status: RepoSubmissionStatus;
  submittedAt: string;
}

export interface RepoSubmissionQueueSummary {
  pending: number;
  boosted: number;
  latestSubmittedAt: string | null;
}

export type RepoSubmissionResult =
  | {
      kind: "created";
      submission: PublicRepoSubmission;
      queue: RepoSubmissionQueueSummary;
    }
  | {
      kind: "duplicate";
      submission: PublicRepoSubmission;
      queue: RepoSubmissionQueueSummary;
    }
  | {
      kind: "already_tracked";
      repo: {
        fullName: string;
        repoPath: string;
      };
      queue: RepoSubmissionQueueSummary;
    };

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
    throw new Error("shareUrl must be a valid URL");
  }

  const host = parsed.hostname.toLowerCase();
  const validHost =
    host === "x.com" ||
    host === "www.x.com" ||
    host === "twitter.com" ||
    host === "www.twitter.com";
  if (!validHost) {
    throw new Error("shareUrl must be an x.com or twitter.com URL");
  }

  if (!parsed.pathname || parsed.pathname === "/") {
    throw new Error("shareUrl must point to a post");
  }

  const normalized = parsed.toString();
  if (normalized.length > MAX_SHARE_URL_LENGTH) {
    throw new Error(`shareUrl must be <= ${MAX_SHARE_URL_LENGTH} characters`);
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

  try {
    const shareUrl = shareRaw ? normalizeShareUrl(shareRaw) : null;
    return {
      ok: true,
      value: {
        repo,
        whyNow: whyNow || null,
        contact: contact || null,
        shareUrl,
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
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
  };
}

export async function listRepoSubmissions(): Promise<RepoSubmissionRecord[]> {
  const records = await readJsonlFile<RepoSubmissionRecord>(REPO_SUBMISSIONS_FILE);
  return records.sort(
    (a, b) => Date.parse(b.submittedAt) - Date.parse(a.submittedAt),
  );
}

export function summarizeRepoSubmissionQueue(
  records: RepoSubmissionRecord[],
): RepoSubmissionQueueSummary {
  const pending = records.filter((record) => record.status === "pending");
  const latestSubmittedAt =
    pending
      .map((record) => record.submittedAt)
      .sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;
  return {
    pending: pending.length,
    boosted: pending.filter((record) => record.boostedByShare).length,
    latestSubmittedAt,
  };
}

export async function submitRepoToQueue(
  input: RepoSubmissionInput,
): Promise<RepoSubmissionResult> {
  const normalized = normalizeRepoReference(input.repo);
  if (!normalized) {
    throw new Error(
      "repo must be a GitHub repo URL or owner/name, for example openai/openai-agents-python",
    );
  }

  const trackedRepo = getDerivedRepoByFullName(normalized.fullName);
  const existing = await listRepoSubmissions();
  const queueBefore = summarizeRepoSubmissionQueue(existing);

  if (trackedRepo) {
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
    status: "pending",
    submittedAt: new Date().toISOString(),
  };

  await appendJsonlFile(REPO_SUBMISSIONS_FILE, submission);
  const queueAfter = summarizeRepoSubmissionQueue([submission, ...existing]);

  return {
    kind: "created",
    submission: toPublicRepoSubmission(submission),
    queue: queueAfter,
  };
}
